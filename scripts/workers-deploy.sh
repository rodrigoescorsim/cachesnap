#!/bin/bash
# --- HopLens - Deploy dos CF Workers -----------------------------------------
# Faz deploy dos workers de probe para o Cloudflare.
#
# Uso:
#   ./scripts/workers-deploy.sh              # deploya todos os 5 environments
#   ./scripts/workers-deploy.sh sa-east      # deploya so um environment
#
# Environments disponiveis: sa-east eu-west us-east ap-east oc
#
# Pre-requisitos:
#   - wrangler login ja executado
#   - secrets configurados: ./scripts/workers-secrets.sh

set -e

cd "$(dirname "$0")/.."

VALID_ENVS=("sa-east" "eu-west" "us-east" "ap-east" "oc")

# --- Se recebeu argumento, valida e deploya so aquele env ---------------------
if [ -n "$1" ]; then
  env="$1"
  valid=false
  for v in "${VALID_ENVS[@]}"; do
    [ "$v" = "$env" ] && valid=true && break
  done

  if [ "$valid" = false ]; then
    echo "Erro: environment '$env' invalido."
    echo "Disponiveis: ${VALID_ENVS[*]}"
    exit 1
  fi

  echo "Deployando hoplens-probe-${env}..."
  cd workers/probe
  npx wrangler deploy --env "$env"
  echo ""
  echo "Deploy de $env concluido!"
  exit 0
fi

# --- Deploy de todos ----------------------------------------------------------
echo "Deployando todos os workers de probe..."
echo ""

cd workers/probe

SUCCESS=()
FAILED=()

for env in "${VALID_ENVS[@]}"; do
  echo "-- Deployando $env -----------------------------"
  if npx wrangler deploy --env "$env"; then
    SUCCESS+=("$env")
  else
    FAILED+=("$env")
    echo "Falha no deploy de $env -- continuando..."
  fi
  echo ""
done

# --- Resumo -------------------------------------------------------------------
echo "=================================================="
echo "Resumo do deploy:"
for env in "${SUCCESS[@]}"; do
  echo "  [+] $env"
done
for env in "${FAILED[@]}"; do
  echo "  [!] $env -- falhou"
done
echo ""

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "Alguns deploys falharam. Verifique os erros acima."
  exit 1
fi

echo "Todos os workers deployados com sucesso!"
echo ""
echo "Os workers rodam automaticamente a cada 5 minutos (cron trigger)."
echo "Para ver os logs: npx wrangler tail --env sa-east (em workers/probe/)"
