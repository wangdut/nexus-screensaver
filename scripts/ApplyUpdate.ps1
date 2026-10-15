param([Parameter(Mandatory=$true)][string]$Package,[Parameter(Mandatory=$true)][int]$ParentProcess,[string]$TestRoot,[string]$TestRegistry,[string]$TestFailure)
$ErrorActionPreference='Stop'
$testMode=!!$TestRoot
if($testMode -and (!$TestRegistry -or !$TestRegistry.StartsWith('HKCU:\Software\NexusScreensaver.Tests\'))){throw 'Invalid test registry root.'}
$root=if($testMode){[IO.Path]::GetFullPath($TestRoot)}else{Join-Path $env:LOCALAPPDATA 'NexusScreensaver'}
$job=[IO.Path]::GetFullPath($PSScriptRoot)
$updates=Join-Path $root 'Updates'
if([IO.Path]::GetDirectoryName($job) -ne $updates -or [IO.Path]::GetFileName($job) -notmatch '^job-[a-f0-9]{32}$'){throw 'Invalid updater directory.'}
if([IO.Path]::GetFullPath($Package) -ne (Join-Path $job 'package')){throw 'Invalid update package location.'}
$result=Join-Path $root 'update-result.json';$restart=$false
try{
 $parent=if(!$testMode){Get-Process -Id $ParentProcess -ErrorAction SilentlyContinue}else{$null}
 if($parent -and !$parent.WaitForExit(20000)){throw 'Application is still running; update cancelled.'}
 $restart=$true
 if($testMode){& (Join-Path $Package 'Install.ps1') -Quiet -TestRoot $TestRoot -TestRegistry $TestRegistry -TestFailure $TestFailure}else{& (Join-Path $Package 'Install.ps1') -Quiet}
 @{ok=$true;message='更新完成，旧程序与下载缓存已清理。';time=(Get-Date -Format s)}|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath $result
}catch{
 @{ok=$false;message=('更新未完成，已保留原版本：'+$_.Exception.Message);time=(Get-Date -Format s)}|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath $result
}finally{
 Set-Location -LiteralPath $root
 if(!$testMode -and $restart -and (Test-Path -LiteralPath (Join-Path $root 'App\Nexus.exe'))){Start-Process -FilePath (Join-Path $root 'App\Nexus.exe') -ArgumentList '--settings' -WorkingDirectory (Join-Path $root 'App') -WindowStyle Normal}
 # Only this updater's verified job is removed, never personal downloads.
 if((Test-Path -LiteralPath $job) -and !((Get-Item -LiteralPath $job).Attributes -band [IO.FileAttributes]::ReparsePoint)){Remove-Item -LiteralPath $job -Recurse -Force -ErrorAction SilentlyContinue}
}
