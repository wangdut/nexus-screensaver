using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace Nexus
{
    internal sealed class SettingsForm : Form
    {
        readonly CheckBox enabled=new CheckBox(),startup=new CheckBox(),tray=new CheckBox(),allScreens=new CheckBox(),pure=new CheckBox(),exitInput=new CheckBox(),music=new CheckBox();
        readonly NumericUpDown minutes=new NumericUpDown();
        readonly Label status=new Label();
        internal SettingsForm()
        {
            Text="NEXUS · 屏幕保护程序设置";ClientSize=new Size(660,730);MinimumSize=new Size(550,480);StartPosition=FormStartPosition.CenterScreen;
            Font=new Font("Microsoft YaHei UI",10);BackColor=Color.FromArgb(10,20,29);ForeColor=Color.FromArgb(222,237,243);AutoScaleMode=AutoScaleMode.Dpi;
            if(File.Exists(Path.Combine(Program.Root,"nexus.ico")))Icon=new Icon(Path.Combine(Program.Root,"nexus.ico"));
            var layout=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=4,Padding=new Padding(26)};
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute,55));layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,45));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,48));Controls.Add(layout);
            layout.Controls.Add(new Label{Text="NEXUS  /  偏好设置",Font=new Font(Font.FontFamily,20),AutoSize=true},0,0);
            var body=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true};layout.Controls.Add(body,0,1);
            AddHeader(body,"启动与系统屏保");
            ConfigureCheck(body,enabled,"启用 NEXUS 系统屏保",Preferences.Enabled);
            var timeoutRow=new FlowLayoutPanel{Width=490,Height=42};timeoutRow.Controls.Add(new Label{Text="闲置后启动（分钟）",AutoSize=true,Padding=new Padding(0,5,14,0)});minutes.Minimum=1;minutes.Maximum=240;minutes.Value=Preferences.Minutes;minutes.Width=100;minutes.Enabled=Preferences.Installed;timeoutRow.Controls.Add(minutes);body.Controls.Add(timeoutRow);
            ConfigureCheck(body,startup,"登录 Windows 时启动托盘（不自动打开画面）",Preferences.Startup);
            if(!Preferences.Installed){enabled.Text+="（安装后可用）";startup.Text+="（安装后可用）";enabled.CheckedChanged+=delegate{if(enabled.Checked){enabled.Checked=false;status.Text="请先运行 Install.cmd 完成安装。";}};startup.CheckedChanged+=delegate{if(startup.Checked){startup.Checked=false;status.Text="请先运行 Install.cmd 完成安装。";}};}
            ConfigureCheck(body,tray,"关闭体验窗口后保留托盘",Preferences.GetBool("CloseToTray",true));
            AddHeader(body,"画面与交互");
            ConfigureCheck(body,allScreens,"屏保覆盖所有显示器",Preferences.GetBool("AllScreens",true));
            ConfigureCheck(body,pure,"屏保以纯净模式启动 · H 显示控件",Preferences.GetBool("PureMode",true));
            ConfigureCheck(body,exitInput,"传统模式：移动鼠标或按键立即退出",Preferences.GetBool("ExitOnInput",false));
            AddHeader(body,"音乐");
            ConfigureCheck(body,music,"屏保启动时播放上次选择的电台",Preferences.GetBool("MusicAuto",false));
            body.Controls.Add(new Label{Text="在画面右上角「♫」选择电台、收藏和调节音量。\n仅主显示器播放；退出屏保会停止音乐。",AutoSize=true,MaximumSize=new Size(480,0),ForeColor=Color.FromArgb(139,166,183),Margin=new Padding(0,7,0,14)});
            body.Controls.Add(new Label{Text=Preferences.Installed?"系统屏保由 Windows 触发，与托盘是否运行无关。\n锁屏、休眠与组织策略仍由 Windows 管理。":"当前为便携体验。运行 Install.cmd 后，可设置系统屏保、\n启用开机托盘，并在 Windows 应用列表中卸载。",AutoSize=true,MaximumSize=new Size(490,0),ForeColor=Color.FromArgb(139,166,183)});
            status.AutoSize=false;status.Dock=DockStyle.Fill;status.ForeColor=Color.FromArgb(120,229,224);layout.Controls.Add(status,0,2);
            var buttons=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=1};layout.Controls.Add(buttons,0,3);
            for(int i=0;i<4;i++)buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25));
            var preview=Button("立即屏保",110);preview.Click+=delegate{Process.Start(Path.Combine(Program.Root,"Nexus.scr"),"/s");};buttons.Controls.Add(preview,0,0);
            var system=Button("系统屏保设置",132);system.Click+=delegate{Process.Start("rundll32.exe","shell32.dll,Control_RunDLL desk.cpl,,@screensaver");};buttons.Controls.Add(system,1,0);
            var close=Button("关闭",70);close.Click+=delegate{Close();};buttons.Controls.Add(close,2,0);
            var save=Button("保存设置",110);save.Click+=delegate{Save();};buttons.Controls.Add(save,3,0);
            foreach(Control button in buttons.Controls)button.Dock=DockStyle.Fill;
            body.SizeChanged+=delegate{int width=Math.Max(200,body.ClientSize.Width-SystemInformation.VerticalScrollBarWidth-8);foreach(Control item in body.Controls){if(item is FlowLayoutPanel)item.Width=width;else item.MaximumSize=new Size(width,0);}};
            Shown+=delegate{var area=Screen.FromControl(this).WorkingArea;if(Height>area.Height-24)Height=area.Height-24;if(Width>area.Width-24)Width=area.Width-24;Location=new Point(area.Left+(area.Width-Width)/2,area.Top+(area.Height-Height)/2);};
        }
        void Save(){try{if(Preferences.Installed){Preferences.ConfigureSaver(enabled.Checked,(int)minutes.Value);Preferences.Startup=startup.Checked;}Preferences.SetBool("CloseToTray",tray.Checked);Preferences.SetBool("AllScreens",allScreens.Checked);Preferences.SetBool("PureMode",pure.Checked);Preferences.SetBool("ExitOnInput",exitInput.Checked);Preferences.SetBool("MusicAuto",music.Checked);status.Text="已保存。屏保启动选项将在下次启动时生效。";}catch(Exception e){status.Text="未能保存："+e.Message;Program.Log(e);}}
        static void ConfigureCheck(FlowLayoutPanel panel,CheckBox box,string text,bool value){box.Text=text;box.Checked=value;box.AutoSize=true;box.Margin=new Padding(0,4,0,8);panel.Controls.Add(box);}
        static void AddHeader(FlowLayoutPanel panel,string text){panel.Controls.Add(new Label{Text=text,AutoSize=true,ForeColor=Color.FromArgb(120,229,224),Margin=new Padding(0,15,0,9)});}
        static Button Button(string text,int width){var b=new Button{Text=text,Width=width,Height=36,FlatStyle=FlatStyle.Flat,BackColor=Color.FromArgb(23,46,60),Margin=new Padding(4)};b.FlatAppearance.BorderColor=Color.FromArgb(45,76,90);return b;}
    }
}
