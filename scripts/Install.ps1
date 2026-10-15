param([switch]$Quiet,[string]$TestRoot,[string]$TestRegistry,[string]$TestFailure)
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
$alreadyInstalled=(Test-Path -LiteralPath $saverPath) -or (Test-Path -LiteralPath (Join-Path $installRoot 'App.previous\Nexus.scr'))

. (Join-Path $PSScriptRoot 'Deployment.ps1')
[void](Assert-NexusPackage $sourceRoot)
$mutex=New-Object Threading.Mutex($false,('Local\NexusInstall-'+[Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
$locked=$false
try {
 try{$locked=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$locked=$true}
 if(!$locked){throw 'Another installation is already running.'}
 $snapshots=@{}
 foreach($path in @($desktopKey,$uninstallKey)){
  $values=@{};if(Test-Path -LiteralPath $path){$item=Get-Item -LiteralPath $path;foreach($name in $item.GetValueNames()){$values[$name]=@{value=$item.GetValue($name);kind=$item.GetValueKind($name)}}}
  $snapshots[$path]=@{exists=(Test-Path -LiteralPath $path);values=$values}
 }
 New-Item -ItemType Directory -Path $installRoot -Force|Out-Null
 if(!(Test-Path -LiteralPath $desktopKey)){New-Item -Path $desktopKey -Force|Out-Null}
 $backupCreated=$false
 if(!(Test-Path -LiteralPath $backupPath)){
  $current=Get-ItemProperty -LiteralPath $desktopKey;$backup=@{}
  foreach($name in @('SCRNSAVE.EXE','ScreenSaveActive','ScreenSaveTimeOut')){$property=$current.PSObject.Properties[$name];$backup[$name]=@{exists=($null -ne $property);value=$(if($property){$property.Value}else{$null})}}
  $backup|ConvertTo-Json -Depth 4|Set-Content -Encoding UTF8 -LiteralPath $backupPath;$backupCreated=$true
 }
 $registration={param($manifest)
if(!$alreadyInstalled){Set-ItemProperty -LiteralPath $desktopKey -Name 'SCRNSAVE.EXE' -Value $saverPath;Set-ItemProperty -LiteralPath $desktopKey -Name ScreenSaveActive -Value '1';Set-ItemProperty -LiteralPath $desktopKey -Name ScreenSaveTimeOut -Value '300'}
New-Item -Path $uninstallKey -Force|Out-Null
$powershell=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$uninstallCommand='"'+$powershell+'" -NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $appRoot 'Uninstall.ps1')+'"'
$registration=@{DisplayName='NEXUS · 星核实验室';DisplayVersion=$manifest.version;Publisher='NEXUS';InstallLocation=$appRoot;DisplayIcon=(Join-Path $appRoot 'Nexus.exe');UninstallString=$uninstallCommand;QuietUninstallString=($uninstallCommand+' -Quiet');InstallDate=(Get-Date -Format yyyyMMdd)}
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
}

 }
 Invoke-NexusDeployment -Source $sourceRoot -Root $installRoot -TestMode $testMode -Register $registration -FailurePoint $TestFailure
 if(!$testMode -and !$Quiet){Start-Process -FilePath (Join-Path $appRoot 'Nexus.exe') -ArgumentList '--settings' -WorkingDirectory $appRoot -WindowStyle Normal}
 Write-Output 'NEXUS installed successfully; previous application files removed.'
} catch {
 if($locked -and $snapshots){foreach($path in $snapshots.Keys){$snapshot=$snapshots[$path];if(!$snapshot.exists){Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue}else{New-Item -Path $path -Force|Out-Null;$item=Get-Item -LiteralPath $path;foreach($name in $item.GetValueNames()){if(!$snapshot.values.ContainsKey($name)){Remove-ItemProperty -LiteralPath $path -Name $name}};foreach($name in $snapshot.values.Keys){New-ItemProperty -LiteralPath $path -Name $name -Value $snapshot.values[$name].value -PropertyType $snapshot.values[$name].kind -Force|Out-Null}}}}
 if(!$alreadyInstalled -and $backupCreated -and !(Test-Path -LiteralPath $appRoot)){Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue}
 throw
} finally {if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
