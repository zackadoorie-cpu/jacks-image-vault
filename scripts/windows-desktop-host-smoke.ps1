param(
  [string]$OutputDirectory = "",
  [string]$Version = "2.1.19"
)
$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $env:RUNNER_TEMP 'JacksDesktopBuild' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

# Build the matching Go backend under a deterministic semver filename.
$server = Join-Path $OutputDirectory "Jacks_Image_Vault_$Version.exe"
go build -trimpath -ldflags "-H windowsgui -X main.builtinVersion=$Version" -o $server .
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $server)) {
  throw 'Go desktop backend build failed'
}

# The icon comes from the committed branding PNG, never from user content.
python -m pip install --disable-pip-version-check "Pillow>=11,<13"
if ($LASTEXITCODE -ne 0) { throw 'Pillow install failed' }
python scripts/build-desktop-icon.py
if ($LASTEXITCODE -ne 0) { throw 'Desktop ICO generation failed' }

$hostFolder = Join-Path $OutputDirectory 'published-host'
$publishArgs = @(
 'publish', 'windows-host/JacksImageVault.Desktop.csproj',
 '--configuration', 'Release', '--runtime', 'win-x64',
 '--self-contained', 'true',
 '-p:PublishSingleFile=true',
 '-p:IncludeNativeLibrariesForSelfExtract=true',
 '-p:EnableCompressionInSingleFile=true',
 '-p:PublishTrimmed=false',
 '--output', $hostFolder
)
& dotnet @publishArgs
if ($LASTEXITCODE -ne 0) { throw 'WinForms WebView2 host publishing failed' }

$hostExe = Join-Path $hostFolder 'Jacks_Image_Vault_Desktop.exe'
if (-not (Test-Path -LiteralPath $hostExe)) { throw 'WebView2 host EXE missing from published bundle' }
Copy-Item -LiteralPath $hostExe -Destination (Join-Path $OutputDirectory 'Jacks_Image_Vault_Desktop.exe') -Force
$hostPath = Join-Path $OutputDirectory 'Jacks_Image_Vault_Desktop.exe'

# Run the new desktop executable with fake data and no GUI. It starts the real
# matching Go process in server-only mode, verifies health, then kills only its
# own CI child process.
$process = Start-Process -FilePath $hostPath -ArgumentList '--self-test' -Wait -PassThru
if ($process.ExitCode -ne 0) {
  throw "Desktop backend handshake smoke test failed with exit code $($process.ExitCode)"
}
Write-Host "PASS: native desktop host, branded icon, and verified local Go server handshake."
