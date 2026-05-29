# --- CacheSnap - Cloudflare Tunnels (API :3001 + Next.js :3000) ----------------
# Uso: .\scripts\start-tunnel.ps1
#
# Monitores usam API_URL → ingest Rust (/api/ingest).
# CDN Cache Checker usa APP_URL → ingest Next.js (/api/public/ingest).

Set-Location (Split-Path $PSScriptRoot -Parent)

function Start-CloudflareTunnel {
    param(
        [int]$Port,
        [string]$LogFile,
        [string]$Label
    )

    if (Test-Path $LogFile) { Remove-Item $LogFile }

    Write-Host "[*] Iniciando tunnel $Label (porta $Port)..." -ForegroundColor Cyan

    $process = Start-Process cmd.exe -ArgumentList "/c", "npx", "--yes", "cloudflared", "tunnel", "--url", "http://localhost:$Port", "--protocol", "http2" `
        -RedirectStandardError $LogFile -PassThru -WindowStyle Hidden

    $tunnelUrl = $null
    $timeout = 60
    $start = Get-Date

    while ($null -eq $tunnelUrl -and ((Get-Date) - $start).TotalSeconds -lt $timeout) {
        if (Test-Path $LogFile) {
            try {
                $logLines = Get-Content $LogFile -ErrorAction SilentlyContinue
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
            Write-Host "[!] Tunnel $Label encerrou inesperadamente." -ForegroundColor Red
            if (Test-Path $LogFile) { Get-Content $LogFile -Tail 8 }
            return $null
        }

        Start-Sleep -Seconds 2
    }

    if ($null -eq $tunnelUrl) {
        Write-Host "[!] Timeout ao obter URL do tunnel $Label." -ForegroundColor Red
        return $null
    }

    Write-Host "[+] $Label : $tunnelUrl (PID $($process.Id))" -ForegroundColor Green
    return @{ Url = $tunnelUrl; Process = $process; LogFile = $LogFile; Label = $Label }
}

function Set-EnvVarInFile {
    param([string]$Path, [string]$Key, [string]$Value)
    if (-not (Test-Path $Path)) { return }
    $content = Get-Content $Path
    $pattern = "^$Key="
    if ($content -match $pattern) {
        ($content -replace "$pattern.*", "$Key=$Value") | Set-Content $Path
    } else {
        Add-Content $Path "$Key=$Value"
    }
}

$apiTunnel = Start-CloudflareTunnel -Port 3001 -LogFile "cloudflared-api.log" -Label "API (Rust)"
if (-not $apiTunnel) { exit 1 }

$appTunnel = Start-CloudflareTunnel -Port 3000 -LogFile "cloudflared-app.log" -Label "App (Next.js)"
if (-not $appTunnel) {
    Stop-Process -Id $apiTunnel.Process.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

Set-EnvVarInFile ".env" "API_URL" $apiTunnel.Url
Set-EnvVarInFile "api\.env" "API_URL" $apiTunnel.Url
Set-EnvVarInFile ".env" "APP_URL" $appTunnel.Url

Write-Host "[+] API_URL e APP_URL atualizados em .env / api\.env." -ForegroundColor Green

Write-Host ""
Write-Host "[+] STATUS: TUDO PRONTO!" -ForegroundColor Green
Write-Host "  API_URL (monitores)  → $($apiTunnel.Url)" -ForegroundColor White
Write-Host "  APP_URL (CDN checker)→ $($appTunnel.Url)" -ForegroundColor White
Write-Host ""
Write-Host "Reinicie a API Rust apos mudar API_URL/APP_URL." -ForegroundColor Yellow
Write-Host "Encerrar tunnels:" -ForegroundColor DarkGray
Write-Host "  Stop-Process -Id $($apiTunnel.Process.Id),$($appTunnel.Process.Id)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Logs API (Ctrl+C sai do log, tunnels continuam):" -ForegroundColor White
Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray
Get-Content $apiTunnel.LogFile -Wait
