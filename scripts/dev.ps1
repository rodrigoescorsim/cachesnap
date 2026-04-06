Write-Host "[*] Subindo infraestrutura (TimescaleDB + Redis)..." -ForegroundColor Cyan
docker-compose up -d

Write-Host "[*] Aguardando TimescaleDB ficar pronto..." -ForegroundColor Yellow
do {
    Start-Sleep -Seconds 1
    docker-compose exec -T -e PGPASSWORD=changeme_local db pg_isready -U hoplens -q *>$null
    $ready = $LASTEXITCODE -eq 0
} until ($ready)

Write-Host "[+] Infraestrutura pronta!" -ForegroundColor Green

Write-Host "[*] Iniciando Backend (Rust API) em uma nova janela..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd api; Write-Host '--- Iniciando Rust API ---' -ForegroundColor Magenta; cargo run"

Write-Host "[*] Iniciando Frontend (Next.js) em uma nova janela..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host '--- Iniciando Next.js ---' -ForegroundColor Blue; npm run dev"

Write-Host ""
Write-Host "✅ Tudo pronto! O HopLens está sendo inicializado." -ForegroundColor Green
Write-Host "   API:       http://localhost:3001"
Write-Host "   Dashboard: http://localhost:3000"
Write-Host "   DB:        postgresql://hoplens:changeme_local@localhost:5432/hoplens"
