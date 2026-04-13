#!/bin/bash
# ─── CacheSnap — Dev local ──────────────────────────────────────────────────────
# Sobe a infraestrutura (DB + Redis) via Docker e orienta os próximos passos.
# Uso: ./scripts/dev.sh

set -e

# Carregar .env se existir
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "🔵 Subindo infraestrutura (TimescaleDB + Redis)..."
docker compose up -d

echo "⏳ Aguardando TimescaleDB ficar pronto..."
until docker compose exec db pg_isready -U CacheSnap -q; do
  sleep 1
done

echo "✅ Infraestrutura pronta!"
echo ""
echo "▶  Abra dois terminais adicionais e execute:"
echo ""
echo "   Terminal 1 — Rust API (com hot reload):"
echo "   cd api && cargo watch -x run"
echo ""
echo "   Terminal 2 — Next.js dashboard:"
echo "   npm run dev"
echo ""
echo "   API:       http://localhost:3001"
echo "   Dashboard: http://localhost:3000"
echo "   DB:        postgresql://CacheSnap:***@localhost:5432/CacheSnap"
