#!/bin/bash
# Segue os logs de todos os containers (ou de um específico)
# Uso: ./scripts/logs.sh [serviço]
# Ex:  ./scripts/logs.sh db
docker compose logs -f "$@"
