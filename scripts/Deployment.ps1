function Assert-NexusPackage([string]$Path) {
 $manifestPath=Join-Path $Path 'manifest.json'
 if(!(Test-Path -LiteralPath $manifestPath)){throw 'Package manifest is missing.'}
 $manifest=Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath|ConvertFrom-Json
 if($manifest.product -ne 'NexusScreensaver' -or !$manifest.files){throw 'Invalid package manifest.'}
 foreach($file in $manifest.files){
  if($file.path -notmatch '^[A-Za-z0-9_\-./\u4e00-\u9fff]+$' -or $file.path.Contains('..') -or $file.path.StartsWith('/')){throw 'Unsafe package path.'}
  $target=Join-Path $Path $file.path
  if(!(Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $file.sha256){throw ('Package validation failed: '+$file.path)}
 }
 foreach($required in @('Nexus.exe','Nexus.scr','Install.ps1','Uninstall.ps1','Deployment.ps1','ApplyUpdate.ps1','web/index.html','web/app.js')){if($required -notin @($manifest.files.path)){throw ('Required file missing: '+$required)}}
 if([version](Get-Item -LiteralPath (Join-Path $Path 'Nexus.exe')).VersionInfo.FileVersion -ne [version]($manifest.version+'.0')){throw 'Package version mismatch.'}
 return $manifest
}
function Remove-NexusManagedDirectory([string]$Path,[string]$Parent) {
 $full=[IO.Path]::GetFullPath($Path);$owner=[IO.Path]::GetFullPath($Parent).TrimEnd('\')
 if([IO.Path]::GetDirectoryName($full) -ne $owner){throw 'Cleanup target is outside managed directory.'}
 if(Test-Path -LiteralPath $full){
  if((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing directory link.'}
  if(Get-ChildItem -LiteralPath $full -Force -Recurse|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Refusing nested directory link.'}
  Remove-Item -LiteralPath $full -Recurse -Force
 }
}
function Move-NexusDirectory([string]$Source,[string]$Destination){
 for($attempt=0;$attempt -lt 40;$attempt++){try{[IO.Directory]::Move($Source,$Destination);return}catch{if($attempt -eq 39){throw};Start-Sleep -Milliseconds 250}}
}
function Invoke-NexusDeployment([string]$Source,[string]$Root,[bool]$TestMode,[scriptblock]$Register,[string]$FailurePoint='') {
 $manifest=Assert-NexusPackage $Source
 New-Item -ItemType Directory -Path $Root -Force|Out-Null
 $app=Join-Path $Root 'App';$stage=Join-Path $Root 'App.new';$old=Join-Path $Root 'App.previous'
 # Recover a swap interrupted by shutdown before proceeding.
 if(!(Test-Path -LiteralPath $app) -and (Test-Path -LiteralPath $old)){Move-NexusDirectory $old $app}
 foreach($target in @($app,$stage,$old)){if((Test-Path -LiteralPath $target) -and ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unexpected installation directory link.'}}
 if([IO.Path]::GetFullPath($Source).TrimEnd('\') -eq [IO.Path]::GetFullPath($app).TrimEnd('\')){& $Register $manifest;return}
 Remove-NexusManagedDirectory $stage $Root
 New-Item -ItemType Directory -Path $stage|Out-Null
 try {
  foreach($file in $manifest.files){$to=Join-Path $stage $file.path;New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force|Out-Null;Copy-Item -LiteralPath (Join-Path $Source $file.path) -Destination $to}
  Copy-Item -LiteralPath (Join-Path $Source 'manifest.json') -Destination $stage
  [void](Assert-NexusPackage $stage)
  if(!$TestMode){
   Get-Process 'Nexus*' -ErrorAction SilentlyContinue|Where-Object{$_.Path -eq (Join-Path $app 'Nexus.exe') -or $_.Path -eq (Join-Path $app 'Nexus.scr')}|ForEach-Object{if(!$_.CloseMainWindow() -or !$_.WaitForExit(2500)){Stop-Process -Id $_.Id -ErrorAction Stop}}
  }
  Remove-NexusManagedDirectory $old $Root
  if(Test-Path -LiteralPath $app){Move-NexusDirectory $app $old}
  try {
   Move-NexusDirectory $stage $app
   if($TestMode -and $FailurePoint -eq 'AfterSwap'){throw 'Injected deployment failure.'}
   if(!$TestMode){
    $health=Start-Process -FilePath (Join-Path $app 'Nexus.exe') -ArgumentList '--update-healthcheck' -WorkingDirectory $Root -WindowStyle Hidden -PassThru
    if(!$health.WaitForExit(30000)){$health.Kill();throw 'New application startup check timed out.'}
    if($health.ExitCode -ne 0){throw 'New application startup check failed.'}
    $profile=Join-Path $Root 'HealthCheck'
    Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'"|Where-Object{$_.CommandLine -and $_.CommandLine.Contains($profile)}|ForEach-Object{Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue}
    for($retry=0;$retry -lt 20;$retry++){try{Remove-NexusManagedDirectory $profile $Root;break}catch{Start-Sleep -Milliseconds 250}}
    foreach($artifact in @('native-smoke.json','native-smoke.png')){Remove-Item -LiteralPath (Join-Path $app $artifact) -Force -ErrorAction SilentlyContinue}
   }
   & $Register $manifest
  }catch{
   Remove-NexusManagedDirectory $app $Root
   if(Test-Path -LiteralPath $old){Move-NexusDirectory $old $app}
   throw
  }
  # Cleanup errors must never roll back an already working, registered version.
  try{Remove-NexusManagedDirectory $old $Root}catch{Write-Warning 'Previous version cleanup deferred until the next installation.'}
 }finally{if(Test-Path -LiteralPath $stage){Remove-NexusManagedDirectory $stage $Root}}
}
