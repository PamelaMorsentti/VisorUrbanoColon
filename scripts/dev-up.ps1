param(
  [switch]$NoPortCleanup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Import-DotEnv {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) {
      return
    }

    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"')
    if ($key -eq "PORT") {
      return
    }
    if ($key) {
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}

function Stop-PortOwner {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    return
  }

  $ownerPids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($ownerPid in $ownerPids) {
    try {
      $proc = Get-Process -Id $ownerPid -ErrorAction Stop
      Write-Host "[dev-up] Cerrando proceso $($proc.ProcessName) (PID $ownerPid) en puerto $Port"
      Stop-Process -Id $ownerPid -Force -ErrorAction Stop
    }
    catch {
      Write-Host "[dev-up] No se pudo cerrar PID $ownerPid en puerto ${Port}: $($_.Exception.Message)"
    }
  }
}

if (-not $NoPortCleanup) {
  Stop-PortOwner -Port 3000
  Stop-PortOwner -Port 5173
  Stop-PortOwner -Port 5174
  Stop-PortOwner -Port 5180
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Import-DotEnv -Path (Join-Path $repoRoot ".env")

Write-Host "[dev-up] Iniciando API + frontend..."
pnpm -r --parallel --stream --filter @workspace/api-server --filter @workspace/colon-3d run dev
