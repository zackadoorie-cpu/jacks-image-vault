param([Parameter(Mandatory=$true)][string]$ExecutablePath)
$ErrorActionPreference = 'Stop'
$process = $null
$original = $env:LOCALAPPDATA
$env:LOCALAPPDATA = Join-Path $env:RUNNER_TEMP ('VaultServerOnly-' + [guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Force -Path $env:LOCALAPPDATA | Out-Null
    $process = Start-Process -FilePath $ExecutablePath -ArgumentList '--serve-only' -PassThru -WindowStyle Hidden
    $ready = $false
    for ($attempt=0; $attempt -lt 50; $attempt++) {
        if ($process.HasExited) { throw 'Server-only launcher exited before readiness' }
        try {
            $result = Invoke-WebRequest -Uri 'http://127.0.0.1:8765/__vault_health' -UseBasicParsing -TimeoutSec 2
            if ($result.Headers['X-Vault-App'] -eq 'JACKS_IMAGE_VAULT_EXE_V2') { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 350 }
    }
    if (-not $ready) { throw 'Server-only mode failed to serve the trusted local app' }
    if ($process.HasExited) { throw 'Server-only mode exited unexpectedly' }
    $page = Invoke-WebRequest -Uri 'http://127.0.0.1:8765/' -UseBasicParsing -TimeoutSec 5
    if ($page.StatusCode -ne 200 -or $page.Content -notmatch "Jack's Image Vault") {
        throw 'Native server-only mode did not serve the UI'
    }
    Write-Host 'PASS: --serve-only starts native loopback server without requesting browser launch.'
} finally {
    if ($process) {
        try { if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force } } catch {}
    }
    $env:LOCALAPPDATA = $original
}
