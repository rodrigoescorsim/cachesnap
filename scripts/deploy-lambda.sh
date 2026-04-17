#!/usr/bin/env bash
# CacheSnap Lambda Deployer — updates probe code across all 8 AWS regions.
set -euo pipefail

declare -A REGION_MAP=(
    ["sa-east-1"]="hoplens-probe-sa-east"
    ["us-east-2"]="hoplens-probe"
    ["us-west-2"]="hoplens-probe-us-west"
    ["eu-central-1"]="hoplens-probe-eu-west"
    ["ap-northeast-1"]="hoplens-probe-ap-east"
    ["ap-south-1"]="hoplens-probe-ap-south"
    ["ap-southeast-2"]="hoplens-probe-oc"
    ["af-south-1"]="hoplens-probe-af-south"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE_FILE="$PROJECT_ROOT/probes/lambda/index.mjs"
ZIP_FILE="$PROJECT_ROOT/probes/lambda/lambda_deploy.zip"

echo "--- CacheSnap Lambda Deployer (8 Regions) ---"

if ! command -v aws &>/dev/null; then
    echo "[ERROR] AWS CLI not found. Install: https://aws.amazon.com/cli/" >&2
    exit 1
fi

if [[ ! -f "$SOURCE_FILE" ]]; then
    echo "[ERROR] Source file not found: $SOURCE_FILE" >&2
    exit 1
fi

# 1. Create zip
echo -n "Creating deployment package..."
rm -f "$ZIP_FILE"
cd "$(dirname "$SOURCE_FILE")"
zip -q "$ZIP_FILE" "$(basename "$SOURCE_FILE")"
cd "$PROJECT_ROOT"
echo " DONE"

FAILED=0

# 2. Update each region
for REGION in "${!REGION_MAP[@]}"; do
    FUNC_NAME="${REGION_MAP[$REGION]}"
    echo -n "Updating region [$REGION] ($FUNC_NAME)..."

    if ! aws lambda update-function-code \
            --function-name "$FUNC_NAME" \
            --zip-file "fileb://$ZIP_FILE" \
            --region "$REGION" \
            --output json &>/dev/null; then
        echo " FAILED"
        FAILED=$((FAILED + 1))
        continue
    fi

    aws lambda wait function-updated \
        --function-name "$FUNC_NAME" \
        --region "$REGION"

    if aws lambda update-function-configuration \
            --function-name "$FUNC_NAME" \
            --region "$REGION" \
            --timeout 30 \
            --memory-size 128 \
            --output json &>/dev/null; then
        echo " SUCCESS"
    else
        echo " FAILED (config update)"
        FAILED=$((FAILED + 1))
    fi
done

# 3. Cleanup
rm -f "$ZIP_FILE"

echo "--- Deployment Finished ---"
[[ $FAILED -eq 0 ]] || { echo "[WARN] $FAILED region(s) failed." >&2; exit 1; }
