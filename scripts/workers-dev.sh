#!/bin/bash
# --- HopLens - Worker local (desenvolvimento) --------------------------------
# Sobe o CF Worker em modo local e opcionalmente dispara um probe de teste.
#
# Uso:
#   ./scripts/workers-dev.sh                         # so sobe o worker
#   ./scripts/workers-dev.sh test <monitor_id> [url] # sobe + dispara probe
#
# Exemplos:
#   ./scripts/workers-dev.sh
#   ./scripts/workers-dev.sh test xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#   ./scripts/workers-dev.sh test xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx https://meusite.com
#
# Pre-requisito: Rust API rodando em localhost:3001

set -e

cd "$(dirname "$0")/.."

# --- Carregar .env ------------------------------------------------------------
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

PROBE_SECRET="${PROBE_SECRET:-changeme_local_secret}"
WORKER_URL="http://localhost:8787"
INGEST_URL="http://localhost:3001/api/ingest"

# --- Modo test: sobe worker em background e dispara probe --------------------
if [ "$1" = "test" ]; then
  MONITOR_ID="${2:-}"
  TARGET_URL="${3:-https://example.com}"

  if [ -z "$MONITOR_ID" ]; then
    echo "Uso: ./scripts/workers-dev.sh test <monitor_id> [url]"
    echo ""
    echo "Para obter o monitor_id: veja a URL na pagina de detalhe do monitor"
    echo "Exemplo: http://localhost:3000/dashboard/monitors/SEU-MONITOR-ID"
    exit 1
  fi

  echo "Subindo worker local em background..."
  cd workers/probe
  npx wrangler dev --local &
  WORKER_PID=$!
  cd ..

  echo "Aguardando worker iniciar..."
  for i in $(seq 1 10); do
    sleep 1
    if curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL" \
        -H "x-probe-secret: $PROBE_SECRET" \
        -H "Content-Type: application/json" \
        -d '{"monitor_id":"test","url":"https://example.com","ingest_url":"http://localhost:3001/api/ingest"}' \
        | grep -q "40[01]"; then
      break
    fi
    echo "  aguardando... ($i/10)"
  done

  echo ""
  echo "Disparando probe de teste..."
  echo "  Monitor ID: $MONITOR_ID"
  echo "  URL alvo:   $TARGET_URL"
  echo "  Ingest:     $INGEST_URL"
  echo ""

  RESPONSE=$(curl -s -X POST "$WORKER_URL" \
    -H "x-probe-secret: $PROBE_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"monitor_id\":\"$MONITOR_ID\",\"url\":\"$TARGET_URL\",\"ingest_url\":\"$INGEST_URL\"}")

  echo "Resposta do worker:"
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
  echo ""
  echo "Aguarde ~2s e verifique o dashboard: http://localhost:3000/dashboard/monitors/$MONITOR_ID"
  echo ""
  echo "Pressione Ctrl+C para parar o worker (PID $WORKER_PID)"
  wait $WORKER_PID

# --- Modo padrao: so sobe o worker interativamente ---------------------------
else
  echo "Subindo CF Worker em modo local..."
  echo ""
  echo "Worker disponivel em: $WORKER_URL"
  echo ""
  echo "Para disparar um probe manualmente (em outro terminal):"
  echo ""
  echo "  curl -X POST $WORKER_URL \\"
  echo "    -H \"x-probe-secret: $PROBE_SECRET\" \\"
  echo "    -H \"Content-Type: application/json\" \\"
  echo "    -d '{\"monitor_id\":\"SEU-MONITOR-ID\",\"url\":\"https://example.com\",\"ingest_url\":\"$INGEST_URL\"}'"
  echo ""
  echo "Ou use o atalho: ./scripts/workers-dev.sh test <monitor_id> [url]"
  echo ""
  cd workers/probe
  npx wrangler dev --local
fi
