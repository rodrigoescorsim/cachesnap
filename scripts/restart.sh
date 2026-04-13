#!/bin/bash
set -e
echo "🔄 Reiniciando containers..."
docker compose down
docker compose up -d
echo "✅ Containers reiniciados."
