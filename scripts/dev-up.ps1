param(
  [switch]$NoPortCleanup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
  Stop-PortOwner -Port 5173
  Stop-PortOwner -Port 5174
  Stop-PortOwner -Port 5180
}

Write-Host "[dev-up] Iniciando API + frontend..."
pnpm -r --parallel --stream --filter @workspace/api-server --filter @workspace/colon-3d run dev
