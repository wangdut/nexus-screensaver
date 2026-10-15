$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:exe /platform:x64 /out:dist\NativeAudioTests.exe /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:dist\Microsoft.Web.WebView2.Core.dll /reference:dist\Microsoft.Web.WebView2.WinForms.dll tests\NativeAudioTests.cs
if($LASTEXITCODE -ne 0){throw 'Native audio test build failed'}
Copy-Item -LiteralPath dist\Nexus.exe.config -Destination dist\NativeAudioTests.exe.config -Force
& .\dist\NativeAudioTests.exe
$result=$LASTEXITCODE
Copy-Item -LiteralPath dist\native-audio-results.json -Destination tests\native-audio-results.json -Force
if($result -ne 0){throw 'Native audio integration failed'}
