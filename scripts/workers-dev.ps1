# --- HopLens - Worker local / probe de teste (Windows) -----------------------
# Sobe o CF Worker em modo local e opcionalmente dispara um probe de teste.
#
# Uso:
#   .\scripts\workers-dev.ps1                                   # so sobe o worker
#   .\scripts\workers-dev.ps1 test <monitor_id> [url]           # sobe + probe
#
# Exemplos:
#   .\scripts\workers-dev.ps1
#   .\scripts\workers-dev.ps1 test xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#   .\scripts\workers-dev.ps1 test xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx https://meusite.com
#
# Pre-requisito: Rust API rodando em localhost:3001 (.\scripts\dev.ps1)

param(
    [string]$Mode       = "",
    [string]$MonitorId  = "",
    [string]$TargetUrl  = "https://example.com"
)

Set-Location (Split-Path $PSScriptRoot -Parent)

# --- Carregar .env ------------------------------------------------------------
if (Test-Path ".env") {
    Get-Content ".env" | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } | ForEach-Object {
        $parts = $_ -split '=', 2
        Set-Variable -Name $parts[0].Trim() -Value $parts[1].Trim() -Scope Script
    }
}

$probeSecret = if ($PROBE_SECRET) { $PROBE_SECRET } else { "changeme_local_secret" }
$workerUrl   = "http://localhost:8787"
$ingestUrl   = "http://localhost:3001/api/ingest"

# --- Modo test: sobe worker em background + dispara probe --------------------
if ($Mode -eq "test") {
    if (-not $MonitorId) {
        Write-Host "[!] Informe o monitor_id." -ForegroundColor Red
        Write-Host ""
        Write-Host "    Uso: .\scripts\workers-dev.ps1 test <monitor_id> [url]"
        Write-Host ""
        Write-Host "    Para obter o monitor_id: veja a URL na pagina de detalhe do monitor"
        Write-Host "    Exemplo: http://localhost:3000/dashboard/monitors/SEU-MONITOR-ID" -ForegroundColor Cyan
        exit 1
    }

    Write-Host "[*] Subindo worker local em background..." -ForegroundColor Cyan
    $workerJob = Start-Process powershell `
        -ArgumentList "-NoExit", "-Command", "Set-Location '$PWD\workers\probe'; npx wrangler dev --local" `
        -PassThru

    Write-Host "[*] Aguardando worker iniciar..." -ForegroundColor Yellow
    $started = $false
    for ($i = 1; $i -le 15; $i++) {
        Start-Sleep -Seconds 1
        try {
            $testBody = '{"monitor_id":"test","url":"https://example.com","ingest_url":"http://localhost:3001/api/ingest"}'
            $testResp = Invoke-WebRequest -Uri $workerUrl -Method POST `
                -Headers @{ "x-probe-secret" = $probeSecret; "Content-Type" = "application/json" } `
                -Body $testBody -ErrorAction Stop
            $started = $true
            break
        } catch {
            Write-Host "    aguardando... ($i/15)" -ForegroundColor DarkGray
        }
    }

    if (-not $started) {
        Write-Host "[!] Worker nao respondeu a tempo. Verifique se a porta 8787 esta livre." -ForegroundColor Red
        Stop-Process -Id $workerJob.Id -Force -ErrorAction SilentlyContinue
        exit 1
    }

    Write-Host ""
    Write-Host "[*] Disparando probe de teste..." -ForegroundColor Cyan
    Write-Host "    Monitor ID: $MonitorId" -ForegroundColor White
    Write-Host "    URL alvo:   $TargetUrl" -ForegroundColor White
    Write-Host "    Ingest:     $ingestUrl" -ForegroundColor White
    Write-Host ""

    $body = "{`"monitor_id`":`"$MonitorId`",`"url`":`"$TargetUrl`",`"ingest_url`":`"$ingestUrl`"}"

    try {
        $resp = Invoke-RestMethod -Uri $workerUrl -Method POST `
            -Headers @{ "x-probe-secret" = $probeSecret; "Content-Type" = "application/json" } `
            -Body $body
        Write-Host "Resposta do worker:" -ForegroundColor Green
        $resp | ConvertTo-Json -Depth 5
    } catch {
        Write-Host "[!] Erro ao chamar o worker: $_" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "    Aguarde ~2s e verifique o dashboard:" -ForegroundColor Yellow
    Write-Host "    http://localhost:3000/dashboard/monitors/$MonitorId" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    Feche a janela do worker quando terminar."

# --- Modo padrao: sobe worker interativamente numa nova janela ---------------
} else {
    Write-Host "[*] Subindo CF Worker em modo local..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    Worker disponivel em: $workerUrl"
    Write-Host ""
    Write-Host "    Para disparar um probe manualmente (em outro terminal):" -ForegroundColor Yellow
    Write-Host "    .\scripts\workers-dev.ps1 test <monitor_id> [url]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    Ou via curl/Invoke-RestMethod direto:" -ForegroundColor DarkGray
    Write-Host "    Invoke-RestMethod -Uri $workerUrl -Method POST \`" -ForegroundColor DarkGray
    Write-Host "      -Headers @{`"x-probe-secret`"=`"$probeSecret`";`"Content-Type`"=`"application/json`"} \`" -ForegroundColor DarkGray
    Write-Host "      -Body '{`"monitor_id`":`"ID`",`"url`":`"https://example.com`",`"ingest_url`":`"$ingestUrl`"}'" -ForegroundColor DarkGray
    Write-Host ""

    Set-Location "workers\probe"
    npx wrangler dev --local
}
