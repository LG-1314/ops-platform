# Ops Cockpit - One-click build & pack script
# Usage: double-click pack.bat, or run:  powershell -File pack.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Step($msg) {
  Write-Host ""
  Write-Host "=== $msg ===" -ForegroundColor Cyan
}

Step "1/4 Close running old instances (avoid file lock)"
Get-Process | Where-Object {
  $_.Path -like '*ops-platform*' -or $_.Path -like '*release-v2*'
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

Step "2/4 Clean old build output"
Remove-Item -Recurse -Force release-v2 -ErrorAction SilentlyContinue

Step "3/4 Build (frontend + Electron main)"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "BUILD FAILED"; exit 1 }

Step "4/4 Package Windows installer (NSIS)"
npx electron-builder --win --x64 --config.directories.output=release-v2
if ($LASTEXITCODE -ne 0) { Write-Error "PACK FAILED"; exit 1 }

# Keep only deliverables, remove debug-only files
Remove-Item -Force release-v2/builder-debug.yml -ErrorAction SilentlyContinue
Remove-Item -Force release-v2/*.blockmap -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "DONE. Deliverables:" -ForegroundColor Green
Get-ChildItem release-v2/*.exe | ForEach-Object {
  Write-Host ("  " + $_.Name + "  (" + [math]::Round($_.Length / 1MB) + " MB)") -ForegroundColor Green
}
Write-Host "  Portable version: release-v2/win-unpacked/" -ForegroundColor Green
Write-Host ""
