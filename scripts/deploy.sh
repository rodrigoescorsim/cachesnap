#!/bin/bash
# CacheSnap — deploy script para VPS
# Uso: ./scripts/deploy.sh [--migration 015] [--api]
set -e

MIGRATION=""
REBUILD_API=false

for arg in "$@"; do
  case $arg in
    --migration) MIGRATION="${2}"; shift 2 ;;
    --migration=*) MIGRATION="${arg#*=}" ;;
    --api) REBUILD_API=true ;;
  esac
done

cd "$(dirname "$0")/.."

echo "[1/5] Pulling latest code..."
git pull

echo "[2/5] Installing dependencies..."
npm install --production=false

if [ -n "$MIGRATION" ]; then
  echo "[3/5] Running migration ${MIGRATION}..."
  node "scripts/run_migration_${MIGRATION}.js"
else
  echo "[3/5] No migration specified — skipping."
fi

echo "[4/5] Building Next.js..."
npm run build

echo "[5/5] Restarting services..."
pm2 restart cachesnap-web

if [ "$REBUILD_API" = true ]; then
  echo "[+] Rebuilding and restarting Rust API..."
  docker compose -f docker-compose.yml -f docker-compose.prod.yml build api
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api
fi

echo ""
echo "Deploy concluido."
pm2 status cachesnap-web
