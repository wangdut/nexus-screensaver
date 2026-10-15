param([switch]$Quiet,[string]$TestRoot,[string]$TestRegistry)
$ErrorActionPreference='Stop'
$testMode=!!$TestRoot
if($testMode -and (!$TestRegistry -or !$TestRegistry.StartsWith('HKCU:\Software\NexusScreensaver.Tests\'))) { throw 'Invalid test registry root.' }
$installRoot=if($testMode){[IO.Path]::GetFullPath($TestRoot)}else{Join-Path $env:LOCALAPPDATA 'NexusScreensaver'}
$appRoot=Join-Path $installRoot 'App'
$desktopKey=if($testMode){$TestRegistry+'\Desktop'}else{'HKCU:\Control Panel\Desktop'}
$uninstallKey=if($testMode){$TestRegistry+'\Uninstall'}else{'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NexusScreensaver'}
$sourceRoot=$PSScriptRoot
$saverPath=Join-Path $appRoot 'Nexus.scr'
$backupPath=Join-Path $installRoot 'screensaver-backup.json'
$alreadyInstalled=Test-Path -LiteralPath $saverPath
New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
if(!(Test-Path -LiteralPath $desktopKey)){New-Item -Path $desktopKey -Force | Out-Null}
if(!(Test-Path -LiteralPath $backupPath)){
 $current=Get-ItemProperty -LiteralPath $desktopKey;$backup=@{}
 foreach($name in @('SCRNSAVE.EXE','ScreenSaveActive','ScreenSaveTimeOut')){$property=$current.PSObject.Properties[$name];$backup[$name]=@{exists=($null -ne $property);value=$(if($property){$property.Value}else{$null})}}
 $backup|ConvertTo-Json -Depth 4|Set-Content -Encoding UTF8 -LiteralPath $backupPath
}
if(!$testMode){
 Get-Process 'Nexus*' -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq (Join-Path $appRoot 'Nexus.exe') -or $_.Path -eq $saverPath} | ForEach-Object { if(!$_.CloseMainWindow() -or !$_.WaitForExit(2500)){Stop-Process -Id $_.Id -ErrorAction SilentlyContinue} }
}
if([IO.Path]::GetFullPath($sourceRoot) -ne [IO.Path]::GetFullPath($appRoot)){
 foreach($file in @('Nexus.exe','Nexus.scr','Nexus.exe.config','Nexus.scr.config','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','nexus.ico','Install.ps1','Uninstall.ps1','Install.cmd','Uninstall.cmd','Launch.cmd','README.md','使用说明.md','RELEASE-NOTES.md','THIRD-PARTY-NOTICES.txt')){Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $appRoot -Force}
 foreach($folder in @('web','licenses')){New-Item -ItemType Directory -Path (Join-Path $appRoot $folder) -Force|Out-Null;Get-ChildItem -LiteralPath (Join-Path $sourceRoot $folder)|Copy-Item -Destination (Join-Path $appRoot $folder) -Recurse -Force}
}
if(!$alreadyInstalled){Set-ItemProperty -LiteralPath $desktopKey -Name 'SCRNSAVE.EXE' -Value $saverPath;Set-ItemProperty -LiteralPath $desktopKey -Name ScreenSaveActive -Value '1';Set-ItemProperty -LiteralPath $desktopKey -Name ScreenSaveTimeOut -Value '300'}
New-Item -Path $uninstallKey -Force|Out-Null
$powershell=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$uninstallCommand='"'+$powershell+'" -NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $appRoot 'Uninstall.ps1')+'"'
$registration=@{DisplayName='NEXUS · 星核实验室';DisplayVersion='1.1.0';Publisher='NEXUS';InstallLocation=$appRoot;DisplayIcon=(Join-Path $appRoot 'Nexus.exe');UninstallString=$uninstallCommand;QuietUninstallString=($uninstallCommand+' -Quiet');InstallDate=(Get-Date -Format yyyyMMdd)}
foreach($name in $registration.Keys){New-ItemProperty -LiteralPath $uninstallKey -Name $name -Value $registration[$name] -PropertyType String -Force|Out-Null}
New-ItemProperty -LiteralPath $uninstallKey -Name NoModify -Value 1 -PropertyType DWord -Force|Out-Null
New-ItemProperty -LiteralPath $uninstallKey -Name NoRepair -Value 1 -PropertyType DWord -Force|Out-Null
$kb=[int][Math]::Ceiling((Get-ChildItem -LiteralPath $appRoot -Recurse -File|Measure-Object -Property Length -Sum).Sum/1024)
New-ItemProperty -LiteralPath $uninstallKey -Name EstimatedSize -Value $kb -PropertyType DWord -Force|Out-Null
if(!$testMode){
 Add-Type @'
using System;using System.Runtime.InteropServices;
public static class NexusInstallSPI{[DllImport("user32.dll")]public static extern bool SystemParametersInfo(uint a,uint v,IntPtr p,uint f);}
'@
 $state=Get-ItemProperty -LiteralPath $desktopKey
 [NexusInstallSPI]::SystemParametersInfo(15,[uint32]$state.ScreenSaveTimeOut,[IntPtr]::Zero,3)|Out-Null
 [NexusInstallSPI]::SystemParametersInfo(17,$(if($state.ScreenSaveActive -eq '1'){1}else{0}),[IntPtr]::Zero,3)|Out-Null
 $shortcutRoot=Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\NEXUS 星核实验室'
 New-Item -ItemType Directory -Path $shortcutRoot -Force|Out-Null
 $shell=New-Object -ComObject WScript.Shell
 foreach($entry in @(@{name='NEXUS 星核实验室';args='/window'},@{name='NEXUS 偏好设置';args='--settings'})){$shortcut=$shell.CreateShortcut((Join-Path $shortcutRoot ($entry.name+'.lnk')));$shortcut.TargetPath=Join-Path $appRoot 'Nexus.exe';$shortcut.Arguments=$entry.args;$shortcut.WorkingDirectory=$appRoot;$shortcut.IconLocation=Join-Path $appRoot 'nexus.ico';$shortcut.Save()}
 if(!$Quiet){Start-Process -FilePath (Join-Path $appRoot 'Nexus.exe') -ArgumentList '--settings' -WorkingDirectory $appRoot -WindowStyle Normal}
}
Write-Output 'NEXUS 1.1 installed. Uninstall is available in Windows Apps and Control Panel.'
