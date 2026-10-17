using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.WinForms;

internal static class NativeAudioTests
{
    const BindingFlags Static=BindingFlags.NonPublic|BindingFlags.Static;
    const BindingFlags Instance=BindingFlags.NonPublic|BindingFlags.Instance;
    [STAThread] static void Main(string[] args)
    {
        string root=AppDomain.CurrentDomain.BaseDirectory;
        string scope="Local\\NexusDesktop-"+System.Security.Principal.WindowsIdentity.GetCurrent().User.Value+"-audio";
        if(args.Length>0&&args[0]=="--hold-lock") {using(var mutex=new Mutex(false,scope)){if(!mutex.WaitOne(2000))Environment.Exit(2);Console.WriteLine("READY");Console.ReadLine();mutex.ReleaseMutex();}return;}
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        var assembly=Assembly.LoadFrom(Path.Combine(root,"Nexus.exe"));
        var program=assembly.GetType("Nexus.Program");
        string data=Path.Combine(root,"native-audio-test-profile");Directory.CreateDirectory(data);
        program.GetField("Data",Static).SetValue(null,data);
        var prefs=assembly.GetType("Nexus.Preferences");string key="Software\\NexusScreensaver.Tests\\Audio-"+Guid.NewGuid().ToString("N");
        prefs.GetField("Key",Static).SetValue(null,key);prefs.GetField("TestMode",Static).SetValue(null,true);
        prefs.GetMethod("SetBool",Static).Invoke(null,new object[]{"MusicAuto",true});
        var type=assembly.GetType("Nexus.UniverseForm");var form=(Form)Activator.CreateInstance(type,Instance,null,new object[]{false,IntPtr.Zero,null},null);
        WebView2 web=(WebView2)type.GetField("web",Instance).GetValue(form);
        var results=new List<object>();Process holder=null;
        form.Shown+=async delegate {
            try {
                for(int i=0;i<100&&web.CoreWebView2==null;i++)await Task.Delay(100);
                await Until(web,"Boolean(window.nexusRadio && window.nexus?.getState().ready)",15000);
                var info=new ProcessStartInfo(Application.ExecutablePath,"--hold-lock"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true};
                holder=Process.Start(info);string ready=await holder.StandardOutput.ReadLineAsync();if(ready!="READY")throw new Exception("External lock holder failed");
                if((bool)type.GetMethod("AcquireAudio",Instance).Invoke(form,null))throw new Exception("Concurrent process acquired owned audio");
                holder.StandardInput.WriteLine();if(!holder.WaitForExit(3000))throw new Exception("Lock helper stuck");holder.Dispose();holder=null;
                if(!(bool)type.GetMethod("AcquireAudio",Instance).Invoke(form,null))throw new Exception("Audio was not released");type.GetMethod("ReleaseAudio",Instance).Invoke(form,null);
                results.Add(new {test="Cross-process audio ownership blocks overlap and releases cleanly",pass=true});
                var radio=assembly.GetType("Nexus.RadioService");
                var all=(object[])await (Task<object>)radio.GetMethod("Search",Static).Invoke(null,new object[]{""});
                if(all.Length!=2)throw new Exception("Native allowlist count mismatch");
                bool rejected=false;try{radio.GetMethod("Resolve",Static).Invoke(null,new object[]{"unknown"});}catch(TargetInvocationException){rejected=true;}
                if(!rejected)throw new Exception("Native bridge resolved unreviewed station");
                foreach(var blocked in new[]{"https://evil.test/live.mp3","https://lzlive.vojs.cn/other/92/live.m3u8","http://lzlive.vojs.cn/2wtSfrS/92/live.m3u8","https://lzlive.vojs.cn/2wtSfrS/92/live.m3u8?redirect=1"})
                    if((bool)radio.GetMethod("AllowsResource",Static).Invoke(null,new object[]{blocked}))throw new Exception("Native resource guard accepted "+blocked);
                results.Add(new {test="Native search/resolve and resource guard restrict stations and sources",pass=true});
                await CheckStream(web,"js-classic-975","江苏经典流行音乐广播","https://lzlive.vojs.cn/2wtSfrS/92/live.m3u8",true);
                results.Add(new {test="Official FM97.5 HLS advances for five seconds in Windows WebView2",pass=true,state=await web.CoreWebView2.ExecuteScriptAsync("nexusRadio.getState()")});
                await web.CoreWebView2.ExecuteScriptAsync("nexusRadio.stop()");
                await CheckStream(web,"js-music-897","江苏音乐广播","https://lzlive.vojs.cn/jAmO6Ng/92/live.m3u8",true);
                results.Add(new {test="Official FM89.7 HLS advances for five seconds in Windows WebView2",pass=true,state=await web.CoreWebView2.ExecuteScriptAsync("nexusRadio.getState()")});
                await web.CoreWebView2.ExecuteScriptAsync("nexusRadio.stop()");
                await CheckStream(web,"d3eda505-e9d9-4c43-bb42-dae83d9566f6","forged","https://evil.test/live.mp3",false);
                await Until(web,"nexusRadio.getState().station.id==='js-classic-975' && nexusRadio.getState().station.url.startsWith('https://lzlive.vojs.cn/')",1000);
                results.Add(new {test="Old favorite migrates to canonical official stream, ignoring arbitrary saved URL",pass=true});
                await web.CoreWebView2.ExecuteScriptAsync("nexusRadio.stop();localStorage.setItem('nexus.radio.v1',JSON.stringify({volume:12,muted:true,station:{id:'unreviewed',name:'江苏音乐广播',url:'https://lzlive.vojs.cn/jAmO6Ng/92/live.m3u8'}}))");
                web.CoreWebView2.Navigate("https://nexus.local/index.html?screensaver=1&audio=1&pure=1");await Task.Delay(1500);
                await Until(web,"Boolean(window.nexusRadio) && nexusRadio.getState().station===null && !nexusRadio.getState().playing && !nexusRadio.getState().busy",5000);
                results.Add(new {test="Unreviewed saved station cannot autoplay even with an approved name and URL",pass=true});
                prefs.GetMethod("SetBool",Static).Invoke(null,new object[]{"MusicAuto",false});
                await web.CoreWebView2.ExecuteScriptAsync("localStorage.setItem('nexus.radio.v1',JSON.stringify({volume:12,muted:true,auto:true,station:{id:'js-classic-975'}}))");
                web.CoreWebView2.Navigate("https://nexus.local/index.html?screensaver=1&audio=1&pure=1");await Task.Delay(800);
                await Until(web,"Boolean(window.nexusRadio && window.nexus?.getState().ready)",15000);await Task.Delay(1200);
                await Until(web,"nexusRadio.getState().station.id==='js-classic-975'&&!nexusRadio.getState().auto&&!nexusRadio.getState().playing&&!nexusRadio.getState().busy",3000);
                results.Add(new {test="Disabling autoplay leaves screensaver silent",pass=true});
            }catch(Exception e){results.Add(new {test="Native audio integration",pass=false,error=e.ToString()});Environment.ExitCode=1;}
            finally{if(holder!=null){if(!holder.HasExited)holder.Kill();holder.Dispose();}try{Registry.CurrentUser.DeleteSubKeyTree(key);}catch{}var json=new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(results);File.WriteAllText(Path.Combine(root,"native-audio-results.json"),json);Console.WriteLine(json);form.Close();}
        };
        Application.Run(form);
    }
    static async Task Until(WebView2 web,string expression,int timeout){for(int elapsed=0;elapsed<timeout;elapsed+=200){try{if(await web.CoreWebView2.ExecuteScriptAsync(expression)=="true")return;}catch{}await Task.Delay(200);}throw new Exception("Timeout: "+expression+"; "+await web.CoreWebView2.ExecuteScriptAsync("({state:window.nexusRadio?.getState(),status:document.getElementById('radioStatus')?.textContent})"));}
    static async Task CheckStream(WebView2 web,string id,string name,string url,bool hls){
        var json=new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new {volume=12,muted=true,auto=true,favorites=new object[0],station=new {id=id,name=name,url=url,hls=hls}});
        await web.CoreWebView2.ExecuteScriptAsync("localStorage.setItem('nexus.radio.v1',JSON.stringify("+json+"))");
        web.CoreWebView2.Navigate("https://nexus.local/index.html?screensaver=1&audio=1&pure=1");await Task.Delay(800);
        await Until(web,"Boolean(window.nexusRadio?.getState().playing && nexusRadio.getState().muted && nexusRadio.getState().currentTime>0.6)",55000);
        string before=await web.CoreWebView2.ExecuteScriptAsync("nexusRadio.getState().currentTime");await Task.Delay(5000);
        await Until(web,"nexusRadio.getState().playing && nexusRadio.getState().muted && nexusRadio.getState().currentTime > ("+before+" + 3)",5000);
    }
}
