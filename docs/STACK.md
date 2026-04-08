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
│  ├─ POST /api/ingest          → persiste no TimescaleDB         │
│  ├─ GET  /api/monitors/active → lista monitors p/ CF Worker     │
│  ├─ GET  /health              → status da API                   │
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
│  NEXT.JS 16 (App Router)  — porta 3000                          │
│  Dashboard "conselheiro" + Auth custom (bcryptjs + pg sessions) │
│  Lê dados direto do PostgreSQL via postgres.js                  │
│  Deploy: Vercel (prod) ou container Docker (VPS alternativo)    │
└─────────────────────────────────────────────────────────────────┘
```

### 🔄 Scheduler & Probes

O Scheduler ([runner.rs](file:///c:/workspace/HopLens/api/src/scheduler/runner.rs)) é o coração do sistema de monitoramento:
- **Loop de 10s**: Verifica no PostgreSQL todos os monitores ativos.
- **Atomicidade com Redis**: Usa um script Lua para verificar e atualizar o timestamp do último check (`last_check:ID`) de forma atômica. Isso evita que múltiplos nós de API disparem o mesmo probe simultaneamente em um ambiente escalado.
- **Dispatch Regional**: Para cada monitor devido, dispara requisições HTTP POST para os Workers nas 5 regiões configuradas.
- **Configuração**: As URLs dos workers são configuráveis via variáveis de ambiente `REGION_SA_EAST`, `REGION_EU_WEST`, etc.

Os Probes ([index.ts](file:///c:/workspace/HopLens/workers/probe/src/index.ts)) rodam em Cloudflare Workers:
- **Modo HTTP**: Recebe `monitor_id` e `url`, executa o probe e envia o resultado de volta para o endpoint `/api/ingest`.
- **Métricas**: TTFB, download, redirects, status de cache e headers de diagnóstico.

---

## Estrutura de arquivos

```
HopLens/
├── src/                            ← Next.js 16 App Router
│   ├── proxy.ts                    ← proteção de rotas /dashboard/* (Next.js 16: middleware→proxy)
│   ├── app/
│   │   ├── layout.tsx              ← metadata + fontes Geist
│   │   ├── page.tsx                ← redireciona → /login ou /dashboard
│   │   ├── actions/
│   │   │   └── auth.ts             ← Server Actions: signup, login, logout
│   │   ├── (auth)/                 ← route group (layout centralizado)
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── dashboard/
│   │   │   ├── layout.tsx          ← nav + verificação de sessão
│   │   │   ├── page.tsx            ← overview: narrativa conselheiro + cards
│   │   │   └── monitors/
│   │   │       ├── new/page.tsx    ← formulário de criação
│   │   │       └── [id]/page.tsx   ← detalhe: tabela por região + alertas
│   │   └── api/
│   │       └── monitors/
│   │           ├── route.ts        ← GET (lista) / POST (cria)
│   │           └── [id]/
│   │               ├── route.ts    ← GET / PATCH / DELETE
│   │               └── stats/route.ts ← stats por região + alertas recentes
│   ├── lib/
│   │   ├── db.ts                   ← singleton postgres.js (DATABASE_URL)
│   │   └── auth.ts                 ← createSession / getSession / deleteSession
│   └── test/
│       └── setup.ts                ← configura env vars para testes unitários
│
├── api/                            ← Rust / axum
│   ├── src/
│   │   ├── main.rs                 ← entry point, router, tokio tasks
│   │   ├── config.rs               ← variáveis de ambiente tipadas
│   │   ├── db.rs                   ← PgPool + run_migrations()
│   │   ├── redis.rs                ← deadpool-redis Pool
│   │   ├── routes/
│   │   │   ├── health.rs           ← GET /health ✅
│   │   │   ├── ingest.rs           ← POST /api/ingest ✅
│   │   │   └── monitors.rs         ← GET /api/monitors/active ✅
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
| `NEXT_PUBLIC_API_URL` | Next.js (futuro) | — | URL da Rust API (acessível pelo browser) |

> **Nota:** `NEXTAUTH_SECRET` e `NEXTAUTH_URL` foram removidos — o sistema de auth é agora custom (sem NextAuth).
> A sessão usa um UUID armazenado na tabela `sessions` do PostgreSQL + cookie HTTP-only `session=<token>`.

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

### `GET /api/monitors/active`
Lista todos os monitors com `is_active = TRUE`. Chamado pelo CF Worker em modo scheduled.

**Headers obrigatórios:**
```
x-probe-secret: <PROBE_SECRET>
```

**Response 200:**
```json
{
  "monitors": [
    { "id": "uuid-do-monitor", "url": "https://exemplo.com" }
  ]
}
```

```
401 Unauthorized: { "error": "unauthorized" }
500 Internal Server Error: { "error": "failed to fetch monitors" }
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

## Auth — Como funciona

O sistema de auth é 100% custom, sem bibliotecas externas de auth.

### Fluxo
1. **Signup/Login** → `src/app/actions/auth.ts` (Server Actions)
2. Senha hasheada com `bcryptjs` (12 rounds)
3. Sessão criada: UUID aleatório inserido na tabela `sessions` com `expires = NOW() + 30 dias`
4. Cookie HTTP-only `session=<uuid>` enviado ao browser
5. Em cada request: `getSession()` em `src/lib/auth.ts` busca o UUID no DB e retorna `{id, email}` do usuário

### Proteção de rotas
- `src/proxy.ts` — equivalente ao antigo `middleware.ts` no Next.js 16 (renomeado)
- Verifica apenas se o cookie `session` está presente (verificação rápida, sem DB)
- A validade real da sessão é verificada pelo `getSession()` dentro de cada Server Component/Action
- Rotas protegidas: `/dashboard/**`

### Segurança implementada
- Cookie `httpOnly + sameSite=lax + secure` (em prod)
- Anti-timing attack no login: `bcrypt.compare` sempre roda, mesmo quando o email não existe
- Email normalizado para minúsculas antes de persistir/comparar

---

## API Routes (Next.js) — Endpoints

Esses endpoints são usados pelo dashboard para CRUD de monitors. Autenticação via cookie de sessão.

### `GET /api/monitors`
Lista monitors do usuário autenticado.

### `POST /api/monitors`
Cria um novo monitor.
```json
{ "url": "https://...", "name": "opcional", "alert_threshold_ms": 5000 }
```

### `GET /api/monitors/:id`
Detalhe de um monitor.

### `PATCH /api/monitors/:id`
Atualiza campos opcionais: `name`, `alert_threshold_ms`, `is_active`.

### `DELETE /api/monitors/:id`
Remove o monitor e seus dados em cascata.

### `GET /api/monitors/:id/stats?hours=24`
Retorna estatísticas por região (TTFB avg/min/max, cache hit %, erros) e alertas recentes.
O parâmetro `hours` aceita 1–168 (padrão: 24).

---

## Testes

### Rodar

```bash
npm test                # roda uma vez
npm run test:watch      # modo watch
npm run test:coverage   # com relatório de cobertura
```

### O que é testado

| Arquivo de teste | O que testa |
|:---|:---|
| `src/lib/auth.test.ts` | `getSessionTokenFromCookie` — parsing puro de cookie header |
| `src/app/dashboard/dashboard.test.ts` | `statusLabel` e `advisorNarrative` — lógica de UI do overview |

### O que NÃO é testado ainda (próximos passos)

- **Integração com DB**: signup/login/getSession requerem um PostgreSQL de teste rodando
- **API Routes**: requerem `next dev` ou um test server

Para testes de integração, usar um PostgreSQL separado (`TEST_DATABASE_URL`) e rodar via Docker em CI.

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
| Dashboard | Next.js | 16.2 (App Router) | SSR, React Server Components, deploy Vercel |
| Estilo | Tailwind CSS | 4 | Velocidade de desenvolvimento |
| Backend API | Rust / axum | axum 0.7 | Performance, confiabilidade para processos longos |
| Async runtime | tokio | 1 | Padrão para Rust async |
| ORM/Queries | sqlx | 0.7 | Queries tipadas em compile-time, suporte a TimescaleDB |
| DB client (Next.js) | postgres.js | 3 | Acesso direto ao PG do dashboard, sem ORM |
| Banco de dados | TimescaleDB | pg16 | Compressão e queries de time-series otimizadas |
| Cache/filas | Redis | 7 | Rate limiting e cache de resultados recentes |
| Probes Phase 1 | Cloudflare Workers | — | 300+ cidades, ~$5/mês, sem infra a manter |
| Probes Phase 2 | Node.js / Fly.io | — | Acesso a `net.Socket` para DNS/TCP/TLS breakdown |
| Auth | Custom (bcryptjs + pg) | — | Self-hosted, sessões UUID na tabela `sessions`; NextAuth incompatível com Next.js 16 |
| Testes | Vitest | 4 | Zero config, compatível com TypeScript nativo |
| Email | Resend | — | API simples, 100 emails/dia grátis |
| Containerização | Docker Compose | — | Paridade perfeita local ↔ VPS |
