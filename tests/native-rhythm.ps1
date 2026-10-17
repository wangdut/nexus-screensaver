$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
& "$PSScriptRoot\spectrum.ps1"
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:exe /platform:x64 /out:dist\NativeRhythmTests.exe /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:dist\Microsoft.Web.WebView2.Core.dll /reference:dist\Microsoft.Web.WebView2.WinForms.dll tests\NativeRhythmTests.cs
if($LASTEXITCODE -ne 0){throw 'Native rhythm test build failed'}
Copy-Item -LiteralPath dist\Nexus.exe.config -Destination dist\NativeRhythmTests.exe.config -Force
& .\dist\NativeRhythmTests.exe
$result=$LASTEXITCODE
Copy-Item -LiteralPath dist\native-rhythm-results.json -Destination tests\native-rhythm-results.json -Force
if($result -ne 0){throw 'Native rhythm integration failed'}
