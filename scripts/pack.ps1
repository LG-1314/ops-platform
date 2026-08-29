# Ops Cockpit one-click build and pack
# Usage: double-click pack.bat, or: powershell -File scripts/pack.ps1
# One run produces both NSIS installer and green portable zip
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Step([string]$msg) {
  Write-Host ""
  Write-Host "=== $msg ===" -ForegroundColor Cyan
}

Step "1/6 Close old app instances"
Get-Process -ErrorAction SilentlyContinue | Where-Object {
  ($_.Path -and (
    $_.Path -like '*ops-platform*' -or
    $_.Path -like '*\release\win-unpacked\*' -or
    $_.Path -like '*release-v2*' -or
    $_.Path -like '*release-final*'
  )) -or ($_.ProcessName -like '*OpsCockpit*')
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

Step "2/6 Clean old build output"
@(
  'release',
  'release-v2',
  'release-enterprise',
  'release-final',
  'release-final-new',
  'dist',
  'dist-electron'
) | ForEach-Object {
  Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue
}

Step "3/6 Unit tests"
npm test
if ($LASTEXITCODE -ne 0) { Write-Error "TEST FAILED"; exit 1 }

Step "4/6 Build frontend and Electron main"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "BUILD FAILED"; exit 1 }

Step "5/6 Package Windows installer"
npx electron-builder --win --x64 --config.directories.output=release
if ($LASTEXITCODE -ne 0) { Write-Error "PACK FAILED"; exit 1 }

Remove-Item -Force release/builder-debug.yml -ErrorAction SilentlyContinue
Get-ChildItem release/*.blockmap -ErrorAction SilentlyContinue | Remove-Item -Force

Step "6/6 Pack green portable zip"
if (-not (Test-Path 'release\win-unpacked')) {
  Write-Error "GREEN PACK FAILED: release\win-unpacked missing"
  exit 1
}
$pkg = Get-Content package.json -Raw -Encoding UTF8 | ConvertFrom-Json
$product = $pkg.build.productName
$ver = $pkg.version
$greenZip = Join-Path (Resolve-Path 'release').Path ("{0}-{1}-green.zip" -f $product, $ver)
if (Test-Path $greenZip) { Remove-Item -Force $greenZip }
# Fast zip: Optimal is enough for portable delivery; max LZMA is too slow
Compress-Archive -Path 'release\win-unpacked\*' -DestinationPath $greenZip -CompressionLevel Optimal -Force
if (-not (Test-Path $greenZip)) {
  Write-Error "GREEN PACK FAILED: zip not created"
  exit 1
}

Write-Host ""
Write-Host "DONE. Deliverables:" -ForegroundColor Green
Get-ChildItem release\*.exe, release\*.zip -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("  " + $_.Name + "  (" + [math]::Round($_.Length / 1MB) + " MB)") -ForegroundColor Green
}
Write-Host "  Green folder: release\win-unpacked\" -ForegroundColor Green
Write-Host ""
