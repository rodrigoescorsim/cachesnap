# Deploy CacheSnap — Hetzner VPS (Linux)

Guia completo para subir o CacheSnap em produção numa VPS Hetzner a partir do zero.

---

## Pré-requisitos

- VPS Hetzner rodando **Ubuntu 24.04 LTS** (recomendado: CX22, 2 vCPU / 4 GB)
- Acesso SSH como root ou usuário com sudo
- Domínio apontando para o IP da VPS:
  - `yourdomain.com` → IP da VPS
  - `api.yourdomain.com` → IP da VPS
- AWS CLI configurado na sua máquina local (para deploy das Lambdas)

---

## 1. Configuração inicial do servidor

```bash
# Acesse a VPS
ssh root@<IP_DA_VPS>

# Atualize o sistema
apt update && apt upgrade -y

# Crie um usuário de deploy (não rode tudo como root)
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/

# A partir daqui, use o usuário deploy
su - deploy
```

---

## 2. Instalar Docker

```bash
# Instale Docker via script oficial
curl -fsSL https://get.docker.com | sh

# Adicione o usuário deploy ao grupo docker (evita sudo em todo comando)
sudo usermod -aG docker deploy

# Recarregue a sessão para o grupo ter efeito
newgrp docker

# Verifique
docker --version
docker compose version
```

---

## 3. Instalar nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Verifique se nginx subiu
sudo systemctl status nginx
```

---

## 4. Clonar o repositório

```bash
# Na VPS, como usuário deploy
git clone https://github.com/<seu-usuario>/cachesnap.git /home/deploy/cachesnap
cd /home/deploy/cachesnap
```

---

## 5. Configurar variáveis de ambiente

```bash
# Copie o exemplo e edite
cp .env.example .env
nano .env
```

Preencha cada variável conforme a tabela abaixo:

| Variável | Valor em produção |
|---|---|
| `DB_PASSWORD` | Senha forte (mín. 32 chars) |
| `REDIS_PASSWORD` | Senha forte (mín. 32 chars) |
| `DATABASE_URL` | `postgresql://cachesnap:<DB_PASSWORD>@db:5432/cachesnap` |
| `REDIS_URL` | `redis://:<REDIS_PASSWORD>@redis:6379` |
| `API_PORT` | `3001` |
| `PROBE_SECRET` | Gere com `openssl rand -hex 32` |
| `RESEND_API_KEY` | Chave da conta Resend (notificações por email) |
| `SLACK_WEBHOOK_URL` | URL do webhook Slack (opcional) |
| `APP_URL` | `https://yourdomain.com` |
| `API_URL` | `https://api.yourdomain.com` |
| `NEXTAUTH_SECRET` | Gere com `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://yourdomain.com` |
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` |

### Probe dispatch (opcional — produção com muitos monitores)

Se a API registar muitos `429` ao falar com as Lambdas, ajuste (ou defina explicitamente) as variáveis abaixo. Defaults seguros estão em `api/src/config.rs` (`ProbeDispatchConfig`); descrição completa em `docs/STACK.md` (secção *Limitação de concorrência, HTTP 429 e backpressure*).

| Variável | Exemplo | Notas |
|:---|:---|:---|
| `PROBE_DISPATCH_MAX_GLOBAL` | `64` | Teto de `POST` de probe em voo no processo |
| `PROBE_DISPATCH_MAX_PER_REGION` | `3` | Por região (`region_id` / mesma Function URL) |
| `PROBE_DISPATCH_REGION_PARALLEL` | `3` | Regiões em paralelo por monitor |
| `PROBE_SCHEDULER_MAX_MONITORS_PARALLEL` | `16` | Monitores por tick de 1s |
| `PROBE_DISPATCH_429_MAX_ATTEMPTS` | `5` | Tentativas por região em 429 |
| `PROBE_DISPATCH_429_BASE_MS` | `120` | Backoff base (ms) |
| `PROBE_DISPATCH_429_MAX_MS` | `5000` | Teto do backoff (ms) |
| `PROBE_DISPATCH_ACQUIRE_TIMEOUT_SECS` | `18` | Timeout à espera de permit do semáforo |

> **Nota sobre DATABASE_URL**: em produção, use o hostname `db` (nome do container Docker), não `localhost`.

---

## 6. Configurar nginx

```bash
# Copie o arquivo de config gerado para o nginx
sudo cp /home/deploy/cachesnap/infra/nginx.conf /etc/nginx/sites-available/cachesnap

# Substitua yourdomain.com pelo seu domínio real
sudo sed -i 's/yourdomain.com/meudominio.com/g' /etc/nginx/sites-available/cachesnap

# Ative o site
sudo ln -s /etc/nginx/sites-available/cachesnap /etc/nginx/sites-enabled/

# Remova o site default para evitar conflito
sudo rm -f /etc/nginx/sites-enabled/default

# Teste a config
sudo nginx -t

# Recarregue
sudo systemctl reload nginx
```

---

## 7. Emitir certificado SSL (Let's Encrypt)

> O DNS deve já estar propagado antes deste passo. Verifique: `dig +short yourdomain.com`

```bash
sudo certbot --nginx -d meudominio.com -d api.meudominio.com \
  --email seu@email.com \
  --agree-tos \
  --no-eff-email
```

Certbot edita o nginx.conf automaticamente com os caminhos dos certificados e configura renovação automática via cron.

Verifique a renovação automática:
```bash
sudo certbot renew --dry-run
```

---

## 8. Subir os serviços Docker

```bash
cd /home/deploy/cachesnap

# Sobe db + redis + api Rust (build incluído)
./scripts/up.sh
```

O script executa:
```
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Isso irá:
1. Subir TimescaleDB e Redis com healthchecks
2. Build da imagem Rust (multi-stage, pode demorar ~3 min na primeira vez)
3. Subir a API, que roda as migrations automaticamente na inicialização

Verifique se tudo está saudável:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Todos os containers devem mostrar `healthy` ou `running`.

Teste a API:
```bash
curl https://api.meudominio.com/health
# Esperado: {"status":"ok"}
```

---

## 9. Subir o frontend Next.js

O frontend não está containerizado — rode diretamente com Node.js.

```bash
# Instale Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instale dependências e faça o build
cd /home/deploy/cachesnap
npm ci
npm run build

# Instale PM2 para gerenciar o processo
sudo npm install -g pm2

# Inicie o Next.js
pm2 start npm --name "cachesnap-web" -- start

# Configure PM2 para reiniciar no boot
pm2 save
pm2 startup
# Execute o comando que o pm2 startup imprime
```

Teste o frontend:
```bash
curl -s -o /dev/null -w "%{http_code}" https://meudominio.com
# Esperado: 200
```

---

## 10. Deploy das Lambda probes (da sua máquina local)

Execute a partir da sua máquina de desenvolvimento, não da VPS:

```bash
# Na sua máquina local, na raiz do projeto
bash scripts/deploy-lambda.sh
```

O script atualiza o código das 8 funções Lambda (timeout 30s, memória 128 MB) e aguarda cada uma finalizar antes de seguir.

**As URLs das Lambdas não são variáveis de ambiente.** Elas ficam na tabela `regions` do banco, populada automaticamente pela migração `016_add_regions_table.sql` na primeira subida da API. Nenhuma edição no `.env` é necessária após o deploy de código.

Se você precisar **recriar** uma função Lambda (troca de Function URL), atualize a URL diretamente no banco:

```bash
# Na VPS, dentro do container da API
docker exec -it cachesnap-db-1 psql -U cachesnap cachesnap

-- Exemplo: atualizar a região sa-east após recriar a Lambda
UPDATE regions
   SET lambda_url = 'https://nova-url.lambda-url.sa-east-1.on.aws/'
 WHERE id = 'sa-east';
\q
```

Os IDs disponíveis são: `sa-east`, `us-east`, `us-west`, `eu-west`, `ap-east`, `ap-south`, `oc`, `af-south`.

---

## 11. Verificação final

```bash
# API saudável
curl https://api.meudominio.com/health

# Frontend carregando
curl -s -o /dev/null -w "%{http_code}" https://meudominio.com

# Containers rodando
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Logs da API (últimas 50 linhas)
./scripts/logs.sh
```

Acesse `https://meudominio.com` no browser e crie um monitor para confirmar que o pipeline completo (Next.js → API Rust → Lambda → ingest) está funcionando.

---

## Operações do dia a dia

### Atualizar o código

```bash
cd /home/deploy/cachesnap
git pull

# Rebuild e restart da API Rust
docker compose -f docker-compose.yml -f docker-compose.prod.yml build api
./scripts/restart.sh

# Rebuild do Next.js
npm ci
npm run build
pm2 restart cachesnap-web
```

### Ver logs

```bash
# Todos os containers
./scripts/logs.sh

# Apenas a API Rust
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api

# Frontend
pm2 logs cachesnap-web
```

### Parar / reiniciar tudo

```bash
./scripts/restart.sh   # reinicia containers Docker
pm2 restart all        # reinicia Next.js
```

### Backup do banco

```bash
docker exec cachesnap-db-1 \
  pg_dump -U cachesnap cachesnap | gzip > backup_$(date +%Y%m%d).sql.gz
```
