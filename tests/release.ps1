$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=(Resolve-Path -LiteralPath 'NEXUS-Windows-x64-v1.1.zip').Path
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try{
 $names=@($zip.Entries|ForEach-Object{$_.FullName.Replace('\','/')})
 foreach($name in @('Nexus.exe','Nexus.scr','Install.cmd','Install.ps1','Uninstall.ps1','README.md','使用说明.md','RELEASE-NOTES.md','web/app.js','web/radio.css','licenses/hls.js-LICENSE.txt')){if($name -notin $names){throw ('Missing archive entry: '+$name)}}
 if($names|Where-Object{$_ -match 'test-profile|smoke|Tests.exe|results.json|node_modules|screenshots'}){throw 'Release includes test artifacts'}
}finally{$zip.Dispose()}
$folder=Join-Path (Get-Location).Path ('tests\release-'+[Guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $archive -DestinationPath $folder
$binary=Join-Path $folder 'Nexus.exe'
if((Get-Item -LiteralPath $binary).VersionInfo.FileVersion -ne '1.1.0.0'){throw 'Incorrect packaged version'}
$info=New-Object Diagnostics.ProcessStartInfo
$info.FileName=$binary;$info.Arguments='--smoke-test';$info.UseShellExecute=$false;$info.WorkingDirectory=$folder
$app=[Diagnostics.Process]::Start($info)
if(!$app.WaitForExit(30000)){$app.Kill();throw 'Packaged executable timed out'}
if($app.ExitCode -ne 0){throw 'Packaged executable failed'}
$state=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $folder 'native-smoke.json')|ConvertFrom-Json
if($state -is [string]){$state=$state|ConvertFrom-Json}
if(!$state.ready -or $state.frames -lt 3){throw 'Packaged renderer not ready'}
$result=@{passed=3;version='1.1.0';entries=$names.Count;archive=$archive;sha256=(Get-FileHash -LiteralPath $archive).Hash;checks=@('Required files and licenses present; test artifacts excluded','Packaged binary version 1.1.0.0','Extracted Windows executable renders successfully');state=$state}
$result|ConvertTo-Json -Depth 5|Set-Content -Encoding UTF8 tests\release-results.json
$result|ConvertTo-Json -Depth 5
