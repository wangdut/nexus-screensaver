$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
. .\scripts\Deployment.ps1
$root=Join-Path (Get-Location).Path ('tests\real-deploy-'+[Guid]::NewGuid().ToString('N'))
$source=(Resolve-Path dist).Path
$script:registered=$false
Invoke-NexusDeployment -Source $source -Root $root -TestMode $false -Register {param($manifest)$script:registered=$true}
if(!$script:registered -or !(Test-Path (Join-Path $root 'App\Nexus.exe'))){throw 'Native deployment failed'}
Set-Content -LiteralPath (Join-Path $root 'App\obsolete.dll') -Value 'old'
Invoke-NexusDeployment -Source $source -Root $root -TestMode $false -Register {param($manifest)$script:registered=$true}
if((Test-Path (Join-Path $root 'App.previous')) -or (Test-Path (Join-Path $root 'App\obsolete.dll')) -or (Test-Path (Join-Path $root 'HealthCheck'))){throw 'Native deployment left obsolete program or health profile'}
@{test='Real staged deployment boots WebView2, replaces old app and cleans backup/profile';pass=$true}|ConvertTo-Json|Set-Content -Encoding UTF8 tests\desktop-upgrade-results.json
Write-Output 'Real native deployment and cleanup passed.'
