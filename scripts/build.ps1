$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$packagePath = Join-Path $projectRoot 'vendor\webview2'
if (-not (Test-Path -LiteralPath "$packagePath\lib\net462\Microsoft.Web.WebView2.Core.dll")) {
    New-Item -ItemType Directory -Path vendor -Force | Out-Null
    Invoke-WebRequest -UseBasicParsing 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.2903.40/microsoft.web.webview2.1.0.2903.40.nupkg' -OutFile vendor\webview2.zip
    Expand-Archive -LiteralPath vendor\webview2.zip -DestinationPath $packagePath -Force
}
$compilerPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compilerPath)) { throw '.NET Framework 4.8 compiler is required.' }
New-Item -ItemType Directory -Path dist -Force | Out-Null
Copy-Item "$packagePath\lib\net462\Microsoft.Web.WebView2.Core.dll", "$packagePath\lib\net462\Microsoft.Web.WebView2.WinForms.dll", "$packagePath\runtimes\win-x64\native\WebView2Loader.dll" -Destination dist
$compileArgs = @('/nologo','/target:winexe','/platform:x64','/optimize+','/out:dist\Nexus.exe','/win32manifest:src\app.manifest','/reference:System.dll','/reference:System.Core.dll','/reference:System.Net.Http.dll','/reference:System.Web.Extensions.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:dist\Microsoft.Web.WebView2.Core.dll','/reference:dist\Microsoft.Web.WebView2.WinForms.dll','src\*.cs')
if (Test-Path src\nexus.ico) { $compileArgs += '/win32icon:src\nexus.ico' }
& $compilerPath $compileArgs
if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
Copy-Item dist\Nexus.exe dist\Nexus.scr -Force
Copy-Item src\Nexus.exe.config dist\Nexus.exe.config -Force
Copy-Item src\Nexus.exe.config dist\Nexus.scr.config -Force
if (Test-Path src\nexus.ico) { Copy-Item src\nexus.ico dist\nexus.ico -Force }
Copy-Item scripts\Install.ps1,scripts\Uninstall.ps1 -Destination dist -Force
Copy-Item scripts\Install.cmd,scripts\Uninstall.cmd,scripts\Launch.cmd -Destination dist -Force
Copy-Item docs\USER_GUIDE.md dist\使用说明.md -Force
Copy-Item docs\USER_GUIDE.md dist\README.md -Force
Copy-Item RELEASE-NOTES.md -Destination dist -Force
Copy-Item THIRD-PARTY-NOTICES.txt dist\THIRD-PARTY-NOTICES.txt -Force
New-Item -ItemType Directory -Path dist\licenses -Force | Out-Null
Copy-Item node_modules\three\LICENSE dist\licenses\three-MIT.txt -Force
Copy-Item "$packagePath\LICENSE.txt" dist\licenses\WebView2-LICENSE.txt -Force
Copy-Item "$packagePath\NOTICE.txt" dist\licenses\WebView2-NOTICE.txt -Force
Write-Output 'Built dist\Nexus.exe and dist\Nexus.scr (Windows x64)'

Copy-Item node_modules\hls.js\LICENSE dist\licenses\hls.js-LICENSE.txt -Force
