param([switch]$Quiet,[string]$TestRoot,[string]$TestRegistry)
$ErrorActionPreference='Stop'
$testMode=!!$TestRoot
if($testMode -and (!$TestRegistry -or !$TestRegistry.StartsWith('HKCU:\Software\NexusScreensaver.Tests\'))){throw 'Invalid test registry root.'}
$installRoot=if($testMode){[IO.Path]::GetFullPath($TestRoot)}else{Join-Path $env:LOCALAPPDATA 'NexusScreensaver'}
$appRoot=Join-Path $installRoot 'App'
$desktopKey=if($testMode){$TestRegistry+'\Desktop'}else{'HKCU:\Control Panel\Desktop'}
$uninstallKey=if($testMode){$TestRegistry+'\Uninstall'}else{'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NexusScreensaver'}
$runKey=if($testMode){$TestRegistry+'\Run'}else{'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'}
$backupPath=Join-Path $installRoot 'screensaver-backup.json'
. (Join-Path $PSScriptRoot 'Deployment.ps1')
if(!$Quiet -and !$testMode){Add-Type -AssemblyName System.Windows.Forms;if([System.Windows.Forms.MessageBox]::Show('卸载 NEXUS 并恢复安装前的屏保设置？个人偏好与收藏将保留。','卸载 NEXUS','YesNo','Question') -ne 'Yes'){exit}}
if(!$testMode){Get-Process 'Nexus*' -ErrorAction SilentlyContinue|Where-Object{$_.Path -eq (Join-Path $appRoot 'Nexus.exe') -or $_.Path -eq (Join-Path $appRoot 'Nexus.scr')}|ForEach-Object{if(!$_.CloseMainWindow() -or !$_.WaitForExit(2500)){Stop-Process -Id $_.Id -ErrorAction SilentlyContinue}}}
$current=Get-ItemProperty -LiteralPath $desktopKey
if($current.'SCRNSAVE.EXE' -eq (Join-Path $appRoot 'Nexus.scr')){
 if(Test-Path -LiteralPath $backupPath){$backup=Get-Content -Raw -Encoding UTF8 -LiteralPath $backupPath|ConvertFrom-Json;foreach($name in @('SCRNSAVE.EXE','ScreenSaveActive','ScreenSaveTimeOut')){$entry=$backup.PSObject.Properties[$name].Value;if($entry.exists){Set-ItemProperty -LiteralPath $desktopKey -Name $name -Value $entry.value}else{Remove-ItemProperty -LiteralPath $desktopKey -Name $name -ErrorAction SilentlyContinue}}}else{Set-ItemProperty -LiteralPath $desktopKey -Name ScreenSaveActive -Value '0'}
 if(!$testMode){
 Add-Type @'
using System;using System.Runtime.InteropServices;
public static class NexusUninstallSPI{[DllImport("user32.dll")]public static extern bool SystemParametersInfo(uint a,uint v,IntPtr p,uint f);}
'@
 $restored=Get-ItemProperty -LiteralPath $desktopKey;$seconds=300;if($restored.ScreenSaveTimeOut){$seconds=[uint32]$restored.ScreenSaveTimeOut}
 [NexusUninstallSPI]::SystemParametersInfo(15,$seconds,[IntPtr]::Zero,3)|Out-Null
 [NexusUninstallSPI]::SystemParametersInfo(17,$(if($restored.ScreenSaveActive -eq '1'){1}else{0}),[IntPtr]::Zero,3)|Out-Null
 }
}
if(Test-Path -LiteralPath $runKey){Remove-ItemProperty -LiteralPath $runKey -Name NexusScreensaver -ErrorAction SilentlyContinue}
$expectedRoot=[IO.Path]::GetFullPath((Join-Path $installRoot 'App'))
if(Test-Path -LiteralPath $appRoot){$resolved=(Get-Item -LiteralPath $appRoot).FullName;if($resolved -ne $expectedRoot -or (Get-Item -LiteralPath $appRoot).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unexpected application folder.'};Set-Location -LiteralPath $installRoot;Remove-Item -LiteralPath $resolved -Recurse -Force}
if(!$testMode){$shortcutRoot=Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\NEXUS 星核实验室';if(Test-Path -LiteralPath $shortcutRoot){$resolved=(Get-Item -LiteralPath $shortcutRoot).FullName;if($resolved -eq [IO.Path]::GetFullPath($shortcutRoot)){Remove-Item -LiteralPath $resolved -Recurse -Force}}}
if(Test-Path -LiteralPath $uninstallKey){Remove-Item -LiteralPath $uninstallKey -Recurse -Force}
if(Test-Path -LiteralPath $backupPath){Remove-Item -LiteralPath $backupPath -Force}
foreach($folder in @('App.new','App.previous','Updates','HealthCheck')){Remove-NexusManagedDirectory (Join-Path $installRoot $folder) $installRoot}
Remove-Item -LiteralPath (Join-Path $installRoot 'update-result.json') -Force -ErrorAction SilentlyContinue
Write-Output 'NEXUS uninstalled. Preferences and favorites have been retained.'
