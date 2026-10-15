$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:exe /platform:x64 /main:UpdateTests /out:dist\UpdateTests.exe /reference:System.dll /reference:System.Core.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:dist\Microsoft.Web.WebView2.Core.dll /reference:dist\Microsoft.Web.WebView2.WinForms.dll src\*.cs tests\UpdateTests.cs
if($LASTEXITCODE -ne 0){throw 'Updater test compile failed'}
Copy-Item dist\Nexus.exe.config dist\UpdateTests.exe.config -Force
& .\dist\UpdateTests.exe
if($LASTEXITCODE -ne 0){throw 'Updater tests failed'}
Copy-Item dist\update-tests.json tests\update-results.json -Force

$root=Join-Path (Get-Location).Path ('tests\apply-'+[Guid]::NewGuid().ToString('N'));$key='HKCU:\Software\NexusScreensaver.Tests\'+[Guid]::NewGuid().ToString('N')
& .\dist\Install.ps1 -Quiet -TestRoot $root -TestRegistry $key
try {
 foreach($failure in @('','AfterSwap')){
  $job=Join-Path $root ('Updates\job-'+[Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $job -Force|Out-Null
  Expand-Archive -LiteralPath ('NEXUS-Windows-x64-v'+((Get-Content -Raw package.json|ConvertFrom-Json).version -replace '\.0$','')+'.zip') -DestinationPath (Join-Path $job 'package')
  Copy-Item dist\ApplyUpdate.ps1 $job
  & (Join-Path $job 'ApplyUpdate.ps1') -Package (Join-Path $job 'package') -ParentProcess 0 -TestRoot $root -TestRegistry $key -TestFailure $failure
  Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
  $report=Get-Content -Raw -Encoding UTF8 (Join-Path $root 'update-result.json')|ConvertFrom-Json
  if($report.ok -ne ($failure -eq '')){throw 'Update helper result incorrect'}
  if((Test-Path -LiteralPath $job) -or !(Test-Path -LiteralPath (Join-Path $root 'App\Nexus.exe'))){throw 'Update helper cleanup or rollback failed'}
 }
 @(@{test='Updater helper completes replacement and removes downloaded job';pass=$true},@{test='Updater helper reports failure, restores app and removes downloaded job';pass=$true})|ConvertTo-Json|Set-Content -Encoding UTF8 tests\update-helper-results.json
 Write-Output 'Updater helper success and failure paths passed.'
}finally{Remove-Item -LiteralPath $key -Recurse -Force -ErrorAction SilentlyContinue}
