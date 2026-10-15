$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Path screenshots -Force | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class NexusTrayTest {
 [DllImport("user32.dll")]public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 public delegate bool EnumProc(IntPtr h,IntPtr d);
 [DllImport("user32.dll")]public static extern bool EnumWindows(EnumProc f,IntPtr d);
 [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint id);
 [DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder text,int len);
 [DllImport("user32.dll")]public static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll")]public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out Rect rect);
 [StructLayout(LayoutKind.Sequential)]public struct Rect{public int Left,Top,Right,Bottom;}
 public static IntPtr Find(int process,string title){IntPtr found=IntPtr.Zero;EnumWindows(delegate(IntPtr h,IntPtr d){uint id;GetWindowThreadProcessId(h,out id);var b=new System.Text.StringBuilder(512);GetWindowText(h,b,512);if(id==process&&IsWindowVisible(h)&&(title==null||b.ToString().Contains(title))){found=h;return false;}return true;},IntPtr.Zero);return found;}
}
'@
[void][NexusTrayTest]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$exe=(Resolve-Path 'dist\Nexus.exe').Path
$app=Start-Process -FilePath $exe -ArgumentList '--tray' -WindowStyle Hidden -PassThru
$results=New-Object System.Collections.ArrayList
try {
 Start-Sleep -Milliseconds 600
 if($app.HasExited){throw 'Tray did not stay alive'}
 if([NexusTrayTest]::Find($app.Id,$null) -ne [IntPtr]::Zero){throw 'Startup opened an unwanted window'}
 [void]$results.Add(@{test='Background startup retains tray without opening window';pass=$true})
 $settings=Start-Process -FilePath $exe -ArgumentList '--settings' -WindowStyle Hidden -PassThru
 if(!$settings.WaitForExit(4000)){throw 'Second launch did not hand off to primary instance'}
 Start-Sleep -Milliseconds 700
 $window=[NexusTrayTest]::Find($app.Id,'设置')
 if($window -eq [IntPtr]::Zero){throw 'Settings event failed'}
 [void]$results.Add(@{test='Single instance forwards settings request';pass=$true})
 $rect=New-Object NexusTrayTest+Rect;[void][NexusTrayTest]::GetWindowRect($window,[ref]$rect)
 $bitmap=New-Object Drawing.Bitmap ($rect.Right-$rect.Left),($rect.Bottom-$rect.Top)
 $graphics=[Drawing.Graphics]::FromImage($bitmap);$dc=$graphics.GetHdc();[void][NexusTrayTest]::PrintWindow($window,$dc,2);$graphics.ReleaseHdc($dc);$bitmap.Save((Join-Path (Get-Location).Path 'screenshots\settings-v1.1.png'));$graphics.Dispose();$bitmap.Dispose()
 [void][NexusTrayTest]::PostMessage($window,0x10,[IntPtr]::Zero,[IntPtr]::Zero)
 $explore=Start-Process -FilePath $exe -ArgumentList '/window' -WindowStyle Hidden -PassThru
 if(!$explore.WaitForExit(4000)){throw 'Explorer duplicate process did not exit'}
 Start-Sleep -Milliseconds 1800
 $window=[NexusTrayTest]::Find($app.Id,'星核')
 if($window -eq [IntPtr]::Zero){throw 'Explorer did not open from tray'}
 [void][NexusTrayTest]::PostMessage($window,0x10,[IntPtr]::Zero,[IntPtr]::Zero)
 Start-Sleep -Milliseconds 600;$app.Refresh()
 if($app.HasExited){throw 'Tray exited when experience window closed'}
 [void]$results.Add(@{test='Window opens from tray and close preserves background access';pass=$true})
 $shutdown=Start-Process -FilePath $exe -ArgumentList '--shutdown' -WindowStyle Hidden -PassThru
 if(!$app.WaitForExit(4000)){throw 'Tray shutdown did not exit'}
 [void]$results.Add(@{test='Explicit quit disposes tray and exits process';pass=$true})
 $results|ConvertTo-Json -Depth 3|Set-Content -Encoding UTF8 tests\tray-results.json
 $results|ConvertTo-Json -Depth 3
}finally{if(!$app.HasExited){$app.Kill()}}
