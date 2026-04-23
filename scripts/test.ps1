
Write-Host "[*] Iniciando testes do CacheSnap..." -ForegroundColor Cyan

# 1. Testes do Backend (Rust)
Write-Host "`n[*] Rodando testes do Backend (Rust)..." -ForegroundColor Magenta
Push-Location api
cargo test
$rustExit = $LASTEXITCODE
Pop-Location

# 2. Testes do Frontend (Vitest)
Write-Host "`n[*] Rodando testes do Frontend (Next.js/Vitest)..." -ForegroundColor Blue
npm run test
$nextExit = $LASTEXITCODE

Write-Host "`n--- Resumo dos Testes ---" -ForegroundColor Cyan
if ($rustExit -eq 0) {
    Write-Host "[+] Backend: PASSOU" -ForegroundColor Green
} else {
    Write-Host "[-] Backend: FALHOU" -ForegroundColor Red
}

if ($nextExit -eq 0) {
    Write-Host "[+] Frontend: PASSOU" -ForegroundColor Green
} else {
    Write-Host "[-] Frontend: FALHOU" -ForegroundColor Red
}

if ($rustExit -eq 0 -and $nextExit -eq 0) {
    Write-Host "`n[SUCCESS] Todos os sistemas operacionais." -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n[ERROR] Falha detectada em um ou mais sistemas." -ForegroundColor Red
    exit 1
}
