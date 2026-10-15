using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace Nexus
{
    internal static class Preferences
    {
        internal static string Key = @"Software\NexusScreensaver";
        internal static string Desktop = @"Control Panel\Desktop";
        internal static string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        internal static string InstalledRoot = Path.Combine(Program.Data, "App");
        internal static bool TestMode=false;
        internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024 };
        [DllImport("user32.dll", SetLastError=true)] private static extern bool SystemParametersInfo(uint action,uint value,IntPtr data,uint flags);
        internal static bool GetBool(string name, bool fallback)
        {
            using(var key=Registry.CurrentUser.OpenSubKey(Key)) { object value=key==null?null:key.GetValue(name); return value==null?fallback:Convert.ToString(value)=="1"; }
        }
        internal static void SetBool(string name,bool value) { using(var key=Registry.CurrentUser.CreateSubKey(Key)) key.SetValue(name,value?1:0,RegistryValueKind.DWord); }
        internal static bool Installed { get { return File.Exists(Path.Combine(InstalledRoot,"Nexus.scr")); } }
        internal static bool Startup
        {
            get { using(var key=Registry.CurrentUser.OpenSubKey(RunKey)) return key!=null && String.Equals(Convert.ToString(key.GetValue("NexusScreensaver")),"\""+Path.Combine(InstalledRoot,"Nexus.exe")+"\" --tray",StringComparison.OrdinalIgnoreCase); }
            set { if(value&&!Installed)throw new InvalidOperationException("请先运行 Install.cmd 完成安装，再启用开机启动。"); using(var key=Registry.CurrentUser.CreateSubKey(RunKey)){if(value)key.SetValue("NexusScreensaver","\""+Path.Combine(InstalledRoot,"Nexus.exe")+"\" --tray");else key.DeleteValue("NexusScreensaver",false);} }
        }
        internal static bool Enabled { get { using(var key=Registry.CurrentUser.OpenSubKey(Desktop)) return key!=null && Convert.ToString(key.GetValue("ScreenSaveActive"))=="1" && String.Equals(Convert.ToString(key.GetValue("SCRNSAVE.EXE")),Path.Combine(InstalledRoot,"Nexus.scr"),StringComparison.OrdinalIgnoreCase); } }
        internal static int Minutes { get { using(var key=Registry.CurrentUser.OpenSubKey(Desktop)) { int seconds;return key!=null&&Int32.TryParse(Convert.ToString(key.GetValue("ScreenSaveTimeOut")),out seconds)?Math.Max(1,Math.Min(240,seconds/60)):5; } } }
        internal static void ConfigureSaver(bool enabled,int minutes)
        {
            if(!Installed)throw new InvalidOperationException("请先安装 NEXUS。便携体验不会修改系统屏保。");
            if(minutes<1||minutes>240)throw new ArgumentOutOfRangeException("minutes");
            using(var key=Registry.CurrentUser.CreateSubKey(Desktop))
            {
                if(!enabled&&!String.Equals(Convert.ToString(key.GetValue("SCRNSAVE.EXE")),Path.Combine(InstalledRoot,"Nexus.scr"),StringComparison.OrdinalIgnoreCase))return;
                key.SetValue("SCRNSAVE.EXE",Path.Combine(InstalledRoot,"Nexus.scr"));key.SetValue("ScreenSaveTimeOut",(minutes*60).ToString());key.SetValue("ScreenSaveActive",enabled?"1":"0");
            }
            if(!TestMode&&(!SystemParametersInfo(15,(uint)(minutes*60),IntPtr.Zero,3)||!SystemParametersInfo(17,enabled?1u:0u,IntPtr.Zero,3)))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        internal static object Snapshot() { return new {installed=Installed,startup=Startup,enabled=Enabled,minutes=Minutes,closeToTray=GetBool("CloseToTray",true),allScreens=GetBool("AllScreens",true),pure=GetBool("PureMode",true),exitOnInput=GetBool("ExitOnInput",false),musicAuto=GetBool("MusicAuto",false)}; }
    }
}
