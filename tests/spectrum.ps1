param([switch]$Live)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:exe /platform:x64 /out:dist\SpectrumTests.exe /reference:System.dll /reference:System.Core.dll src\AudioLoopback.cs tests\SpectrumTests.cs
if($LASTEXITCODE -ne 0){throw 'Spectrum test build failed'}
if($Live){& .\dist\SpectrumTests.exe --live}else{& .\dist\SpectrumTests.exe}
if($LASTEXITCODE -ne 0){throw 'Spectrum tests failed'}
