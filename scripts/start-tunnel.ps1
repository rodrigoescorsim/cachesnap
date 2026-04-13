# --- CacheSnap - Automatiza o Cloudflare Tunnel e atualiza o .env ----------------
# Uso: .\scripts\start-tunnel.ps1

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "[*] Iniciando Cloudflare Tunnel (via cmd /c npx)..." -ForegroundColor Cyan
$logFile = "cloudflared.log"

# Limpa o log anterior se existir
if (Test-Path $logFile) { Remove-Item $logFile }

# No Windows, npx eh um batch file, por isso chamamos via cmd /c
$process = Start-Process cmd.exe -ArgumentList "/c", "npx", "--yes", "cloudflared", "tunnel", "--url", "http://localhost:3001", "--protocol", "http2" `
    -RedirectStandardError $logFile -PassThru -WindowStyle Hidden

Write-Host "[*] Aguardando a geracao da URL (pode levar ate 60s)..." -ForegroundColor Yellow

$tunnelUrl = $null
$timeout = 60 
$start = Get-Date

while ($null -eq $tunnelUrl -and ((Get-Date) - $start).TotalSeconds -lt $timeout) {
    if (Test-Path $logFile) {
        try {
            $logLines = Get-Content $logFile -ErrorAction SilentlyContinue
            if ($logLines) {
                $match = $logLines | Select-String -Pattern "https://[a-zA-Z0-9-]+\.trycloudflare\.com"
                if ($match) {
                    $tunnelUrl = $match.Matches[0].Value.Trim()
                    break
                }
            }
        } catch {}
    }
    
    if ($process.HasExited) {
        Write-Host "[!] O processo do tunnel encerrou inesperadamente (npx failed)." -ForegroundColor Red
        if (Test-Path $logFile) { Get-Content $logFile -Tail 5 }
        break
    }
    
    Start-Sleep -Seconds 2
}

if ($null -eq $tunnelUrl) {
    Write-Host "[!] Tempo esgotado. Nao foi possivel capturar a URL." -ForegroundColor Red
    if (Test-Path $logFile) {
        Write-Host "--- Conteudo do cloudflared.log ---" -ForegroundColor DarkGray
        Get-Content $logFile 
    }
    exit 1
}

Write-Host "[+] Tunnel criado com sucesso!" -ForegroundColor Green
Write-Host "[+] Public URL: $tunnelUrl" -ForegroundColor Green

# --- Atualizar o .env ----------------------------------------------------------
if (Test-Path ".env") {
    $envContent = Get-Content ".env"
    $newEnvContent = $envContent -replace "^API_URL=.*", "API_URL=$tunnelUrl"
    $newEnvContent | Set-Content ".env"
    Write-Host "[+] Arquivo .env atualizado com a nova API_URL." -ForegroundColor Green
}

# In AWS Lambda mode, secrets are managed via AWS Console/CLI.
# [Legacy] .\scripts\workers-secrets.ps1

Write-Host ""
Write-Host "[+] STATUS: TUDO PRONTO!" -ForegroundColor Green
Write-Host "O tunel esta rodando em background (PID $($process.Id))." -ForegroundColor Yellow
Write-Host "Para encerrar: Stop-Process -Id $($process.Id)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Logs em tempo real (Ctrl+C para sair do log mas manter o tunel):" -ForegroundColor White
Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray

# Exibir logs em tempo real
Get-Content $logFile -Wait
