$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$root=Join-Path (Get-Location).Path ('tests\install-test-'+[Guid]::NewGuid().ToString('N'))
$key='HKCU:\Software\NexusScreensaver.Tests\'+[Guid]::NewGuid().ToString('N')
New-Item -Path ($key+'\Desktop') -Force|Out-Null
Set-ItemProperty -LiteralPath ($key+'\Desktop') -Name 'SCRNSAVE.EXE' -Value 'C:\Original\Saver.scr'
Set-ItemProperty -LiteralPath ($key+'\Desktop') -Name ScreenSaveActive -Value '1'
Set-ItemProperty -LiteralPath ($key+'\Desktop') -Name ScreenSaveTimeOut -Value '600'
$results=New-Object System.Collections.ArrayList
& '.\dist\Install.ps1' -Quiet -TestRoot $root -TestRegistry $key
$app=Join-Path $root 'App'
$registered=Get-ItemProperty -LiteralPath ($key+'\Uninstall')
if($registered.DisplayVersion -ne (Get-Content -Raw package.json|ConvertFrom-Json).version -or !$registered.UninstallString.Contains('Uninstall.ps1')){throw 'Uninstall registration failed'}
if(!(Test-Path -LiteralPath (Join-Path $app 'web\radio.css'))){throw 'Missing installed radio assets'}
[void]$results.Add(@{test='Per-user install and Windows uninstall registration';pass=$true})
$backup=Get-Content -Raw -Encoding UTF8 (Join-Path $root 'screensaver-backup.json')
Set-ItemProperty -LiteralPath ($key+'\Desktop') -Name ScreenSaveTimeOut -Value '900'
Set-ItemProperty -LiteralPath ($key+'\Desktop') -Name ScreenSaveActive -Value '0'
Set-Content -LiteralPath (Join-Path $app 'obsolete.dll') -Value 'old program data'
New-Item -ItemType Directory -Path (Join-Path $root 'WebView') -Force|Out-Null
Set-Content -LiteralPath (Join-Path $root 'WebView\preferences-test') -Value 'keep favorites'
& '.\dist\Install.ps1' -Quiet -TestRoot $root -TestRegistry $key
$after=Get-ItemProperty -LiteralPath ($key+'\Desktop')
if($after.ScreenSaveTimeOut -ne '900' -or $after.ScreenSaveActive -ne '0'){throw 'Upgrade reset user preferences'}
if((Get-Content -Raw -Encoding UTF8 (Join-Path $root 'screensaver-backup.json')) -ne $backup){throw 'Upgrade overwrote original backup'}
if(Test-Path -LiteralPath (Join-Path $app 'web\web')){throw 'Upgrade nested web folder'}
[void]$results.Add(@{test='Upgrade preserves timeout, disabled state and original backup';pass=$true})
if((Test-Path -LiteralPath (Join-Path $app 'obsolete.dll')) -or (Test-Path -LiteralPath (Join-Path $root 'App.previous')) -or (Test-Path -LiteralPath (Join-Path $root 'App.new'))){throw 'Obsolete files accumulated'}
if((Get-Content -LiteralPath (Join-Path $root 'WebView\preferences-test')) -ne 'keep favorites'){throw 'Profile changed'}
[void]$results.Add(@{test='Upgrade removes obsolete files and staging while preserving profile';pass=$true})
$hash=(Get-FileHash -LiteralPath (Join-Path $app 'Nexus.exe')).Hash
$failed=$false
try{& '.\dist\Install.ps1' -Quiet -TestRoot $root -TestRegistry $key -TestFailure AfterSwap}catch{$failed=$true}
if(!$failed -or (Get-FileHash -LiteralPath (Join-Path $app 'Nexus.exe')).Hash -ne $hash){throw 'Failed deployment did not roll back'}
if((Get-ItemProperty -LiteralPath ($key+'\Desktop')).ScreenSaveTimeOut -ne '900'){throw 'Rollback changed settings'}
[void]$results.Add(@{test='Injected swap failure rolls back executable and registry';pass=$true})
New-Item -Path ($key+'\Run') -Force|Out-Null
Set-ItemProperty -LiteralPath ($key+'\Run') -Name NexusScreensaver -Value 'test autostart'
$uninstall=Join-Path $app 'Uninstall.ps1'
& $uninstall -Quiet -TestRoot $root -TestRegistry $key
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$after=Get-ItemProperty -LiteralPath ($key+'\Desktop')
if($after.'SCRNSAVE.EXE' -ne 'C:\Original\Saver.scr' -or $after.ScreenSaveTimeOut -ne '600'){throw 'Original screensaver was not restored'}
if((Test-Path -LiteralPath $app) -or (Test-Path -LiteralPath ($key+'\Uninstall'))){throw 'Uninstall left application files or registration'}
if((Get-ItemProperty -LiteralPath ($key+'\Run')).PSObject.Properties['NexusScreensaver']){throw 'Autostart was not removed'}
[void]$results.Add(@{test='Uninstall from installed script restores original saver and removes app/startup/registration';pass=$true})
& '.\dist\Install.ps1' -Quiet -TestRoot $root -TestRegistry $key
Set-ItemProperty -LiteralPath ($key+'\Desktop') -Name 'SCRNSAVE.EXE' -Value 'C:\LaterChoice\Another.scr'
& (Join-Path $app 'Uninstall.ps1') -Quiet -TestRoot $root -TestRegistry $key
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
if((Get-ItemProperty -LiteralPath ($key+'\Desktop')).'SCRNSAVE.EXE' -ne 'C:\LaterChoice\Another.scr'){throw 'Uninstaller overwrote a later screensaver choice'}
[void]$results.Add(@{test='Uninstall preserves a different screensaver chosen after installation';pass=$true})
$results|ConvertTo-Json -Depth 4|Set-Content -Encoding UTF8 tests\installer-results.json
$results|ConvertTo-Json -Depth 4
if($key.StartsWith('HKCU:\Software\NexusScreensaver.Tests\')){Remove-Item -LiteralPath $key -Recurse -Force}
