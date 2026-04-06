# --- HopLens - Deploy dos CF Workers (Windows) -------------------------------
# Faz deploy dos workers de probe para o Cloudflare.
#
# Uso:
#   .\scripts\workers-deploy.ps1              # deploya todos os 5 environments
#   .\scripts\workers-deploy.ps1 sa-east      # deploya so um environment
#
# Environments disponiveis: sa-east eu-west us-east ap-east oc
#
# Pre-requisitos:
#   - wrangler login ja executado
#   - secrets configurados: .\scripts\workers-secrets.ps1

param(
    [string]$Env = ""
)

Set-Location (Split-Path $PSScriptRoot -Parent)

$VALID_ENVS = @("sa-east", "eu-west", "us-east", "ap-east", "oc")

# --- Deploy de um environment especifico -------------------------------------
if ($Env -ne "") {
    if ($VALID_ENVS -notcontains $Env) {
        Write-Host "[!] Environment '$Env' invalido." -ForegroundColor Red
        Write-Host "    Disponiveis: $($VALID_ENVS -join ', ')" -ForegroundColor Red
        exit 1
    }

    Write-Host "[*] Deployando hoplens-probe-$Env..." -ForegroundColor Cyan
    Set-Location "workers\probe"
    npx wrangler deploy --env $Env
    Set-Location ..\..
    Write-Host ""
    Write-Host "[+] Deploy de $Env concluido!" -ForegroundColor Green
    exit 0
}

# --- Deploy de todos ----------------------------------------------------------
Write-Host "[*] Deployando todos os workers de probe..." -ForegroundColor Cyan
Write-Host ""

Set-Location "workers\probe"

$SUCCESS = @()
$FAILED  = @()

foreach ($env in $VALID_ENVS) {
    Write-Host "-- Deployando $env ------------------------------" -ForegroundColor Magenta
    npx wrangler deploy --env $env
    if ($LASTEXITCODE -eq 0) {
        $SUCCESS += $env
    } else {
        $FAILED += $env
        Write-Host "[!] Falha no deploy de $env -- continuando..." -ForegroundColor Yellow
    }
    Write-Host ""
}

Set-Location ..\..

# --- Resumo -------------------------------------------------------------------
Write-Host "==================================================" -ForegroundColor DarkGray
Write-Host "Resumo do deploy:" -ForegroundColor White
foreach ($env in $SUCCESS) {
    Write-Host "  [+] $env" -ForegroundColor Green
}
foreach ($env in $FAILED) {
    Write-Host "  [!] $env -- falhou" -ForegroundColor Red
}
Write-Host ""

if ($FAILED.Count -gt 0) {
    Write-Host "[!] Alguns deploys falharam. Verifique os erros acima." -ForegroundColor Red
    exit 1
}

Write-Host "[+] Todos os workers deployados com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "    Os workers rodam automaticamente a cada 5 minutos (cron trigger)."
Write-Host "    Para ver os logs em tempo real:"
Write-Host "    cd workers\probe; npx wrangler tail --env sa-east" -ForegroundColor Cyan
