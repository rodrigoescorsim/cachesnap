#!/bin/bash
# Builda imagens Docker para deploy na VPS
# Uso: ./scripts/build.sh
set -e
echo "🔨 Buildando imagem da API Rust..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build api
echo "✅ Build concluído."
