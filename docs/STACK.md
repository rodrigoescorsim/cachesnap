# HopLens — Referência Técnica

> Consulte este documento quando precisar entender como algo funciona,
> como rodar localmente, ou como conectar as peças.

---

## Visão geral da arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│  PROBES (Cloudflare Workers)                                    │
│  5 regiões: GRU / FRA / IAD / NRT / SYD                        │
│  Mede: TTFB, cache status, headers de diagnóstico               │
│  → POST /api/ingest  (com PROBE_SECRET no header)               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  API RUST (axum)  — porta 3001                                  │
│  ├─ POST /api/ingest   → persiste no TimescaleDB                │
│  ├─ GET  /health       → status da API                          │
│  ├─ scheduler/         → dispara probes (tokio task)            │
│  ├─ baseline/          → calcula avg/stddev por região          │
│  ├─ diagnosis/engine   → regras de inferência (rule-based)      │
│  └─ alerts/            → detecta anomalias + notifica           │
└────────┬──────────────────────────────┬────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌─────────────────────┐
│  TimescaleDB    │          │  Redis              │
│  (PostgreSQL)   │          │  Rate limiting      │
│  porta 5432     │          │  Cache de resultados│
│                 │          │  porta 6379         │
└─────────────────┘          └─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  NEXT.JS 14 (App Router)  — porta 3000                          │
│  Dashboard "conselheiro" + Auth (NextAuth v4)                   │
│  Lê dados direto do PostgreSQL via sqlx / pg                    │
│  Deploy: Vercel (prod) ou container Docker (VPS alternativo)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Estrutura de arquivos

```
HopRay/
├── src/                            ← Next.js 14 App Router
│   ├── app/
│   │   ├── layout.tsx              ← metadata HopLens
│   │   └── page.tsx                ← placeholder (implementar Semana 2)
│   └── lib/                        ← helpers compartilhados (a criar)
│
├── api/                            ← Rust / axum
│   ├── src/
│   │   ├── main.rs                 ← entry point, router, tokio tasks
│   │   ├── config.rs               ← variáveis de ambiente tipadas
│   │   ├── db.rs                   ← PgPool + run_migrations()
│   │   ├── redis.rs                ← deadpool-redis Pool
│   │   ├── routes/
│   │   │   ├── health.rs           ← GET /health ✅
│   │   │   └── ingest.rs           ← POST /api/ingest ✅
│   │   ├── models/
│   │   │   └── probe_result.rs     ← ProbeResultPayload + ProbeResult
│   │   ├── diagnosis/
│   │   │   └── engine.rs           ← diagnose() rule-based ✅ (com testes)
│   │   ├── scheduler/
│   │   │   └── runner.rs           ← stub — implementar Dia 4
│   │   ├── baseline/
│   │   │   └── calculator.rs       ← stub — implementar Dia 5
│   │   └── alerts/
│   │       ├── detector.rs         ← stub — implementar Dia 5
│   │       └── notifier.rs         ← stub — implementar Dia 12
│   ├── Cargo.toml
│   └── Dockerfile                  ← multi-stage, imagem ~20MB
│
├── workers/
│   └── probe/                      ← Cloudflare Workers — implementar Dia 2-3
│
├── migrations/
│   └── 001_initial.sql             ← schema completo (TimescaleDB + auth)
│
├── scripts/
│   ├── dev.sh                      ← sobe infra local + instruções
│   ├── up.sh                       ← VPS: sobe tudo
│   ├── down.sh                     ← para containers
│   ├── restart.sh                  ← reinicia containers
│   ├── build.sh                    ← builda imagem Docker da API
│   └── logs.sh                     ← segue logs em tempo real
│
├── docker-compose.yml              ← infra local: DB + Redis
├── docker-compose.prod.yml         ← VPS: adiciona container da API
├── .env.example                    ← todas as variáveis documentadas
└── docs/                           ← documentação do projeto
```

---

## Como rodar localmente

### Pré-requisitos
- Docker Desktop rodando
- Rust instalado (`rustup` — https://rustup.rs)
- Node.js 20+ e npm
- `cargo-watch` para hot reload: `cargo install cargo-watch`

### Passo a passo

```bash
# 1. Copiar e configurar variáveis (já feito na sessão inicial)
cp .env.example .env
# Editar .env com suas senhas se quiser (os defaults funcionam localmente)

# 2. Subir infraestrutura (TimescaleDB + Redis)
./scripts/dev.sh

# 3. Terminal 1 — API Rust com hot reload
cd api
cargo watch -x run
# API disponível em http://localhost:3001

# 4. Terminal 2 — Next.js
npm run dev
# Dashboard em http://localhost:3000
```

### Verificar que está tudo funcionando

```bash
# Saúde da API
curl http://localhost:3001/health
# → {"status":"ok"}

# Testar ingest (requer PROBE_SECRET do .env)
curl -X POST http://localhost:3001/api/ingest \
  -H "Content-Type: application/json" \
  -H "x-probe-secret: changeme_local_secret" \
  -d '{
    "monitor_id": "00000000-0000-0000-0000-000000000001",
    "region": "sa-east",
    "ttfb_ms": 450.0,
    "cache_status": "MISS",
    "status_code": 200
  }'
# → {"ok":true}

# Rodar testes do diagnosis engine
cd api && cargo test
```

---

## Variáveis de ambiente

| Variável | Usado por | Obrigatório | Descrição |
|:---|:---|:---:|:---|
| `DB_PASSWORD` | Docker Compose | ✅ | Senha do PostgreSQL |
| `REDIS_PASSWORD` | Docker Compose | ✅ | Senha do Redis |
| `DATABASE_URL` | Rust API | ✅ | URL completa de conexão ao PostgreSQL |
| `REDIS_URL` | Rust API | ✅ | URL completa de conexão ao Redis |
| `API_PORT` | Rust API | — | Porta da API (default: 3001) |
| `PROBE_SECRET` | Rust API + CF Workers | ✅ | Token compartilhado para autenticar probes |
| `RESEND_API_KEY` | Rust API | — | API key do Resend para emails de alerta |
| `SLACK_WEBHOOK_URL` | Rust API | — | Webhook do Slack para alertas |
| `APP_URL` | Rust API | — | URL base do Next.js (para links nos alertas) |
| `NEXTAUTH_SECRET` | Next.js | ✅ | Segredo de sessão do NextAuth |
| `NEXTAUTH_URL` | Next.js | ✅ | URL base do Next.js |
| `NEXT_PUBLIC_API_URL` | Next.js | ✅ | URL da Rust API (acessível pelo browser) |

Para desenvolvimento local, os valores padrão do `.env.example` funcionam sem alteração.

---

## API Rust — Endpoints

### `GET /health`
Retorna status da API. Usado pelo Docker healthcheck e monitoramento externo.

```
Response 200:
{ "status": "ok" }
```

### `POST /api/ingest`
Recebe o resultado de um probe executado por um Cloudflare Worker.

**Headers obrigatórios:**
```
Content-Type: application/json
x-probe-secret: <PROBE_SECRET>
```

**Body:**
```json
{
  "monitor_id": "uuid-do-monitor",
  "region": "sa-east",
  "ttfb_ms": 450.0,
  "download_ms": 12.3,
  "total_ms": 462.3,
  "dns_ms": null,
  "tls_ms": null,
  "status_code": 200,
  "cache_status": "MISS",
  "served_by": "GRU-ABC123",
  "server_timing": "cf-cache-status;desc=\"MISS\"",
  "http_version": "HTTP/2",
  "redirect_count": 0,
  "content_length": 4821,
  "error": null
}
```

> **Nota:** `dns_ms` e `tls_ms` são `null` no Phase 1 (CF Workers não consegue medir).
> Serão preenchidos pelos probes Node.js no Fly.io no Mês 2-3.

**Responses:**
```
201 Created: { "ok": true }
401 Unauthorized: { "error": "unauthorized" }
500 Internal Server Error: { "error": "failed to store result" }
```

---

## Banco de dados — Schema

### Tabelas principais

**`probe_results`** (hypertable TimescaleDB)
```sql
time             TIMESTAMPTZ  -- particionamento automático por tempo
monitor_id       UUID
region           TEXT         -- "sa-east", "eu-west", "us-east", etc.
ttfb_ms          FLOAT        -- Time to First Byte ✅ medido
download_ms      FLOAT        -- ✅ medido
total_ms         FLOAT        -- ✅ medido
dns_ms           FLOAT        -- NULL no Phase 1, preenchido no Phase 2
tls_ms           FLOAT        -- NULL no Phase 1, preenchido no Phase 2
status_code      INT
cache_status     TEXT         -- CF-Cache-Status / X-Vercel-Cache / X-Cache
served_by        TEXT         -- CF-Ray / X-Served-By
server_timing    TEXT         -- header bruto
http_version     TEXT
redirect_count   INT
content_length   BIGINT
error            TEXT
```
Compressão automática após 7 dias. Índices em `(monitor_id, time DESC)` e `(monitor_id, region, time DESC)`.

**`monitor_baselines`**
```sql
monitor_id      UUID   -- PK composta
region          TEXT   -- PK composta
ttfb_avg_ms     FLOAT  -- média dos últimos 7 dias
ttfb_stddev_ms  FLOAT  -- desvio padrão
cache_hit_rate  FLOAT  -- % de requests com cache HIT
sample_count    INT
calculated_at   TIMESTAMPTZ
```
Atualizada a cada hora pelo `baseline/calculator.rs`.

**`alerts`**
```sql
id               UUID
monitor_id       UUID
region           TEXT
alert_type       TEXT   -- 'anomaly' | 'threshold' | 'ssl_expiry' | 'down'
baseline_ms      FLOAT  -- valor histórico para comparação
actual_ms        FLOAT  -- valor que disparou o alerta
deviation_factor FLOAT  -- ex: 2.4 = "2.4x mais lento que o normal"
diagnosis        TEXT   -- texto gerado pelo engine
action           TEXT   -- ação recomendada
notified_email   BOOLEAN
notified_slack   BOOLEAN
```

---

## Diagnosis Engine (`api/src/diagnosis/engine.rs`)

Engine rule-based determinístico — sem LLM. Recebe métricas de um probe e retorna causa + ação + severidade.

### Regras implementadas (em ordem de prioridade)

| Condição | Severidade | Causa | Ação |
|:---|:---:|:---|:---|
| `error` presente | critical | Probe falhou | Verificar URL |
| `cache MISS/BYPASS` + `ttfb > 200ms` | critical | Origin sendo consultado | `Cache-Control: public, s-maxage=300` |
| `ttfb > baseline × 2.0` | warning | Anomalia vs. histórico | Verificar deploys recentes |
| `redirects > 1` | warning | Redirects desnecessários | Configurar redirect direto |
| `cache HIT` + `ttfb > 150ms` | warning | Edge function lenta | Revisar lógica da edge function |
| `HTTP/1.1` + `ttfb > 100ms` | info | Protocolo antigo | Habilitar HTTP/2 |
| Nenhuma das acima | ok | Dentro do normal | — |

### Como adicionar uma nova regra

1. Abrir `api/src/diagnosis/engine.rs`
2. Adicionar condição no corpo da função `diagnose()` antes do bloco `// Tudo ok`
3. Retornar um `Diagnosis { severity, cause, action, summary, estimated_gain_ms }`
4. Adicionar teste unitário no bloco `#[cfg(test)]`
5. `cargo test` para verificar

### Como rodar os testes

```bash
cd api
cargo test
# ou filtrar por módulo:
cargo test diagnosis
```

---

## Docker

### Desenvolvimento local (apenas infra)

```bash
# Sobe TimescaleDB + Redis
docker compose up -d

# Para
docker compose down

# Ver logs
./scripts/logs.sh
./scripts/logs.sh db     # apenas o banco
```

### VPS / Produção (infra + API Rust)

```bash
# Buildar imagem da API
./scripts/build.sh

# Subir tudo
./scripts/up.sh

# Equivalente manual:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Por que dois compose files?

`docker-compose.yml` define apenas a infra (DB + Redis) — isso roda igual em local e VPS.
`docker-compose.prod.yml` adiciona o container da API Rust, que em desenvolvimento local roda fora do Docker (mais rápido para compilar e debugar).

Na VPS, o Docker roda tudo. No local, só a infra vai pro Docker.

---

## Stack completa

| Camada | Tecnologia | Versão | Por quê |
|:---|:---|:---|:---|
| Dashboard | Next.js | 14 (App Router) | SSR, React Server Components, deploy Vercel |
| Estilo | Tailwind CSS | 3 | Velocidade de desenvolvimento |
| Backend API | Rust / axum | axum 0.7 | Performance, confiabilidade para processos longos, conhecimento do founder |
| Async runtime | tokio | 1 | Padrão para Rust async |
| ORM/Queries | sqlx | 0.7 | Queries tipadas em compile-time, suporte a TimescaleDB |
| Banco de dados | TimescaleDB | pg16 | Compressão e queries de time-series otimizadas |
| Cache/filas | Redis | 7 | Rate limiting e cache de resultados recentes |
| Probes Phase 1 | Cloudflare Workers | — | 300+ cidades, ~$5/mês, sem infra a manter |
| Probes Phase 2 | Node.js / Fly.io | — | Acesso a `net.Socket` para DNS/TCP/TLS breakdown |
| Auth | NextAuth v4 | 4 | Self-hosted, sem Supabase, sessões no PostgreSQL |
| Email | Resend | — | API simples, 100 emails/dia grátis |
| Containerização | Docker Compose | — | Paridade perfeita local ↔ VPS |
