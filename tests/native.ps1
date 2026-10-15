$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Path screenshots -Force | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NexusNativeTest {
 public delegate bool EnumProc(IntPtr h, IntPtr data);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback,IntPtr data);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint id);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 public static IntPtr FindProcessWindow(int processId) { IntPtr found=IntPtr.Zero; EnumWindows(delegate(IntPtr h,IntPtr data){ uint id; GetWindowThreadProcessId(h,out id); if(id==(uint)processId&&IsWindowVisible(h)){found=h;return false;}return true;},IntPtr.Zero);return found; }
 public static IntPtr FindChild(IntPtr parent) { return FindWindowEx(parent,IntPtr.Zero,null,null); }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string cls,string title);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int index);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
}
'@
[void][NexusNativeTest]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$results = New-Object System.Collections.ArrayList
function Start-Nexus([string]$file,[string]$arguments) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = (Resolve-Path -LiteralPath $file).Path
    $info.Arguments = $arguments
    $info.UseShellExecute = $false
    return [System.Diagnostics.Process]::Start($info)
}
$smoke = Start-Nexus '.\dist\Nexus.exe' '--smoke-test'
if (-not $smoke.WaitForExit(25000)) { $smoke.Kill(); throw 'Native smoke timed out' }
if ($smoke.ExitCode -ne 0) { throw 'Native smoke process failed' }
$raw = Get-Content -Raw -Encoding UTF8 dist\native-smoke.json | ConvertFrom-Json
if ($raw -is [string]) { $state = $raw | ConvertFrom-Json } else { $state = $raw }
if (-not $state.ready -or $state.frames -lt 3) { throw 'Native WebView2 did not render' }
[void]$results.Add(@{ test='Native WebView2 offline render';pass=$true;state=$state })
Copy-Item dist\native-smoke.png screenshots\native-window.png -Force
$settings = Start-Nexus '.\dist\Nexus.scr' '/c'
Start-Sleep -Milliseconds 1300
$settings.Refresh()
if ($settings.MainWindowHandle -eq 0) { throw 'Settings window did not open' }
[void]$results.Add(@{test='Windows /c configuration entry';pass=$true;title=$settings.MainWindowTitle})
[void]$settings.CloseMainWindow()
if (-not $settings.WaitForExit(3000)) { $settings.Kill(); throw 'Settings did not close' }

$hostForm = New-Object System.Windows.Forms.Form
$hostForm.Text = 'NEXUS Preview Integration Test'
$hostForm.ClientSize = New-Object System.Drawing.Size 420,270
$hostForm.ShowInTaskbar = $false
$hostForm.StartPosition = 'CenterScreen'
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$script:previewProcess = $null
$script:previewStage = 0
$script:ticks = 0
$script:previewError = $null
$hostForm.add_Shown({ $script:previewProcess = Start-Nexus '.\dist\Nexus.scr' ('/p ' + $hostForm.Handle.ToInt64()); $timer.Start() })
$timer.add_Tick({
    try {
        $script:ticks++
        $child = [NexusNativeTest]::FindChild($hostForm.Handle)
        if ($script:ticks -gt 35) { throw 'Preview child timeout' }
        if ($child -eq [IntPtr]::Zero) { if ($script:ticks -eq 10) { $script:previewProcess.Refresh(); Write-Host ("No child. Process {0}, title {1}, handle {2}, exited {3}, parent {4}" -f $script:previewProcess.Id,$script:previewProcess.MainWindowTitle,$script:previewProcess.MainWindowHandle,$script:previewProcess.HasExited,$hostForm.Handle) }; return }
        $rect = New-Object NexusNativeTest+Rect
        [void][NexusNativeTest]::GetWindowRect($child,[ref]$rect)
        $parentRect = New-Object NexusNativeTest+Rect
        [void][NexusNativeTest]::GetClientRect($hostForm.Handle,[ref]$parentRect)
        $width = $rect.Right-$rect.Left
        $height = $rect.Bottom-$rect.Top
        if ($script:ticks -eq 10) { Write-Host ("Child {0}, rect {1}x{2}, stage {3}, host {4}x{5}" -f $child,$width,$height,$script:previewStage,$hostForm.ClientSize.Width,$hostForm.ClientSize.Height) }
        if ($script:previewStage -eq 0 -and $width -eq $parentRect.Right -and $height -eq $parentRect.Bottom) {
            if (([NexusNativeTest]::GetWindowLong($child,-16) -band 0x40000000) -eq 0) { throw 'Preview is not a child window' }
            [void]$results.Add(@{test='Windows /p parent embedding';pass=$true;width=$width;height=$height})
            $script:previewStage=1
            $hostForm.ClientSize = New-Object System.Drawing.Size 540,320
        } elseif ($script:previewStage -eq 1 -and $width -eq $parentRect.Right -and $height -eq $parentRect.Bottom -and $width -gt 500) {
            [void]$results.Add(@{test='Windows /p parent resize';pass=$true;width=$width;height=$height})
            $script:previewStage=2
            $timer.Stop();$hostForm.Close()
        }
    } catch { $script:previewError=$_; $timer.Stop();$hostForm.Close() }
})
[System.Windows.Forms.Application]::Run($hostForm)
$timer.Dispose()
if ($script:previewProcess -and -not $script:previewProcess.WaitForExit(4000)) { $script:previewProcess.Kill(); throw 'Preview did not close with parent' }
if ($script:previewError) { throw $script:previewError }
if ($script:previewStage -ne 2) { throw 'Preview test incomplete' }
[void]$results.Add(@{test='Windows /p closes with parent';pass=$true})

$saver = Start-Nexus '.\dist\Nexus.scr' '/s'
Start-Sleep -Milliseconds 1700
$saver.Refresh()
$saverHandle = [NexusNativeTest]::FindProcessWindow($saver.Id)
if ($saverHandle -eq [IntPtr]::Zero) { $saver.Kill(); throw 'Screensaver did not create a window' }
$rect = New-Object NexusNativeTest+Rect
[void][NexusNativeTest]::GetWindowRect($saverHandle,[ref]$rect)
$screen = [System.Windows.Forms.Screen]::FromHandle($saverHandle).Bounds
if ($rect.Left -ne $screen.Left -or $rect.Top -ne $screen.Top -or ($rect.Right-$rect.Left) -ne $screen.Width -or ($rect.Bottom-$rect.Top) -ne $screen.Height) { throw 'Screensaver does not cover monitor' }
[void]$results.Add(@{test='Windows /s fullscreen monitor bounds';pass=$true;width=$screen.Width;height=$screen.Height})
[void][NexusNativeTest]::PostMessage($saverHandle,0x10,[IntPtr]::Zero,[IntPtr]::Zero)
if (-not $saver.WaitForExit(4000)) { $saver.Kill(); throw 'Screensaver did not close' }
$results | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 tests\native-results.json
$results | ConvertTo-Json -Depth 6
