$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$version=(Get-Content -Raw -LiteralPath package.json|ConvertFrom-Json).version
$shortVersion=($version -replace '\.0$','')
$archive=Join-Path $root ('NEXUS-Windows-x64-v'+$shortVersion+'.zip')
$dist=Join-Path $root 'dist'
. (Join-Path $PSScriptRoot 'Deployment.ps1')
$manifest=Assert-NexusPackage $dist
$files=@('Nexus.exe','Nexus.scr','Nexus.exe.config','Nexus.scr.config','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','nexus.ico','Install.ps1','Uninstall.ps1','Deployment.ps1','ApplyUpdate.ps1','manifest.json','Install.cmd','Uninstall.cmd','Launch.cmd','README.md','使用说明.md','电台白名单说明.md','RELEASE-NOTES.md','LICENSE.txt','THIRD-PARTY-NOTICES.txt','web','licenses')
$files+='音乐律动说明.md'
$paths=@($files|ForEach-Object{$path=Join-Path $dist $_;if(!(Test-Path -LiteralPath $path)){throw ('Missing release file: '+$_)};$path})
$binaryVersion=(Get-Item -LiteralPath (Join-Path $dist 'Nexus.exe')).VersionInfo.FileVersion
if(!$binaryVersion.StartsWith($version)){throw 'Build version does not match package.json; run npm.cmd run build'}
Compress-Archive -LiteralPath $paths -DestinationPath $archive -Force
Copy-Item -LiteralPath $archive -Destination (Join-Path $root 'NEXUS-Windows-x64.zip') -Force
$hash=Get-FileHash -LiteralPath $archive -Algorithm SHA256
($hash.Hash+'  '+[IO.Path]::GetFileName($archive))|Set-Content -Encoding ASCII -LiteralPath ($archive+'.sha256')
Get-Item -LiteralPath $archive | Select-Object FullName,Length
Write-Output ('SHA256 '+$hash.Hash)
