using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Nexus
{
    internal sealed class TrayContext : ApplicationContext
    {
        internal static readonly string Scope="Local\\NexusDesktop-"+System.Security.Principal.WindowsIdentity.GetCurrent().User.Value;
        readonly NotifyIcon icon=new NotifyIcon();
        readonly System.Windows.Forms.Timer events=new System.Windows.Forms.Timer();
        readonly EventWaitHandle show=new EventWaitHandle(false,EventResetMode.AutoReset,Scope+"-show"),settings=new EventWaitHandle(false,EventResetMode.AutoReset,Scope+"-settings"),quit=new EventWaitHandle(false,EventResetMode.AutoReset,Scope+"-quit");
        UniverseForm explorer; SettingsForm settingsForm; bool exiting;
        [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr h,int command);
        internal TrayContext(bool background,bool openSettings)
        {
            icon.Icon=File.Exists(Path.Combine(Program.Root,"nexus.ico"))?new Icon(Path.Combine(Program.Root,"nexus.ico")):SystemIcons.Application;icon.Text="NEXUS · 星核实验室";icon.Visible=true;
            var menu=new ContextMenuStrip();menu.Items.Add("打开交互体验",null,delegate{OpenExplorer();});menu.Items.Add("偏好设置…",null,delegate{OpenSettings();});menu.Items.Add("立即启动屏保",null,delegate{Process.Start(Path.Combine(Program.Root,"Nexus.scr"),"/s");});
            menu.Items.Add(new ToolStripSeparator());menu.Items.Add("停止体验窗口的音乐",null,delegate{if(explorer!=null)explorer.StopMusic();});menu.Items.Add("Windows 屏保设置…",null,delegate{Process.Start("rundll32.exe","shell32.dll,Control_RunDLL desk.cpl,,@screensaver");});
            menu.Items.Add(new ToolStripSeparator());menu.Items.Add("退出 NEXUS 托盘",null,delegate{ExitThread();});icon.ContextMenuStrip=menu;icon.DoubleClick+=delegate{OpenSettings();};
            events.Interval=250;events.Tick+=delegate{if(quit.WaitOne(0)){ExitThread();return;}if(settings.WaitOne(0))OpenSettings();if(show.WaitOne(0))OpenExplorer();};events.Start();
            if(openSettings)OpenSettings();else if(!background)OpenExplorer();
        }
        void OpenExplorer(){if(explorer==null||explorer.IsDisposed){explorer=new UniverseForm(false,IntPtr.Zero,null);explorer.FormClosed+=delegate{explorer=null;if(!exiting&&!Preferences.GetBool("CloseToTray",true))ExitThread();};explorer.Show();}ShowWindow(explorer.Handle,9);explorer.Activate();}
        void OpenSettings(){if(settingsForm==null||settingsForm.IsDisposed){settingsForm=new SettingsForm();settingsForm.Show();}ShowWindow(settingsForm.Handle,9);settingsForm.Activate();}
        protected override void ExitThreadCore(){if(exiting)return;exiting=true;events.Stop();events.Dispose();icon.Visible=false;icon.Dispose();if(explorer!=null)explorer.Close();if(settingsForm!=null)settingsForm.Close();show.Dispose();settings.Dispose();quit.Dispose();base.ExitThreadCore();}
        internal static bool Signal(string command){try{using(var handle=EventWaitHandle.OpenExisting(Scope+"-"+command))return handle.Set();}catch(WaitHandleCannotBeOpenedException){return false;}}
    }
}
