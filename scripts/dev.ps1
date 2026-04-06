Write-Host "[*] Subindo infraestrutura (TimescaleDB + Redis)..."
docker-compose up -d

Write-Host "[*] Aguardando TimescaleDB ficar pronto..."
do {
    Start-Sleep -Seconds 1
    docker-compose exec -T -e PGPASSWORD=changeme_local db pg_isready -U hoplens -q *>$null
    $ready = $LASTEXITCODE -eq 0
} until ($ready)

Write-Host "[+] Infraestrutura pronta!"
Write-Host ""
Write-Host " Abra dois terminais adicionais e execute:"
Write-Host ""
Write-Host "   Terminal 1 - Rust API:"
Write-Host "   cd api ; cargo watch -x run (ou apenas cargo run se nao tiver o cargo-watch)"
Write-Host ""
Write-Host "   Terminal 2 - Next.js Dashboard:"
Write-Host "   npm run dev"
Write-Host ""
Write-Host "   API:       http://localhost:3001"
Write-Host "   Dashboard: http://localhost:3000"
Write-Host "   DB:        postgresql://hoplens:changeme_local@localhost:5432/hoplens"
