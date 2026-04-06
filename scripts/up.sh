#!/bin/bash
# Para uso na VPS: sobe todos os serviços incluindo a API Rust
# Uso: ./scripts/up.sh
set -e

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "🚀 Subindo todos os serviços (modo produção)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "⏳ Aguardando saúde dos serviços..."
sleep 5
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

echo "✅ HopLens está rodando."
echo "   API:  http://localhost:${API_PORT:-3001}/health"
