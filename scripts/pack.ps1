# Ops Cockpit one-click build and pack
# Usage: double-click pack.bat, or: powershell -File scripts/pack.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Step([string]$msg) {
  Write-Host ""
  Write-Host "=== $msg ===" -ForegroundColor Cyan
}

Step "1/5 Close old app instances"
Get-Process -ErrorAction SilentlyContinue | Where-Object {
  ($_.Path -and (
    $_.Path -like '*ops-platform*' -or
    $_.Path -like '*\release\win-unpacked\*' -or
    $_.Path -like '*release-v2*' -or
    $_.Path -like '*release-final*'
  )) -or ($_.ProcessName -like '*OpsCockpit*')
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

Step "2/5 Clean old build output"
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

Step "3/5 Unit tests"
npm test
if ($LASTEXITCODE -ne 0) { Write-Error "TEST FAILED"; exit 1 }

Step "4/5 Build frontend and Electron main"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "BUILD FAILED"; exit 1 }

Step "5/5 Package Windows NSIS installer"
npx electron-builder --win --x64 --config.directories.output=release
if ($LASTEXITCODE -ne 0) { Write-Error "PACK FAILED"; exit 1 }

Remove-Item -Force release/builder-debug.yml -ErrorAction SilentlyContinue
Get-ChildItem release/*.blockmap -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host ""
Write-Host "DONE. Deliverables:" -ForegroundColor Green
Get-ChildItem release/*.exe | ForEach-Object {
  Write-Host ("  " + $_.FullName + "  (" + [math]::Round($_.Length / 1MB) + " MB)") -ForegroundColor Green
}
Write-Host "  Portable dir: release/win-unpacked/" -ForegroundColor Green
Write-Host ""
