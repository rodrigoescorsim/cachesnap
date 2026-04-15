# CacheSnap Lambda Deployment Script (PowerShell)
# Updates the probe code across all 8 supported AWS regions.

# Mapping of AWS Region -> Lambda Function Name
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

Write-Host "--- CacheSnap Lambda Deployer (8 Regions) ---" -ForegroundColor Cyan

# Check for AWS CLI (and look in standard Windows paths if not in PATH)
if (-not (Get-Command "aws" -ErrorAction SilentlyContinue)) {
    $CommonPaths = @(
        "C:\Program Files\Amazon\AWSCLIV2\",
        "C:\Program Files (x86)\Amazon\AWSCLIV2\"
    )
    foreach ($Path in $CommonPaths) {
        if (Test-Path "$Path\aws.exe") {
            $env:Path += ";$Path"
            break
        }
    }
}

if (-not (Get-Command "aws" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] AWS CLI not found. Please install it from: https://aws.amazon.com/cli/" -ForegroundColor Red
    exit
}

# Resolve paths to absolute to avoid fileb:// issues
$SourcePath = Resolve-Path "probes/lambda/index.mjs"
$ZipFile = Join-Path (Get-Location) "probes/lambda/lambda_deploy.zip"

if (-not (Test-Path $SourcePath)) {
    Write-Error "Source file index.mjs not found! Run from project root."
    exit
}

# 1. Create Zip
Write-Host "Creating deployment package..." -NoNewline
if (Test-Path $ZipFile) { Remove-Item $ZipFile -Force }
Compress-Archive -Path $SourcePath -DestinationPath $ZipFile
Write-Host " DONE" -ForegroundColor Green

# 2. Update each region
foreach ($Region in $RegionMap.Keys) {
    $FuncName = $RegionMap[$Region]
    Write-Host "Updating region [$Region] ($FuncName)..." -ForegroundColor Yellow -NoNewline
    
    # Convert backslashes to forward slashes for AWS CLI fileb:// on Windows
    $AwsZipFile = $ZipFile -replace '\\', '/'

    # Executa o comando e captura a saída e erro de código
    $Output = aws lambda update-function-code `
        --function-name $FuncName `
        --zip-file "fileb://$AwsZipFile" `
        --region $Region `
        --output json 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host " FAILED" -ForegroundColor Red
        $ErrorMsg = ($Output | Out-String).Trim().Split("`n")[0]
        Write-Host "   -> $ErrorMsg" -ForegroundColor Gray
        continue
    }

    # Wait for the code update to complete to avoid ResourceConflictException
    aws lambda wait function-updated --function-name $FuncName --region $Region

    # Garante o timeout de 30s e memória de 128MB
    $ConfigOutput = aws lambda update-function-configuration `
        --function-name $FuncName `
        --region $Region `
        --timeout 30 `
        --memory-size 128 `
        --output json 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host " SUCCESS" -ForegroundColor Green
    } else {
        Write-Host " FAILED (Config Update)" -ForegroundColor Red
        $ErrorMsg = ($ConfigOutput | Out-String).Trim().Split("`n")[0]
        Write-Host "   -> $ErrorMsg" -ForegroundColor Gray
    }
}

# 3. Cleanup
if (Test-Path $ZipFile) { Remove-Item $ZipFile -Force }
Write-Host "--- Deployment Finished ---" -ForegroundColor Cyan
