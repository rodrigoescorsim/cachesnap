#!/bin/bash
# Para e remove os containers (dados preservados nos volumes)
set -e
echo "🔴 Parando containers..."
docker compose down
echo "✅ Containers parados. Volumes preservados."
