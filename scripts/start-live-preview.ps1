$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendPath = Join-Path $repoRoot 'frontend'
$backendPath = Join-Path $repoRoot 'backend'
$frontendPort = 4174
$backendPort = 4001
$frontendLocalUrl = "http://localhost:$frontendPort"
$backendLocalUrl = "http://localhost:$backendPort"

function Test-PortListening {
  param(
    [int]$Port
  )

  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-NetworkUrls {
  param(
    [int]$Port
  )

  $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.PrefixOrigin -ne 'WellKnown'
    } |
    Select-Object -ExpandProperty IPAddress -Unique

  return $addresses | ForEach-Object { "http://${_}:$Port" }
}

function Start-ServiceWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $escapedWorkingDirectory = $WorkingDirectory.Replace("'", "''")
  $fullCommand = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$escapedWorkingDirectory'; $Command"

  Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $fullCommand | Out-Null
}

if (-not (Test-PortListening -Port $backendPort)) {
  Start-ServiceWindow -Title 'Super M2 Backend Live' -WorkingDirectory $backendPath -Command 'npm run dev'
}

if (-not (Test-PortListening -Port $frontendPort)) {
  Start-ServiceWindow -Title 'Super M2 Frontend Live' -WorkingDirectory $frontendPath -Command 'npm run dev:live'
}

$frontendNetworkUrls = Get-NetworkUrls -Port $frontendPort
$backendNetworkUrls = Get-NetworkUrls -Port $backendPort

Write-Host ''
Write-Host 'Super M2 live preview is ready to use.' -ForegroundColor Green
Write-Host ''
Write-Host 'Frontend local:' -ForegroundColor Cyan
Write-Host "  $frontendLocalUrl"
Write-Host 'Frontend network:' -ForegroundColor Cyan

if ($frontendNetworkUrls.Count) {
  $frontendNetworkUrls | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host '  No LAN IPv4 address detected.'
}

Write-Host ''
Write-Host 'Backend local:' -ForegroundColor Yellow
Write-Host "  $backendLocalUrl/api"
Write-Host 'Backend network:' -ForegroundColor Yellow

if ($backendNetworkUrls.Count) {
  $backendNetworkUrls | ForEach-Object { Write-Host "  $_/api" }
} else {
  Write-Host '  No LAN IPv4 address detected.'
}

Write-Host ''
Write-Host 'Any frontend edit will appear immediately through Vite HMR.' -ForegroundColor Green
Start-Process $frontendLocalUrl | Out-Null