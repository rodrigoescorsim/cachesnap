# Load root .env into current process so spawned windows inherit vars needed
# by sqlx compile-time query macros (DATABASE_URL) and the API runtime.
$rootEnv = Join-Path $PSScriptRoot "..\.env"
Get-Content $rootEnv |
    Where-Object { $_ -match '^\s*[A-Za-z_]' -and $_ -notmatch '^\s*#' } |
    ForEach-Object {
        $kv = $_ -split '=', 2
        if ($kv.Count -eq 2) {
            $k = $kv[0].Trim(); $v = $kv[1].Trim()
            [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
        }
    }

Write-Host "[*] Subindo infraestrutura (TimescaleDB + Redis)..." -ForegroundColor Cyan
docker-compose up -d

Write-Host "[*] Aguardando TimescaleDB ficar pronto..." -ForegroundColor Yellow
do {
    Start-Sleep -Seconds 1
    docker-compose exec -T -e PGPASSWORD=changeme_local db pg_isready -U CacheSnap -q *>$null
    $ready = $LASTEXITCODE -eq 0
} until ($ready)

Write-Host "[+] Infraestrutura pronta!" -ForegroundColor Green

Write-Host "[*] Aplicando migrations pendentes..." -ForegroundColor Yellow
Push-Location api
cargo sqlx migrate run --source ../migrations
Pop-Location
Write-Host "[+] Migrations aplicadas!" -ForegroundColor Green

Write-Host "[*] Iniciando Backend (Rust API) em uma nova janela..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd api; Write-Host '--- Iniciando Rust API ---' -ForegroundColor Magenta; cargo run"

Write-Host "[*] Iniciando Frontend (Next.js) em uma nova janela..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host '--- Iniciando Next.js ---' -ForegroundColor Blue; npm run dev"

Write-Host ""
Write-Host "[+] Tudo pronto! O CacheSnap esta sendo inicializado." -ForegroundColor Green
Write-Host "   API:       http://localhost:3001"
Write-Host "   Dashboard: http://localhost:3000"
Write-Host "   DB:        postgresql://CacheSnap:changeme_local@localhost:5432/CacheSnap"
