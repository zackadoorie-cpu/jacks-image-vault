param(
  [Parameter(Mandatory = $true)]
  [string]$ExecutablePath
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$base = 'http://127.0.0.1:8765'
$originalLocalAppData = $env:LOCALAPPDATA
$env:LOCALAPPDATA = Join-Path $env:RUNNER_TEMP 'VaultNativeUpgradeSmoke'
$vaultData = Join-Path $env:LOCALAPPDATA 'JacksImageVault'
$webCopy = Join-Path $env:RUNNER_TEMP 'VaultSmokeWeb'
$zipPath = Join-Path $env:RUNNER_TEMP 'vault-native-upgrade-smoke.zip'
$marker = 'vault-native-upgrade-smoke-marker'
$process = $null

function Start-Vault {
  $script:process = Start-Process -FilePath $ExecutablePath -PassThru -WindowStyle Hidden
  for ($i=0; $i -lt 60; $i++) {
    if ($script:process.HasExited) { throw "Native EXE exited before serving localhost" }
    try {
      $r = Invoke-WebRequest -Uri "$base/__vault_health" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { return }
    } catch { Start-Sleep -Milliseconds 350 }
  }
  throw 'Native EXE did not start within bounded readiness window'
}
function Stop-Vault {
  if ($script:process) {
    try {
      if (-not $script:process.HasExited) { Stop-Process -Id $script:process.Id -Force }
    } catch { Write-Warning "Could not end smoke EXE: $($_.Exception.Message)" }
    $script:process = $null
    Start-Sleep -Milliseconds 650
  }
}
function Send-Update([string]$uri,[byte[]]$content,[string]$mime,[string]$nonce) {
  $client = [System.Net.Http.HttpClient]::new()
  try {
    $request = [System.Net.Http.HttpRequestMessage]::new('POST', "$base$uri")
    $request.Headers.Add('X-Vault-Nonce', $nonce)
    $request.Content = [System.Net.Http.ByteArrayContent]::new($content)
    $request.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new($mime)
    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
      throw "Update endpoint $uri rejected request: $([int]$response.StatusCode) $body"
    }
    return ($body | ConvertFrom-Json)
  } finally { $client.Dispose() }
}

try {
  if (-not (Test-Path -LiteralPath $ExecutablePath)) { throw "EXE missing: $ExecutablePath" }
  New-Item -ItemType Directory -Path $env:LOCALAPPDATA -Force | Out-Null
  New-Item -ItemType Directory -Path $vaultData -Force | Out-Null
  New-Item -ItemType Directory -Path $webCopy -Force | Out-Null
  Copy-Item -Path (Join-Path (Get-Location) 'web/*') -Destination $webCopy -Recurse -Force
  Add-Content -LiteralPath (Join-Path $webCopy 'index.html') -Value "<!-- $marker -->" -Encoding utf8
  Set-Content -LiteralPath (Join-Path $vaultData 'smoke-user-data.txt') -Value 'preserve this data' -Encoding UTF8
  & python make_patch.py --version 2.0.1 --web $webCopy --output $zipPath --notes 'Fabricated Windows EXE upgrade smoke only'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $zipPath)) { throw 'Failed to generate valid smoke ZIP' }
  Start-Vault
  $before = Invoke-RestMethod -Uri "$base/__vault_update/status"
  if ($before.version -ne '2.0.0' -or $before.source -ne 'built-in') {
    throw "Expected clean unversioned smoke EXE, got $($before.version) / $($before.source)"
  }
  $install = Send-Update '/__vault_update/install-local' ([IO.File]::ReadAllBytes($zipPath)) 'application/zip' $before.nonce
  if ($install.installed -ne '2.0.1') { throw 'Local ZIP installation did not report v2.0.1' }
  $patched = Invoke-RestMethod -Uri "$base/__vault_update/status"
  if ($patched.version -ne '2.0.1' -or $patched.source -ne 'patched') { throw 'Patched version not active' }
  $patchedHTML = (Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 10).Content
  if (-not $patchedHTML.Contains($marker)) { throw 'Patched UI was not served by real native EXE' }

  Stop-Vault
  Start-Vault
  $afterRestart = Invoke-RestMethod -Uri "$base/__vault_update/status"
  $restartHTML = (Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 10).Content
  if ($afterRestart.version -ne '2.0.1' -or -not $restartHTML.Contains($marker)) {
    throw 'Patched version did not survive a native Windows EXE restart'
  }

  $rollback = Send-Update '/__vault_update/rollback' ([Text.Encoding]::UTF8.GetBytes('{}')) 'application/json' $afterRestart.nonce
  $reverted = Invoke-RestMethod -Uri "$base/__vault_update/status"
  $originalHTML = (Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 10).Content
  if ($reverted.version -ne '2.0.0' -or $reverted.source -ne 'built-in' -or $originalHTML.Contains($marker)) {
    throw 'Native rollback did not restore the bundled UI'
  }
  $sentinel = Get-Content -LiteralPath (Join-Path $vaultData 'smoke-user-data.txt') -Raw
  if (-not $sentinel.Contains('preserve this data')) { throw 'User metadata was lost during upgrade/rollback' }
  Write-Host 'PASS: Native Windows install, serving patched UI, restart persistence, rollback and user-data preservation.'
} finally {
  Stop-Vault
  $env:LOCALAPPDATA = $originalLocalAppData
}
