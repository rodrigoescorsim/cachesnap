# HopLens Lambda Probes

Regional probes for HopLens running on AWS Lambda (Node.js 20.x).  
Replaces the Cloudflare Worker probes with region-pinned infrastructure.

## Why Lambda?

- **Honest geography**: Probe in Frankfurt runs IN Frankfurt (no Anycast trap)
- **Granular timing**: DNS, TCP, TLS measured via Node.js socket events
- **Free**: 1M requests/month included in AWS Free Tier

## Quick Deploy

### Prerequisites
- AWS account with Lambda access
- AWS CLI configured (`aws configure`)

### Option A: AWS Console (Manual)

1. Go to **Lambda → Create Function** in the desired region
2. Runtime: **Node.js 20.x**, Architecture: **arm64**
3. Paste contents of `index.mjs` into the inline editor
4. Set environment variables:
   - `PROBE_SECRET`: your shared secret (same as `.env`)
   - `REGION`: one of `sa-east`, `us-east`, `eu-west`, `ap-east`, `oc`
5. Set timeout to **30 seconds** (Configuration → General)
6. Enable **Function URL** with Auth type: NONE
7. Repeat for each region

### Option B: AWS CLI (Scripted)

```bash
# Run from probes/lambda/ directory
chmod +x deploy.sh
./deploy.sh
```

## Regions

| HopLens Region | AWS Region         | City       |
|:---------------|:-------------------|:-----------|
| `sa-east`      | `sa-east-1`        | São Paulo  |
| `us-east`      | `us-east-1`        | Virginia   |
| `eu-west`      | `eu-central-1`     | Frankfurt  |
| `ap-east`      | `ap-northeast-1`   | Tokyo      |
| `oc`           | `ap-southeast-2`   | Sydney     |

## Testing Locally

```bash
node test-local.mjs
```

This runs a probe against `https://www.cloudflare.com` and prints the full
result object, validating all 24 fields before you deploy to AWS.
