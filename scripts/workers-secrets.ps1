# --- HopLens - Configura secrets nos CF Workers (Windows) --------------------
# Le PROBE_SECRET e API_URL do .env e faz push para todos os environments.
#
# Uso: .\scripts\workers-secrets.ps1
#
# Pre-requisitos:
#   - wrangler login ja executado (cd workers\probe; npx wrangler login)
#   - API_URL no .env apontando para URL publica da Rust API (nao localhost)
#     Dica: npx cloudflared tunnel --url http://localhost:3001

Set-Location (Split-Path $PSScriptRoot -Parent)

# --- Carregar .env ------------------------------------------------------------
if (-not (Test-Path ".env")) {
    Write-Host "[!] .env nao encontrado. Copie .env.example e configure." -ForegroundColor Red
    exit 1
}

Get-Content ".env" | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } | ForEach-Object {
    $parts = $_ -split '=', 2
    Set-Variable -Name $parts[0].Trim() -Value $parts[1].Trim() -Scope Script
}

# --- Validar PROBE_SECRET -----------------------------------------------------
if (-not $PROBE_SECRET) {
    Write-Host "[!] PROBE_SECRET nao esta definido no .env" -ForegroundColor Red
    exit 1
}

if ($PROBE_SECRET -eq "changeme_local_secret") {
    Write-Host "[!] PROBE_SECRET ainda e o valor padrao (changeme_local_secret)." -ForegroundColor Yellow
    Write-Host "    Para producao, gere um secret seguro com:" -ForegroundColor Yellow
    Write-Host "    openssl rand -hex 32" -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Continuar mesmo assim? [s/N]"
    if ($confirm -notmatch '^[sS]$') { exit 1 }
}

# --- Validar API_URL ----------------------------------------------------------
if (-not $API_URL) {
    Write-Host "[!] API_URL nao esta definido no .env" -ForegroundColor Red
    Write-Host "    Defina a URL publica da Rust API. Ex:" -ForegroundColor Red
    Write-Host "    API_URL=https://xyz.trycloudflare.com" -ForegroundColor Red
    exit 1
}

if ($API_URL -like "*localhost*") {
    Write-Host "[!] API_URL aponta para localhost ($API_URL)" -ForegroundColor Red
    Write-Host "    CF Workers rodam na nuvem e nao conseguem acessar localhost." -ForegroundColor Red
    Write-Host ""
    Write-Host "    Exponha a API com um tunnel (em outro terminal):" -ForegroundColor Yellow
    Write-Host "    npx cloudflared tunnel --url http://localhost:3001" -ForegroundColor Cyan
    Write-Host "    (ou: npx ngrok http 3001)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    Depois atualize API_URL no .env com a URL gerada e rode este script novamente." -ForegroundColor Yellow
    exit 1
}

$INGEST_URL = $API_URL.TrimEnd('/') + "/api/ingest"
$ENVS = @("sa-east", "eu-west", "us-east", "ap-east", "oc")
$secretMasked = $PROBE_SECRET.Substring(0, [Math]::Min(4, $PROBE_SECRET.Length)) + "****"

Write-Host ""
Write-Host "[*] Configurando secrets nos workers do Cloudflare..." -ForegroundColor Cyan
Write-Host "    PROBE_SECRET: $secretMasked"
Write-Host "    INGEST_URL:   $INGEST_URL"
Write-Host "    Environments: $($ENVS -join ', ')"
Write-Host ""

Set-Location "workers\probe"

foreach ($env in $ENVS) {
    Write-Host "[*] $env..." -ForegroundColor Magenta
    $PROBE_SECRET | npx wrangler secret put PROBE_SECRET --env $env
    $INGEST_URL   | npx wrangler secret put INGEST_URL   --env $env
    Write-Host ""
}

Set-Location ..\..

Write-Host "[+] Secrets configurados em todos os environments!" -ForegroundColor Green
Write-Host ""
Write-Host "    Proximo passo: .\scripts\workers-deploy.ps1"
