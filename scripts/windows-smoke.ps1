param(
  [Parameter(Mandatory = $true)]
  [string]$ExecutablePath
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$base = 'http://127.0.0.1:8765'
$process = $null
try {
  if (-not (Test-Path -LiteralPath $ExecutablePath)) {
    throw "Windows EXE not found: $ExecutablePath"
  }
  $process = Start-Process -FilePath $ExecutablePath -PassThru -WindowStyle Hidden
  $ready = $false
  for ($attempt = 1; $attempt -le 50; $attempt++) {
    if ($process.HasExited) { throw "Native Image Vault process exited before server readiness" }
    try {
      $response = Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    }
    catch {
      Start-Sleep -Milliseconds 400
    }
  }
  if (-not $ready) { throw 'Image Vault did not serve localhost:8765 within the bounded readiness window' }
  $html = (Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 10).Content
  foreach ($marker in @('id="similarityView"', 'id="videoLibraryView"', 'id="storyboardButton"', 'id="videoEvidenceStatus"')) {
    if (-not $html.Contains($marker)) { throw "Native HTML missing expected Phase 4/5 UI marker: $marker" }
  }
  $js = (Invoke-WebRequest -Uri "$base/app.js" -UseBasicParsing -TimeoutSec 10).Content
  foreach ($marker in @('GENERATED SIMILARITY LAB START', 'GENERATED VIDEO LIBRARY START', 'GENERATED VIDEO CONTROLLER START')) {
    if (-not $js.Contains($marker)) { throw "Native JS missing expected bundled feature: $marker" }
  }
  $status = Invoke-RestMethod -Uri "$base/__vault_update/status" -TimeoutSec 10
  if (-not $status.version) { throw 'Native update endpoint did not return an app version' }
  $integration = Invoke-RestMethod -Uri "$base/__vault_windows/status" -TimeoutSec 10
  if ($integration.available -ne $true -or -not $integration.shortcutName) {
    throw 'Windows integration capability is not available to the native EXE'
  }
  # Never actually install Windows shortcuts on CI; only test capability
  # discovery and reject unauthenticated mutation attempts.
  $refused = $false
  try {
    Invoke-WebRequest -Method POST -Uri "$base/__vault_windows/install" -Body '{}' -ContentType 'application/json' -UseBasicParsing -TimeoutSec 10 | Out-Null
  } catch {
    $refused = ([int]$_.Exception.Response.StatusCode -eq 403)
  }
  if (-not $refused) { throw 'Native Windows install endpoint allowed a request without app nonce' }
  Write-Host ("Windows native HTTP smoke passed: " + $status.version)
  Write-Host 'Both Phase 4/5 views and runtime bundles served from the real Windows EXE.'
  Write-Host 'No Drive account used, no media downloaded, no spreadsheet or files changed.'
}
finally {
  if ($process) {
    try {
      if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
      }
    } catch { Write-Warning "Could not stop native smoke process: $($_.Exception.Message)" }
  }
}
