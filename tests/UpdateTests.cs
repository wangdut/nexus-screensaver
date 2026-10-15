using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Nexus;

internal class UpdateTests
{
    static List<object> results=new List<object>();
    static byte[] package;static string checksum;static string name="NEXUS-Windows-x64-v1.2.zip";
    static void Pass(string test){results.Add(new{test=test,pass=true});}
    static void Require(bool value,string text){if(!value)throw new Exception(text);}
    static void Reject(Action action,string label){try{action();}catch(InvalidDataException){Pass(label);return;}throw new Exception("Expected rejection: "+label);}
    [STAThread]static void Main(){try{Run().GetAwaiter().GetResult();}catch(Exception e){results.Add(new{test="updater",pass=false,error=e.ToString()});Environment.ExitCode=1;}string json=Preferences.Json.Serialize(results);File.WriteAllText(Path.Combine(Program.Root,"update-tests.json"),json);Console.WriteLine(json);}
    static async Task Run(){
        string project=Directory.GetParent(Program.Root.TrimEnd('\\')).FullName;
        package=File.ReadAllBytes(Path.Combine(project,name));using(var sha=SHA256.Create())checksum=BitConverter.ToString(sha.ComputeHash(package)).Replace("-","")+"  "+name;
        string url=UpdateService.Repository+"/releases/download/v1.2.0/"+name;
        var payload=new{tag_name="v1.2.0",draft=false,prerelease=false,assets=new[]{new{name=name,browser_download_url=url,size=package.Length,digest="sha256:"+checksum.Split(' ')[0]},new{name=name+".sha256",browser_download_url=url+".sha256",size=94,digest=""}}};
        string json=Preferences.Json.Serialize(payload);var offer=UpdateService.Parse(json,new Version(1,1,0,0));Require(offer!=null&&offer.Version==new Version(1,2,0,0),"New version not detected");Pass("Semantic newer stable release detected");
        Require(UpdateService.Parse(json,new Version(1,2,0,0))==null,"Downgrade offered");Require(UpdateService.Parse(json.Replace("\"prerelease\":false","\"prerelease\":true"),new Version(1,1,0,0))==null,"Prerelease offered");Pass("Current, older and prerelease versions excluded");
        Reject(()=>UpdateService.Parse(json.Replace("github.com/wangdut/","example.com/wangdut/"),new Version(1,1,0,0)),"Foreign update sources rejected");
        UpdateService.VerifyHash(package,checksum,"",name);Pass("Valid ZIP checksum accepted");
        Reject(()=>UpdateService.VerifyHash(new byte[]{1,2,3},checksum,"",name),"Corrupt or truncated downloads rejected");
        Reject(()=>UpdateService.VerifyHash(package,checksum,"sha256:bad",name),"GitHub asset digest mismatch rejected");
        string data=Path.Combine(project,"tests","update-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(data);
        typeof(Program).GetField("Data",BindingFlags.NonPublic|BindingFlags.Static).SetValue(null,data);Preferences.InstalledRoot=Program.Root;Preferences.TestMode=true;
        byte[] traversal;using(var ms=new MemoryStream()){using(var zip=new ZipArchive(ms,ZipArchiveMode.Create,true)){var entry=zip.CreateEntry("../outside.txt");using(var w=new StreamWriter(entry.Open()))w.Write("bad");}traversal=ms.ToArray();}
        Reject(()=>UpdateService.Extract(traversal,Path.Combine(data,"malicious")),"ZIP path traversal rejected");Require(!File.Exists(Path.Combine(data,"outside.txt")),"Path escaped");
        UpdateService.TestClient=()=>new HttpClient(new MockHandler(json,false));
        string job=await UpdateService.Prepare(offer,new Progress<string>(),CancellationToken.None);
        Require(File.Exists(Path.Combine(job,"package","Nexus.exe"))&&File.Exists(Path.Combine(job,"ApplyUpdate.ps1")),"Preparation incomplete");Pass("Downloaded package, manifest and updater fully prepared before shutdown");
        File.AppendAllText(Path.Combine(job,"package","web","app.js"),"modified");Reject(()=>UpdateService.VerifyManifest(Path.Combine(job,"package"),offer.Version),"Tampered extracted files rejected");Directory.Delete(job,true);
        UpdateService.TestClient=()=>new HttpClient(new MockHandler(json,true));
        bool offline=false;try{await UpdateService.Check(true,CancellationToken.None);}catch(HttpRequestException){offline=true;}Require(offline,"Offline check did not fail");Pass("Offline check exits without changing installation");
        try{await UpdateService.Prepare(offer,new Progress<string>(),CancellationToken.None);}catch(HttpRequestException){}
        Require(Directory.GetDirectories(Path.Combine(data,"Updates")).Length==0,"Failed download retained temporary job");Pass("Failed download cleans temporary job");
        UpdateService.TestClient=()=>new HttpClient(new MockHandler(json,false));using(var cancel=new CancellationTokenSource()){cancel.Cancel();try{await UpdateService.Prepare(offer,new Progress<string>(),cancel.Token);}catch(OperationCanceledException){}}
        Require(Directory.GetDirectories(Path.Combine(data,"Updates")).Length==0,"Cancelled download retained job");Pass("Cancellation preserves program and cleans temporary job");
    }
    sealed class MockHandler:HttpMessageHandler{
        readonly string json;readonly bool offline;internal MockHandler(string json,bool offline){this.json=json;this.offline=offline;}
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token){token.ThrowIfCancellationRequested();if(offline)throw new HttpRequestException("Simulated offline network");byte[] body=request.RequestUri.AbsolutePath.EndsWith(".sha256")?Encoding.UTF8.GetBytes(checksum):request.RequestUri.AbsolutePath.EndsWith(".zip")?package:Encoding.UTF8.GetBytes(json);return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new ByteArrayContent(body)});}
    }
}
