using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.WinForms;

internal static class NativeRhythmTests
{
    const BindingFlags Static=BindingFlags.NonPublic|BindingFlags.Static,Instance=BindingFlags.NonPublic|BindingFlags.Instance;
    static Type type;static WebView2 web;static Form form,second;static List<string> results=new List<string>();
    [STAThread] static void Main(){
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        string root=AppDomain.CurrentDomain.BaseDirectory,id=Guid.NewGuid().ToString("N");var assembly=Assembly.LoadFrom(Path.Combine(root,"Nexus.exe"));
        var program=assembly.GetType("Nexus.Program");program.GetField("Data",Static).SetValue(null,Path.Combine(root,"rhythm-profile-"+id));
        var prefs=assembly.GetType("Nexus.Preferences");string key="Software\\NexusScreensaver.Tests\\Rhythm-"+id;prefs.GetField("Key",Static).SetValue(null,key);prefs.GetField("TestMode",Static).SetValue(null,true);prefs.GetMethod("SetBool",Static).Invoke(null,new object[]{"PureMode",false});
        type=assembly.GetType("Nexus.UniverseForm");form=MakeForm(false);web=(WebView2)type.GetField("web",Instance).GetValue(form);
        form.Shown+=async delegate{
            try{
                await Ready(web);
                await Source(web,"system");await Until(web,"nexusRhythm.getState().capturing",5000);
                if(type.GetField("loopback",Instance).GetValue(form)==null)throw new Exception("Native capture missing");
                using(var player=Process.Start(new ProcessStartInfo(Path.Combine(root,"SpectrumTests.exe"),"--emit 750"){UseShellExecute=false,CreateNoWindow=true})){
                    await Until(web,"nexusRhythm.getState().energy>.02 && nexusRhythm.getState().mid>nexusRhythm.getState().high",7000);
                    while(!player.HasExited)await Task.Delay(100);
                }results.Add("External process audio crosses WASAPI, native message bridge and renderer");
                await Task.Delay(1900);await Until(web,"nexusRhythm.getState().energy<.001",4000);results.Add("System silence decays in the actual renderer");
                await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('pauseButton').click()");await Task.Delay(300);
                if(type.GetField("loopback",Instance).GetValue(form)!=null)throw new Exception("Paused renderer retained native capture");
                await web.CoreWebView2.ExecuteScriptAsync("document.getElementById('pauseButton').click()");await Until(web,"nexusRhythm.getState().capturing",5000);results.Add("Pause releases native capture; resume reopens it");
                form.WindowState=FormWindowState.Minimized;await Task.Delay(500);if(type.GetField("loopback",Instance).GetValue(form)!=null)throw new Exception("Minimized window retained capture");
                form.WindowState=FormWindowState.Normal;await Task.Delay(800);if(type.GetField("loopback",Instance).GetValue(form)==null)throw new Exception("Restore did not reopen capture");results.Add("Native minimize and restore release and reacquire capture");
                // Simulate endpoint loss at the bridge boundary without changing the user's devices.
                var timer=(System.Windows.Forms.Timer)type.GetField("rhythmTimer",Instance).GetValue(form);timer.Stop();await Task.Delay(100);
                web.CoreWebView2.PostWebMessageAsJson("{\"type\":\"rhythm\",\"source\":\"system\",\"sequence\":-99,\"status\":\"unavailable\",\"rms\":0,\"bands\":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}");
                await Until(web,"nexusRhythm.getState().status==='unavailable'",2000);
                timer.Start();await Until(web,"['silent','live'].includes(nexusRhythm.getState().status)",3000);results.Add("Injected unavailable-device notification is displayed; a resumed real capture frame recovers status");
                await Source(web,"off");await Task.Delay(200);if(type.GetField("loopback",Instance).GetValue(form)!=null)throw new Exception("Off retained capture");results.Add("Off releases native capture");
                // Two real WebViews share the same profile, settings and capture engine.
                second=MakeForm(false);second.Show();var other=(WebView2)type.GetField("web",Instance).GetValue(second);await Ready(other);
                await Source(web,"system");await Until(other,"nexusRhythm.getState().source==='system'&&nexusRhythm.getState().capturing",5000);
                if(!Object.ReferenceEquals(type.GetField("loopback",Instance).GetValue(form),type.GetField("loopback",Instance).GetValue(second)))throw new Exception("Multiple windows opened independent capture engines");results.Add("Source preference synchronizes across WebViews; system analysis uses one shared capture engine");
                await Source(web,"radio");await Until(other,"nexusRhythm.getState().source==='radio'",3000);
                type.GetField("saver",Instance).SetValue(form,true);type.GetField("audioOwner",Instance).SetValue(second,false);
                var windows=(IList)program.GetField("Windows",Static).GetValue(null);windows.Add(form);windows.Add(second);
                other.CoreWebView2.Navigate("https://nexus.local/index.html?screensaver=1&audio=0&pure=0");await Task.Delay(400);await Ready(other);
                await web.CoreWebView2.ExecuteScriptAsync("chrome.webview.postMessage(JSON.stringify({id:'test',action:'rhythmRelay',bands:Array(32).fill(.5),rms:.02,status:'live'}))");
                await Until(other,"nexusRhythm.getState().energy>.05",2000);
                await Until(other,"!nexusRadio.getState().playing && !nexusRadio.getState().busy",1000);results.Add("Primary-screen spectrum reaches a secondary WebView without playing duplicate audio");
                await Task.Delay(1800);await Until(other,"nexusRhythm.getState().energy<.001",3000);results.Add("A stale primary-screen signal fades away");
                web.CoreWebView2.Navigate("https://nexus.local/index.html?preview=1");await Task.Delay(400);await Ready(web);await Until(web,"!nexusRhythm.getState().capturing&&nexusRhythm.getState().energy===0",1000);results.Add("Preview disables analysis after navigation");
                type.GetField("saver",Instance).SetValue(form,false);second.Close();second=null;
            }catch(Exception error){results.Add("FAIL "+error);Environment.ExitCode=1;}
            finally{try{Registry.CurrentUser.DeleteSubKeyTree(key);}catch{}var json=new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(results);File.WriteAllText(Path.Combine(root,"native-rhythm-results.json"),json);Console.WriteLine(json);if(second!=null)second.Close();form.Close();}
        };Application.Run(form);
    }
    static Form MakeForm(bool saver){var f=(Form)Activator.CreateInstance(type,Instance,null,new object[]{saver,IntPtr.Zero,saver?Screen.PrimaryScreen:null},null);f.Width=900;f.Height=640;f.TopMost=false;return f;}
    static async Task Ready(WebView2 view){for(int i=0;i<100&&view.CoreWebView2==null;i++)await Task.Delay(100);await Until(view,"Boolean(window.nexus?.getState().ready && window.nexusRhythm)",15000);}
    static async Task Source(WebView2 view,string source){await view.CoreWebView2.ExecuteScriptAsync("document.getElementById('rhythmSource').value='"+source+"';document.getElementById('rhythmSource').dispatchEvent(new Event('change'))");}
    static async Task Until(WebView2 view,string expression,int timeout){for(int i=0;i<timeout;i+=100){if(await view.CoreWebView2.ExecuteScriptAsync(expression)=="true")return;await Task.Delay(100);}throw new Exception("Timeout "+expression+"; "+await view.CoreWebView2.ExecuteScriptAsync("window.nexusRhythm?.getState()"));}
}
