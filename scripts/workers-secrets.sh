#!/bin/bash
# --- HopLens - Configura secrets nos CF Workers -------------------------------
# Le PROBE_SECRET e API_URL do .env e faz push para todos os environments.
#
# Uso: ./scripts/workers-secrets.sh
#
# Pre-requisitos:
#   - wrangler login ja executado (npx wrangler login)
#   - API_URL no .env apontando para URL publica da Rust API (nao localhost)
#     Dica: use `npx cloudflared tunnel --url http://localhost:3001` em dev

set -e

cd "$(dirname "$0")/.."

# --- Carregar .env ------------------------------------------------------------
if [ ! -f .env ]; then
  echo "Erro: .env nao encontrado. Copie .env.example e configure."
  exit 1
fi
export $(grep -v '^#' .env | grep -v '^$' | xargs)

# --- Validar PROBE_SECRET -----------------------------------------------------
if [ -z "$PROBE_SECRET" ]; then
  echo "Erro: PROBE_SECRET nao esta definido no .env"
  exit 1
fi

if [ "$PROBE_SECRET" = "changeme_local_secret" ]; then
  echo "PROBE_SECRET ainda e o valor padrao (changeme_local_secret)."
  echo "   Para producao, gere um secret seguro:"
  echo "   openssl rand -hex 32"
  echo ""
  read -p "Continuar mesmo assim? [s/N] " confirm
  [[ "$confirm" =~ ^[sS]$ ]] || exit 1
fi

# --- Validar API_URL ----------------------------------------------------------
if [ -z "$API_URL" ]; then
  echo "Erro: API_URL nao esta definido no .env"
  echo "   Defina a URL publica da Rust API. Ex:"
  echo "   API_URL=https://xyz.trycloudflare.com"
  exit 1
fi

if [[ "$API_URL" == *"localhost"* ]]; then
  echo "API_URL aponta para localhost ($API_URL)"
  echo "   CF Workers rodam na nuvem e nao conseguem acessar localhost."
  echo ""
  echo "   Para desenvolvimento, exponha a API localmente com um tunnel:"
  echo "   npx cloudflared tunnel --url http://localhost:3001"
  echo "   (ou: npx ngrok http 3001)"
  echo ""
  echo "   Depois atualize API_URL no .env com a URL gerada e rode este script novamente."
  exit 1
fi

INGEST_URL="${API_URL%/}/api/ingest"

ENVS=("sa-east" "eu-west" "us-east" "ap-east" "oc")

echo "Configurando secrets nos workers do Cloudflare..."
echo "  PROBE_SECRET: ${PROBE_SECRET:0:4}****${PROBE_SECRET: -4}"
echo "  INGEST_URL:   $INGEST_URL"
echo "  Environments: ${ENVS[*]}"
echo ""

cd workers/probe

for env in "${ENVS[@]}"; do
  echo "-- $env ------------------------------"
  printf '%s' "$PROBE_SECRET" | npx wrangler secret put PROBE_SECRET --env "$env"
  printf '%s' "$INGEST_URL"   | npx wrangler secret put INGEST_URL   --env "$env"
  echo ""
done

echo "Secrets configurados em todos os environments!"
echo ""
echo "Proximo passo: ./scripts/workers-deploy.sh"
