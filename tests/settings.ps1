$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
Add-Type -AssemblyName System.Windows.Forms
$assembly=[Reflection.Assembly]::LoadFrom((Resolve-Path 'dist\Nexus.exe').Path)
$prefs=$assembly.GetType('Nexus.Preferences');$flags=[Reflection.BindingFlags]'NonPublic,Static'
$fields=@('Key','Desktop','RunKey','InstalledRoot','TestMode');$saved=@{}
foreach($name in $fields){$saved[$name]=$prefs.GetField($name,$flags).GetValue($null)}
if($saved.Key -ne 'Software\NexusScreensaver' -or $saved.Desktop -ne 'Control Panel\Desktop' -or $saved.RunKey -ne 'Software\Microsoft\Windows\CurrentVersion\Run'){throw 'Production registry paths invalid'}
$root='Software\NexusScreensaver.Tests\'+[Guid]::NewGuid().ToString('N')
$fixture=Join-Path (Get-Location).Path ('tests\preferences-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -Force|Out-Null
Copy-Item -LiteralPath 'dist\Nexus.scr' -Destination $fixture
foreach($pair in @{Key=($root+'\Prefs');Desktop=($root+'\Desktop');RunKey=($root+'\Run');InstalledRoot=$fixture;TestMode=$true}.GetEnumerator()){$prefs.GetField($pair.Key,$flags).SetValue($null,$pair.Value)}
$form=$null;$results=New-Object System.Collections.ArrayList
try {
 $settings=$assembly.GetType('Nexus.SettingsForm');$form=[Activator]::CreateInstance($settings,$true)
 $instance=[Reflection.BindingFlags]'NonPublic,Instance'
 foreach($name in @('enabled','startup','allScreens','pure','music','exitInput')){$control=$settings.GetField($name,$instance).GetValue($form);$control.Checked=$true}
 $settings.GetField('minutes',$instance).GetValue($form).Value=17
 $settings.GetMethod('Save',$instance).Invoke($form,@())|Out-Null
 $status=$settings.GetField('status',$instance).GetValue($form).Text
 if(!$status.StartsWith('已保存')){throw ('Settings failed: '+$status)}
 $desktop=Get-ItemProperty -LiteralPath ('HKCU:\'+$root+'\Desktop')
 if($desktop.ScreenSaveTimeOut -ne '1020' -or $desktop.ScreenSaveActive -ne '1'){throw 'Timeout not applied'}
 $run=(Get-ItemProperty -LiteralPath ('HKCU:\'+$root+'\Run')).NexusScreensaver
 if($run -ne ('"'+(Join-Path $fixture 'Nexus.exe')+'" --tray')){throw ('Autostart command malformed: '+$run)}
 $pref=Get-ItemProperty -LiteralPath ('HKCU:\'+$root+'\Prefs')
 if($pref.MusicAuto -ne 1 -or $pref.ExitOnInput -ne 1 -or $pref.AllScreens -ne 1){throw 'Preference toggles not saved'}
 [void]$results.Add(@{test='Settings Save persists exact timeout, quoted startup command, audio and display toggles';pass=$true})
 $form.Dispose();$form=[Activator]::CreateInstance($settings,$true)
 if(!$settings.GetField('startup',$instance).GetValue($form).Checked -or $settings.GetField('minutes',$instance).GetValue($form).Value -ne 17){throw 'Settings did not restore values'}
 [void]$results.Add(@{test='Settings reopen restores saved options';pass=$true})
 $settings.GetField('startup',$instance).GetValue($form).Checked=$false
 $settings.GetField('enabled',$instance).GetValue($form).Checked=$false
 $settings.GetMethod('Save',$instance).Invoke($form,@())|Out-Null
 if((Get-ItemProperty -LiteralPath ('HKCU:\'+$root+'\Run')).PSObject.Properties['NexusScreensaver']){throw 'Disabled autostart persists'}
 if((Get-ItemProperty -LiteralPath ('HKCU:\'+$root+'\Desktop')).ScreenSaveActive -ne '0'){throw 'Disabled saver remains on'}
 [void]$results.Add(@{test='Disabling startup removes Run entry and disables saver';pass=$true})
 $results|ConvertTo-Json -Depth 3|Set-Content -Encoding UTF8 tests\settings-results.json
 $results|ConvertTo-Json -Depth 3
}finally{if($form){$form.Dispose()};foreach($name in $fields){$prefs.GetField($name,$flags).SetValue($null,$saved[$name])};if($root.StartsWith('Software\NexusScreensaver.Tests\')){Remove-Item -LiteralPath ('HKCU:\'+$root) -Recurse -Force -ErrorAction SilentlyContinue}}
