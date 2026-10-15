using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Nexus
{
    // Keep native resizing, snapping, keyboard navigation and caption buttons.
    internal class ThemedForm : Form
    {
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h,int attribute,ref int value,int size);
        protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); ApplyFrame(); }
        protected override void OnBackColorChanged(EventArgs e) { base.OnBackColorChanged(e); if(IsHandleCreated)ApplyFrame(); }
        protected override void WndProc(ref Message m) { base.WndProc(ref m); if(m.Msg==0x31A||m.Msg==0x1A||m.Msg==0x86)ApplyFrame(); }
        void ApplyFrame()
        {
            if(!IsHandleCreated||FormBorderStyle==FormBorderStyle.None)return;
            try {
                int dark=1;if(DwmSetWindowAttribute(Handle,20,ref dark,4)!=0)DwmSetWindowAttribute(Handle,19,ref dark,4);
                int background=ColorTranslator.ToWin32(BackColor),foreground=ColorTranslator.ToWin32(Color.FromArgb(222,237,243)),border=unchecked((int)0xFFFFFFFE);
                DwmSetWindowAttribute(Handle,35,ref background,4);DwmSetWindowAttribute(Handle,36,ref foreground,4);DwmSetWindowAttribute(Handle,34,ref border,4);
            }catch(DllNotFoundException){}catch(EntryPointNotFoundException){}
        }
    }
}
