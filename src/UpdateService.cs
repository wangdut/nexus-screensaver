using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;

namespace Nexus
{
    internal sealed class UpdateOffer
    {
        public Version Version; public string Tag,Name,Download,Checksum,Digest; public long Size;
    }
    internal static class UpdateService
    {
        internal const string Repository="https://github.com/wangdut/nexus-screensaver";
        internal static readonly Version Current=Assembly.GetExecutingAssembly().GetName().Version;
        static UpdateOffer cached; static DateTime checkedAt=DateTime.MinValue;
        internal static Func<HttpClient> TestClient=null;
        static HttpClient Client(){if(Preferences.TestMode&&TestClient!=null)return TestClient();ServicePointManager.SecurityProtocol|=SecurityProtocolType.Tls12;var c=new HttpClient();c.Timeout=TimeSpan.FromMinutes(4);c.DefaultRequestHeaders.UserAgent.ParseAdd("NEXUS-Screensaver/"+Current.ToString(3));return c;}
        internal static bool IsInstalledProcess { get {return Preferences.Installed&&String.Equals(Path.GetFullPath(Program.Root).TrimEnd('\\'),Path.GetFullPath(Preferences.InstalledRoot).TrimEnd('\\'),StringComparison.OrdinalIgnoreCase);} }
        internal static async Task<UpdateOffer> Check(bool force,CancellationToken token)
        {
            if(!force&&(DateTime.UtcNow-checkedAt).TotalHours<6)return cached;
            using(var timeout=CancellationTokenSource.CreateLinkedTokenSource(token))using(var client=Client()){
                timeout.CancelAfter(TimeSpan.FromSeconds(10));
                string json=System.Text.Encoding.UTF8.GetString(await Read(client,"https://api.github.com/repos/wangdut/nexus-screensaver/releases/latest",2*1024*1024,timeout.Token));
                cached=Parse(json,Current);checkedAt=DateTime.UtcNow;return cached;
            }
        }
        internal static UpdateOffer Parse(string json,Version current)
        {
            var data=Preferences.Json.Deserialize<Dictionary<string,object>>(json);
            if(Convert.ToBoolean(data["draft"])||Convert.ToBoolean(data["prerelease"]))return null;
            string tag=Convert.ToString(data["tag_name"]);Version version;
            if(!Version.TryParse(tag.TrimStart('v'),out version))throw new InvalidDataException("版本信息无效。");
            version=new Version(version.Major,version.Minor,Math.Max(0,version.Build),Math.Max(0,version.Revision));
            if(version<=current)return null;
            string name="NEXUS-Windows-x64-v"+version.ToString(3).ReplaceSuffix(".0","")+".zip";
            var assets=((IEnumerable)data["assets"]).Cast<Dictionary<string,object>>().ToList();
            var zip=assets.FirstOrDefault(a=>Convert.ToString(a["name"])==name);var hash=assets.FirstOrDefault(a=>Convert.ToString(a["name"])==name+".sha256");
            if(zip==null||hash==null)throw new InvalidDataException("新版本尚未提供完整更新包，请稍后重试。");
            var offer=new UpdateOffer{Version=version,Tag=tag,Name=name,Download=Convert.ToString(zip["browser_download_url"]),Checksum=Convert.ToString(hash["browser_download_url"]),Size=Convert.ToInt64(zip["size"]),Digest=zip.ContainsKey("digest")?Convert.ToString(zip["digest"]):""};
            string prefix=Repository+"/releases/download/"+tag+"/";
            if(offer.Download!=prefix+name||offer.Checksum!=prefix+name+".sha256"||offer.Size<=0||offer.Size>100*1024*1024)throw new InvalidDataException("更新来源或大小不正确。");
            return offer;
        }
        static string ReplaceSuffix(this string value,string suffix,string replacement){return value.EndsWith(suffix)?value.Substring(0,value.Length-suffix.Length)+replacement:value;}
        static async Task<byte[]> Read(HttpClient client,string url,int limit,CancellationToken token)
        {
            using(var response=await client.GetAsync(url,HttpCompletionOption.ResponseHeadersRead,token)){
                response.EnsureSuccessStatusCode();if(response.Content.Headers.ContentLength>limit)throw new InvalidDataException("更新响应过大。");
                using(var source=await response.Content.ReadAsStreamAsync())using(var output=new MemoryStream()){
                    byte[] buffer=new byte[65536];int count;while((count=await source.ReadAsync(buffer,0,buffer.Length,token))>0){if(output.Length+count>limit)throw new InvalidDataException("更新响应过大。");output.Write(buffer,0,count);}return output.ToArray();
                }
            }
        }
        internal static void VerifyHash(byte[] bytes,string checksum,string digest,string name)
        {
            var parts=checksum.Trim().Split(new[]{' ','\t','\r','\n'},StringSplitOptions.RemoveEmptyEntries);
            if(parts.Length!=2||parts[0].Length!=64||parts[1].TrimStart('*')!=name)throw new InvalidDataException("校验文件无效。");
            using(var sha=SHA256.Create()){
                string actual=BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","");
                if(!String.Equals(actual,parts[0],StringComparison.OrdinalIgnoreCase)||(!String.IsNullOrEmpty(digest)&&!String.Equals("sha256:"+actual,digest,StringComparison.OrdinalIgnoreCase)))throw new InvalidDataException("下载校验失败，原版本保持不变。");
            }
        }
        internal static void Extract(byte[] bytes,string folder)
        {
            string root=Path.GetFullPath(folder).TrimEnd('\\')+"\\";long size=0;var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using(var archive=new ZipArchive(new MemoryStream(bytes),ZipArchiveMode.Read)){
                if(archive.Entries.Count>300)throw new InvalidDataException("更新包文件数异常。");
                foreach(var entry in archive.Entries){
                    string relative=entry.FullName.Replace('/','\\');string full=Path.GetFullPath(Path.Combine(root,relative));
                    if(relative.Contains(":")||!full.StartsWith(root,StringComparison.OrdinalIgnoreCase)||!paths.Add(full))throw new InvalidDataException("更新包含非法路径。");
                    size+=entry.Length;if(size>200*1024*1024)throw new InvalidDataException("更新包解压大小异常。");
                    if(relative.EndsWith("\\"))continue;Directory.CreateDirectory(Path.GetDirectoryName(full));using(var input=entry.Open())using(var output=File.Create(full))input.CopyTo(output);
                }
            }
        }
        internal static void VerifyManifest(string folder,Version version)
        {
            var data=Preferences.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(folder,"manifest.json")));
            if(Convert.ToString(data["product"])!="NexusScreensaver"||Convert.ToString(data["version"])!=version.ToString(3))throw new InvalidDataException("更新包版本不匹配。");
            string root=Path.GetFullPath(folder).TrimEnd('\\')+"\\";var names=new HashSet<string>();
            foreach(Dictionary<string,object> item in (IEnumerable)data["files"]){
                string name=Convert.ToString(item["path"]),full=Path.GetFullPath(Path.Combine(root,name));
                if(!full.StartsWith(root,StringComparison.OrdinalIgnoreCase)||name.Contains(":")||!names.Add(name))throw new InvalidDataException("文件清单路径无效。");
                using(var sha=SHA256.Create())using(var input=File.OpenRead(full)){string hash=BitConverter.ToString(sha.ComputeHash(input)).Replace("-","");if(!String.Equals(hash,Convert.ToString(item["sha256"]),StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("文件清单校验失败。");}
            }
            foreach(string name in new[]{"Nexus.exe","Nexus.scr","Install.ps1","ApplyUpdate.ps1","Deployment.ps1","web/index.html","web/app.js"})if(!names.Contains(name))throw new InvalidDataException("更新包缺少必需文件。");
            if(new Version(FileVersionInfo.GetVersionInfo(Path.Combine(folder,"Nexus.exe")).FileVersion)!=version)throw new InvalidDataException("程序版本不匹配。");
        }
        internal static async Task<string> Prepare(UpdateOffer offer,IProgress<string> progress,CancellationToken token)
        {
            if(!IsInstalledProcess)throw new InvalidOperationException("便携版请下载新包；安装版支持一键更新。");
            string updates=Path.Combine(Program.Data,"Updates"),job=Path.Combine(updates,"job-"+Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(updates);
            foreach(string stale in Directory.GetDirectories(updates,"job-*")){
                Guid id;if(!Guid.TryParseExact(Path.GetFileName(stale).Substring(4),"N",out id))continue;
                if(HasLinks(stale))continue;
                if(Directory.GetLastWriteTimeUtc(stale)<DateTime.UtcNow.AddDays(-1)){try{Directory.Delete(stale,true);}catch{}}
            }
            Directory.CreateDirectory(job);
            try{
                using(var timeout=CancellationTokenSource.CreateLinkedTokenSource(token))using(var client=Client()){
                    timeout.CancelAfter(TimeSpan.FromMinutes(3));progress.Report("检查下载连接并获取校验文件…");
                    string checksum=System.Text.Encoding.UTF8.GetString(await Read(client,offer.Checksum,4096,timeout.Token));
                    progress.Report("正在下载新版本，当前程序继续运行…");byte[] bytes=await Read(client,offer.Download,100*1024*1024,timeout.Token);
                    if(bytes.LongLength!=offer.Size)throw new InvalidDataException("下载不完整，原版本保持不变。");VerifyHash(bytes,checksum,offer.Digest,offer.Name);
                    progress.Report("正在校验并准备更新…");string package=Path.Combine(job,"package");
                    await Task.Run(()=>{Extract(bytes,package);VerifyManifest(package,offer.Version);},timeout.Token);
                    timeout.Token.ThrowIfCancellationRequested();File.Copy(Path.Combine(Program.Root,"ApplyUpdate.ps1"),Path.Combine(job,"ApplyUpdate.ps1"));return job;
                }
            }catch{try{Directory.Delete(job,true);}catch{}throw;}
        }
        internal static void Launch(string job)
        {
            string script=Path.Combine(job,"ApplyUpdate.ps1"),package=Path.Combine(job,"package");
            var info=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell\\v1.0\\powershell.exe"),"-NoProfile -ExecutionPolicy Bypass -File \""+script+"\" -Package \""+package+"\" -ParentProcess "+Process.GetCurrentProcess().Id){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Program.Data};
            Process.Start(info);ApplicationExit();
        }
        static void ApplicationExit(){System.Windows.Forms.Application.Exit();}
        static bool HasLinks(string folder){if((File.GetAttributes(folder)&FileAttributes.ReparsePoint)!=0)return true;foreach(string child in Directory.GetDirectories(folder)){if(HasLinks(child))return true;}return false;}
    }
}
