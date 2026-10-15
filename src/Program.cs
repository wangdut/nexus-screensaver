using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Nexus
{
    internal static class Program
    {
        internal static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
        internal static readonly string Data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NexusScreensaver");
        internal static bool Smoke;
        internal static bool RadioSmoke;
        internal static bool UpdateHealth;
        internal static readonly List<UniverseForm> Windows = new List<UniverseForm>();
        [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr value);
        [DllImport("user32.dll")] private static extern IntPtr GetWindowDpiAwarenessContext(IntPtr window);
        [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);

        [STAThread]
        private static void Main(string[] args)
        {
            try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Directory.CreateDirectory(Data);
            Application.ThreadException += delegate(object sender, ThreadExceptionEventArgs e) { Log(e.Exception); };
            AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e) { Log(e.ExceptionObject as Exception); };
            string first = args.Length > 0 ? args[0].ToLowerInvariant() : "";
            string mode = first.Split(':')[0];
            UpdateHealth=mode=="--update-healthcheck";
            RadioSmoke=mode=="--radio-smoke";Smoke = mode == "--smoke-test" || RadioSmoke || UpdateHealth;
            try
            {
                if (mode == "--shutdown") { TrayContext.Signal("quit"); return; }
                if (mode == "/c" || mode == "-c") { Application.Run(new SettingsForm()); return; }
                if (mode == "/p" || mode == "-p")
                {
                    string handleText = first.Contains(":") ? first.Substring(first.IndexOf(':') + 1) : args.Length > 1 ? args[1] : "0";
                    long handle;
                    if (!long.TryParse(handleText, out handle) || handle == 0) return;
                    try { SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(new IntPtr(handle))); } catch { }
                    Application.Run(new UniverseForm(false, new IntPtr(handle), null)); return;
                }
                bool saver = mode == "/s" || mode == "-s" || (first == "" && Path.GetExtension(Application.ExecutablePath).Equals(".scr", StringComparison.OrdinalIgnoreCase));
                if (saver)
                {
                    bool created;
                    using (Mutex mutex = new Mutex(true, "Local\\NexusInteractiveScreensaver", out created))
                    {
                        if (!created) return;
                        foreach (Screen screen in Preferences.GetBool("AllScreens",true) ? Screen.AllScreens : new Screen[] {Screen.PrimaryScreen}) Windows.Add(new UniverseForm(true, IntPtr.Zero, screen));
                        foreach (UniverseForm window in Windows) window.Show();
                        Windows[0].Activate();
                        Application.Run();
                    }
                }
                else if(Smoke) Application.Run(new UniverseForm(false, IntPtr.Zero, null));
                else {
                    bool created;
                    using(var mutex=new Mutex(true,TrayContext.Scope,out created)) {
                        if(!created){TrayContext.Signal(mode=="--settings"?"settings":"show");return;}
                        Application.Run(new TrayContext(mode=="--tray",mode=="--settings"));
                    }
                }
            }
            catch (Exception error)
            {
                Log(error);
                if (!Smoke) MessageBox.Show("NEXUS 无法启动。\n" + error.Message, "NEXUS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Environment.ExitCode = 1;
            }
        }
        internal static void ExitAll() { Application.Exit(); }
        internal static void Log(Exception error)
        {
            try { File.AppendAllText(Path.Combine(Data, "nexus.log"), DateTime.Now.ToString("s") + " " + error + Environment.NewLine); } catch { }
        }
    }

    internal class UniverseForm : ThemedForm
    {
        private readonly WebView2 web = new WebView2();
        private readonly bool saver;
        private readonly IntPtr parent;
        private readonly bool audioOwner;
        private readonly DateTime started=DateTime.UtcNow;
        private Mutex audioMutex;
        private bool ownsAudio;
        private bool fullscreen;
        private Rectangle windowBounds;
        private FormWindowState windowState;
        private readonly System.Windows.Forms.Timer parentTimer = new System.Windows.Forms.Timer();
        private readonly System.Windows.Forms.Timer smokeTimer = new System.Windows.Forms.Timer();
        private readonly Label loading = new Label();
        [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetParent(IntPtr child, IntPtr parent);
        [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr child);
        [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr window, int index);
        [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr window, int index, int value);
        [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr window, out RECT rect);
        [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
        [DllImport("kernel32.dll")] private static extern uint SetThreadExecutionState(uint flags);
        [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left, Top, Right, Bottom; }

        internal UniverseForm(bool screensaver, IntPtr previewParent, Screen screen)
        {
            saver = screensaver; parent = previewParent; audioOwner=previewParent==IntPtr.Zero&&(!screensaver||screen.Primary);
            Text = "NEXUS · 星核实验室";
            BackColor = Color.FromArgb(6, 11, 17);
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(1280, 800);
            MinimumSize = new Size(320, 360);
            KeyPreview = true;
            if (File.Exists(Path.Combine(Program.Root, "nexus.ico"))) Icon = new Icon(Path.Combine(Program.Root, "nexus.ico"));
            if (saver)
            {
                FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.Manual;
                Bounds = screen.Bounds; TopMost = true; ShowInTaskbar = false; fullscreen = true;
            }
            if (parent != IntPtr.Zero)
            {
                FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; MinimumSize = Size.Empty;
            }
            loading.Text = "N E X U S\n\n正在点亮星核…";
            loading.ForeColor = Color.FromArgb(120, 229, 224);
            loading.Dock = DockStyle.Fill; loading.TextAlign = ContentAlignment.MiddleCenter;
            loading.Font = new Font("Segoe UI", 16); Controls.Add(loading);
            web.Dock = DockStyle.Fill; web.DefaultBackgroundColor = BackColor;
            web.Visible = false; Controls.Add(web);
            Shown += async delegate { if (parent != IntPtr.Zero) AttachPreview(); await InitializeWeb(); };
            FormClosed += delegate
            {
                ReleaseAudio(); parentTimer.Stop(); parentTimer.Dispose(); smokeTimer.Stop(); smokeTimer.Dispose(); web.Dispose();
                if (saver) Program.ExitAll();
            };
            if (Program.Smoke)
            {
                smokeTimer.Interval = Program.RadioSmoke ? 110000 : 20000;
                smokeTimer.Tick += delegate { File.WriteAllText(Path.Combine(Program.Root, "native-smoke.json"), "{\"error\":\"timeout\"}"); Environment.ExitCode = 1; Close(); };
                smokeTimer.Start();
            }
        }
        private void AttachPreview()
        {
            SetWindowLong(Handle, -16, (GetWindowLong(Handle, -16) | 0x40000000) & ~unchecked((int)0x80000000));
            SetParent(Handle, parent);
            if (GetParent(Handle) != parent) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Cannot attach screensaver preview.");
            FitPreview();
            parentTimer.Interval = 400; parentTimer.Tick += delegate { if (!IsWindow(parent)) Close(); else FitPreview(); }; parentTimer.Start();
        }
        private void FitPreview()
        {
            RECT rect;
            if (GetClientRect(parent, out rect)) Bounds = new Rectangle(0, 0, Math.Max(1, rect.Right), Math.Max(1, rect.Bottom));
        }
        private async Task InitializeWeb()
        {
            try
            {
                string site = Path.Combine(Program.Root, "web");
                if (!File.Exists(Path.Combine(site, "index.html"))) throw new FileNotFoundException("缺少 web 文件夹，请完整解压 NEXUS 发布包。");
                // Same origin and profile preserve preferences between explorer and screensaver.
                CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, Program.UpdateHealth?Path.Combine(Directory.GetParent(Program.Root.TrimEnd('\\')).FullName,"HealthCheck"):Program.RadioSmoke?Path.Combine(Program.Root,"radio-test-profile"):Path.Combine(Program.Data, "WebView"), new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required"));
                await web.EnsureCoreWebView2Async(environment);
                web.CoreWebView2.SetVirtualHostNameToFolderMapping("nexus.local", site, CoreWebView2HostResourceAccessKind.DenyCors);
                web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                web.CoreWebView2.Settings.AreDevToolsEnabled = false;
                web.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
                web.CoreWebView2.Settings.IsStatusBarEnabled = false;
                web.CoreWebView2.Settings.IsZoomControlEnabled = false;
                web.CoreWebView2.Settings.IsPinchZoomEnabled = false;
                web.CoreWebView2.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs e) { e.State = CoreWebView2PermissionState.Deny; };
                web.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) { e.Handled = true; };
                web.CoreWebView2.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e) { if (!e.Uri.StartsWith("https://nexus.local/", StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
                web.CoreWebView2.WebMessageReceived += async delegate(object sender, CoreWebView2WebMessageReceivedEventArgs e)
                {
                    if (!e.Source.StartsWith("https://nexus.local/", StringComparison.OrdinalIgnoreCase)) return;
                    string action = e.TryGetWebMessageAsString();
                    if (action.StartsWith("{")) { await HandleRequest(action); return; }
                    if (action == "settings") { using(var settings=new SettingsForm())settings.ShowDialog(this); return; }
                    if (action == "input" && saver && Preferences.GetBool("ExitOnInput",false) && (DateTime.UtcNow-started).TotalSeconds>2) { Program.ExitAll(); return; }
                    if (action == "exit") { if (saver) Program.ExitAll(); else if (fullscreen) ToggleFullscreen(); else Close(); }
                    if (action == "fullscreen" && !saver && parent == IntPtr.Zero) ToggleFullscreen();
                    if (action == "ready")
                    {
                        loading.Visible = false; web.Visible = true;
                        if (parent == IntPtr.Zero) web.Focus();
                        if (Program.Smoke)
                        {
                            if(Program.UpdateHealth){smokeTimer.Stop();Close();return;}
                            if(Program.RadioSmoke){await TestRadio();return;}
                            smokeTimer.Stop(); await Task.Delay(2500);
                            string state = await web.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.nexus.getState())");
                            File.WriteAllText(Path.Combine(Program.Root, "native-smoke.json"), state);
                            using (FileStream output = File.Create(Path.Combine(Program.Root, "native-smoke.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, output);
                            Close();
                        }
                    }
                };
                web.CoreWebView2.ProcessFailed += delegate(object sender, CoreWebView2ProcessFailedEventArgs e)
                {
                    Program.Log(new Exception("WebView2 process: " + e.ProcessFailedKind));
                    if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited) { if (saver) Program.ExitAll(); else Close(); }
                };
                string query = parent != IntPtr.Zero || Program.UpdateHealth ? "?preview=1" : saver ? "?screensaver=1" : "";
                if(saver){query+="&audio="+(audioOwner?"1":"0")+"&pure="+(Preferences.GetBool("PureMode",true)?"1":"0");}
                web.CoreWebView2.Navigate("https://nexus.local/index.html" + query);
            }
            catch (Exception error)
            {
                Program.Log(error); Environment.ExitCode = 1;
                loading.Text = "星核暂时无法点亮\n\n请确认已安装 Microsoft Edge WebView2 Runtime，\n并完整解压发布包。\n\n" + error.Message;
                loading.Font = new Font("Microsoft YaHei UI", 11);
            }
        }
        private async Task TestRadio() {
            string result=await web.CoreWebView2.ExecuteScriptAsync(@"(async()=>{
                const sleep=ms=>new Promise(r=>setTimeout(r,ms));
                document.getElementById('radioMute').click();
                if(!window.nexusRadio.getState().muted)document.getElementById('radioMute').click();
                document.getElementById('radioButton').click();
                for(let i=0;i<150&&!document.querySelector('.station-select');i++)await sleep(200);
                const count=document.querySelectorAll('.station-select').length;
                for(let index=0;index<Math.min(5,count);index++){
                    document.querySelectorAll('.station-select')[index].click();
                    for(let i=0;i<75;i++){await sleep(200);if(window.nexusRadio.getState().playing){await sleep(1300);return {ok:true,...window.nexusRadio.getState()};}}
                }
                return {ok:false,...window.nexusRadio.getState(),directory:document.getElementById('directoryStatus').textContent,status:document.getElementById('radioStatus').textContent};
            })()");
            // ExecuteScriptAsync does not await promises; retrieve a stable completion marker instead.
            await web.CoreWebView2.ExecuteScriptAsync(@"window.__radioTestDone=false; (async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<475;i++){if(nexusRadio.getState().playing){await sleep(1800);window.__radioTestResult={ok:true,...nexusRadio.getState()};window.__radioTestDone=true;return;}await sleep(200);}window.__radioTestResult={ok:false,...nexusRadio.getState(),status:document.getElementById('radioStatus').textContent,directory:document.getElementById('directoryStatus').textContent};window.__radioTestDone=true;})()");
            for(int i=0;i<490;i++){await Task.Delay(200);if(IsDisposed)return;string done=await web.CoreWebView2.ExecuteScriptAsync("window.__radioTestDone");if(done=="true")break;}
            smokeTimer.Stop();result=await web.CoreWebView2.ExecuteScriptAsync("window.__radioTestResult");File.WriteAllText(Path.Combine(Program.Root,"radio-smoke.json"),result);
            using(var output=File.Create(Path.Combine(Program.Root,"radio-smoke.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,output);
            await web.CoreWebView2.ExecuteScriptAsync("nexusRadio.stop()");if(result==null||!result.Contains("\"ok\":true"))Environment.ExitCode=1;Close();
        }
        internal async void StopMusic() { try { if(web.CoreWebView2!=null)await web.CoreWebView2.ExecuteScriptAsync("window.nexusRadio?.stop()"); } catch(Exception error){Program.Log(error);} }
        private async Task HandleRequest(string message)
        {
            string id="";
            try {
                var request=Preferences.Json.Deserialize<Dictionary<string,object>>(message);
                id=Convert.ToString(request["id"]);string action=Convert.ToString(request["action"]);object result=null;
                if(action=="preferences") result=Preferences.Snapshot();
                else if(action=="radioSearch") result=await RadioService.Search(request.ContainsKey("query")?Convert.ToString(request["query"]):"");
                else if(action=="radioResolve") result=await RadioService.Resolve(Convert.ToString(request["station"]));
                else if(action=="radioClick") {await RadioService.Click(Convert.ToString(request["station"]));result=true;}
                else if(action=="audioAcquire") { result=AcquireAudio(); }
                else if(action=="audioRelease") { ReleaseAudio();result=true; }
                else if(action=="musicAuto") {Preferences.SetBool("MusicAuto",Convert.ToBoolean(request["value"]));result=true;}
                else throw new InvalidOperationException("Unsupported request.");
                if(!IsDisposed&&web.CoreWebView2!=null)web.CoreWebView2.PostWebMessageAsJson(Preferences.Json.Serialize(new {id=id,result=result}));
            } catch(Exception error) { if(!IsDisposed&&web.CoreWebView2!=null)web.CoreWebView2.PostWebMessageAsJson(Preferences.Json.Serialize(new {id=id,error=error.Message})); }
        }
        private bool AcquireAudio() { if(!audioOwner)return false;if(ownsAudio)return true;audioMutex=new Mutex(false,TrayContext.Scope+"-audio");try{ownsAudio=audioMutex.WaitOne(0);}catch(AbandonedMutexException){ownsAudio=true;}if(!ownsAudio){audioMutex.Dispose();audioMutex=null;}return ownsAudio; }
        private void ReleaseAudio() { if(ownsAudio&&audioMutex!=null){audioMutex.ReleaseMutex();ownsAudio=false;}if(audioMutex!=null){audioMutex.Dispose();audioMutex=null;} }
        private void ToggleFullscreen()
        {
            if (fullscreen)
            {
                fullscreen = false; FormBorderStyle = FormBorderStyle.Sizable; TopMost = false;
                WindowState = FormWindowState.Normal; Bounds = windowBounds; WindowState = windowState;
                SetThreadExecutionState(0x80000000);
            }
            else
            {
                windowBounds = Bounds; windowState = WindowState; fullscreen = true;
                WindowState = FormWindowState.Normal; FormBorderStyle = FormBorderStyle.None;
                Bounds = Screen.FromControl(this).Bounds; TopMost = true;
                // Manual exhibitions stay awake. System screensaver mode follows Windows power policy.
                SetThreadExecutionState(0x80000003);
            }
        }
    }

}
