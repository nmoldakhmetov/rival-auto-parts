# ============================================================
#  Rival Auto Parts - local one-command setup (Windows)
#  Run from the project folder:   powershell -ExecutionPolicy Bypass -File .\setup.ps1
# ============================================================
$ErrorActionPreference = "Stop"

# --- DB settings: must match DATABASE_URL in your .env ---
$DbName     = "rival_auto_parts"
$DbUser     = "postgres"
$DbPassword = "postgres"      # <-- change if your PostgreSQL 'postgres' password is different
$DbHost     = "localhost"
$DbPort     = "5432"

Write-Host "== Rival Auto Parts - local setup ==" -ForegroundColor Cyan

# 1) Node.js
try { $nv = (node -v) } catch { $nv = $null }
if (-not $nv) {
  Write-Host "Node.js not found. Install Node 20+ from https://nodejs.org , reopen PowerShell and re-run." -ForegroundColor Red
  exit 1
}
Write-Host ("Node.js: " + $nv) -ForegroundColor Green

# 2) Locate PostgreSQL client tools (psql)
$psqlItem = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
if ($psqlItem) { $psql = $psqlItem.FullName }
else {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { $psql = $cmd.Source }
}
if (-not $psql) {
  Write-Host "PostgreSQL not found. Install PostgreSQL 15+ from https://www.postgresql.org/download/windows/ and re-run." -ForegroundColor Red
  exit 1
}
Write-Host ("PostgreSQL: " + $psql) -ForegroundColor Green
$env:PGPASSWORD = $DbPassword
$env:PGCLIENTENCODING = "UTF8"

# 3) .env
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Write-Host ".env created from .env.example" -ForegroundColor Green }
else { Write-Host ".env already exists (kept as is)" -ForegroundColor Yellow }

# 4) Dependencies
Write-Host "Installing dependencies (npm install) ..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed." -ForegroundColor Red; exit 1 }

# 5) (Re)create the database fresh
Write-Host "Creating database '$DbName' ..." -ForegroundColor Cyan
& $psql -h $DbHost -p $DbPort -U $DbUser -d postgres -q -c "DROP DATABASE IF EXISTS $DbName;"
& $psql -h $DbHost -p $DbPort -U $DbUser -d postgres -q -c "CREATE DATABASE $DbName;"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Could not create the database. Check that PostgreSQL is running and the password above is correct." -ForegroundColor Red
  exit 1
}

# 6) Load catalog data
if (Test-Path "db-seed.sql") {
  Write-Host "Loading catalog from db-seed.sql (~18 MB, a few seconds) ..." -ForegroundColor Cyan
  & $psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -q -v ON_ERROR_STOP=1 -f "db-seed.sql"
  if ($LASTEXITCODE -ne 0) { Write-Host "Data load failed." -ForegroundColor Red; exit 1 }
} else {
  Write-Host "db-seed.sql NOT found - creating schema + demo accounts (catalog will be EMPTY)." -ForegroundColor Yellow
  Write-Host "  To get the catalog: ask the owner to send you 'db-seed.sql', drop it in this" -ForegroundColor Yellow
  Write-Host "  folder and re-run setup; OR after 'npm run dev' log in as admin and sync from 1C." -ForegroundColor Yellow
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { Write-Host "prisma migrate deploy failed." -ForegroundColor Red; exit 1 }
  node prisma/seed.mjs
}

# 7) Prisma client
Write-Host "Generating Prisma client ..." -ForegroundColor Cyan
npx prisma generate | Out-Null

Write-Host ""
Write-Host "==================== DONE ====================" -ForegroundColor Green
Write-Host "Start the site:" -ForegroundColor Yellow
Write-Host "    npm run dev" -ForegroundColor White
Write-Host "Then open:  http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Logins:  admin/admin123   manager/manager123   client/client123" -ForegroundColor Cyan
Write-Host "============================================="
