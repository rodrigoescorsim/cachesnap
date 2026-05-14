# CacheSnap Lambda Configuration Fix (PowerShell)
# Updates the timeout and memory settings for all 8 AWS regions.
#
# Budget reasoning (must stay in sync with probes/lambda/index.mjs constants):
#   - PROBE_TIMEOUT_MS    = 25s  (main measurement)
#   - REDIRECT_TIMEOUT_MS = 10s  (pre-measurement HEAD chain)
#   - INGEST_TIMEOUT_MS   = 10s  (POST result to CacheSnap)
# Worst-case (cold start + redirect chain + measurement + ingest report) fits
# inside 35s with headroom; 30s left a too-narrow margin in af-south / ap-south.

$RegionMap = @{
    "sa-east-1"      = "hoplens-probe-sa-east"
    "us-east-2"      = "hoplens-probe"
    "us-west-2"      = "hoplens-probe-us-west"
    "eu-central-1"   = "hoplens-probe-eu-west"
    "ap-northeast-1" = "hoplens-probe-ap-east"
    "ap-south-1"     = "hoplens-probe-ap-south"
    "ap-southeast-2" = "hoplens-probe-oc"
    "af-south-1"     = "hoplens-probe-af-south"
}

Write-Host "--- Updating Lambda Timeouts to 35 Seconds ---" -ForegroundColor Cyan

foreach ($Region in $RegionMap.Keys) {
    $FuncName = $RegionMap[$Region]
    Write-Host "Configuring region [$Region] ($FuncName)..." -ForegroundColor Yellow -NoNewline

    $Output = aws lambda update-function-configuration `
        --function-name $FuncName `
        --region $Region `
        --timeout 35 `
        --memory-size 128 `
        --output json 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host " SUCCESS" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        $ErrorMsg = ($Output | Out-String).Trim().Split("`n")[0]
        Write-Host "   -> $ErrorMsg" -ForegroundColor Gray
    }
}

Write-Host "--- Configuration Updated ---" -ForegroundColor Cyan
