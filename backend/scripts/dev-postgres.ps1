param(
  [ValidateSet('init', 'start', 'stop', 'status')]
  [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$devRoot = Join-Path (Split-Path $PSScriptRoot -Parent) '.dev-postgres'
$dataDir = Join-Path $devRoot 'data'
$logDir = $devRoot
$port = 5433

function Assert-PgBin {
  if (-not (Test-Path "$pgBin\pg_ctl.exe")) {
    throw "PostgreSQL 18 not found at $pgBin. Install PostgreSQL 18 or update scripts/dev-postgres.ps1."
  }
}

switch ($Action) {
  'init' {
    Assert-PgBin
    if (Test-Path "$dataDir\PG_VERSION") {
      Write-Host 'Dev PostgreSQL data directory already exists.'
      exit 0
    }
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    & "$pgBin\initdb.exe" -D $dataDir -U postgres -A trust --encoding=UTF8 --locale=C
    Write-Host "Initialized dev PostgreSQL in $dataDir"
  }
  'start' {
    Assert-PgBin
    if (-not (Test-Path "$dataDir\PG_VERSION")) {
      & $PSCommandPath -Action init
    }
    $ready = & "$pgBin\pg_isready.exe" -h localhost -p $port 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host $ready
    } else {
      New-Item -ItemType Directory -Force -Path $logDir | Out-Null
      & "$pgBin\pg_ctl.exe" -D $dataDir -l "$logDir\postgres.log" -o "-p $port" start
      $ready = & "$pgBin\pg_isready.exe" -h localhost -p $port 2>&1
      Write-Host $ready
    }
    $dbExists = & "$pgBin\psql.exe" -h localhost -p $port -U postgres -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'makhana_erp'" 2>$null
    if (-not ($dbExists -match '1')) {
      & "$pgBin\createdb.exe" -h localhost -p $port -U postgres makhana_erp
      Write-Host 'Created database makhana_erp'
    }
  }
  'stop' {
    Assert-PgBin
    & "$pgBin\pg_ctl.exe" -D $dataDir stop
  }
  'status' {
    Assert-PgBin
    & "$pgBin\pg_ctl.exe" -D $dataDir status
  }
}
