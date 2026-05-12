# CacheSnap — Referência Técnica

> Consulte este documento quando precisar entender como algo funciona,
> como rodar localmente, ou como conectar as peças.

---

## Visão geral da arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│  PROBES (AWS Lambda — Node.js 20, arm64)                        │
│  N regiões (tabela `regions`): sa-east · us-east · us-west ·    │
│  eu-west · ap-east · ap-south · oc · af-south (+ novas)         │
│  Mede: DNS, TCP, TLS, TTFB, download, cache, headers, security  │
│  → POST /api/ingest  (com PROBE_SECRET no header)               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  API RUST (axum)  — porta 3001                                  │
│  ├─ POST /api/ingest          → persiste no TimescaleDB         │
│  ├─ GET  /api/monitors/active → lista monitors ativos           │
│  ├─ GET  /health              → status da API                   │
│  ├─ GET  /api/events          → SSE fan-out por user_id         │
│  ├─ POST /api/monitors/:id/dispatch → disparo on-demand         │
│  ├─ scheduler/         → loop 1s, Redis Lua atômico             │
│  ├─ baseline/          → calcula avg/stddev por região (hourly) │
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

O Scheduler (`api/src/scheduler/runner.rs`) é o coração do sistema de monitoramento:
- **Loop de 1s**: A cada iteração, consulta no PostgreSQL os monitores ativos (o intervalo entre checks de um mesmo monitor continua sendo `check_interval_seconds`, aplicado via Redis Lua).
- **Atomicidade com Redis**: Usa um script Lua para verificar e atualizar o timestamp do último check (`last_check:ID`) de forma atômica. Evita dispatches duplicados em ambientes escalados.
- **Dispatch regional**: Para cada monitor devido, envia requisições HTTP `POST` para as Lambda Function URLs de todas as regiões habilitadas (lidas da tabela `regions`).
- **Bypass inteligente**: Disparo de bypass audit (origin comparison) limitado a 1×/hora via Redis; forçado no primeiro probe se não há histórico.
- **Regiões dinâmicas**: URLs e metadados das Lambdas vivem na tabela `regions` do banco (não mais em env vars). Adicionar uma região = `INSERT INTO regions` + criar a Lambda na AWS.

#### Limitação de concorrência, HTTP 429 e backpressure (2026)

Para evitar rajadas que saturam as Function URLs (muitos `429 Too Many Requests`) e evitar milhares de `tokio::spawn` por segundo, a API aplica:

| Mecanismo | Onde | O quê faz |
|:---|:---|:---|
| **Limite de monitores por tick** | `runner.rs` | `futures::stream` + `buffer_unordered(N)` — no máximo `PROBE_SCHEDULER_MAX_MONITORS_PARALLEL` monitores a avaliar/dispatchar em paralelo por segundo (default **16**). |
| **Limite de regiões por monitor** | `runner.rs` | Dentro de `dispatch_probes`, outro `buffer_unordered` limita quantas regiões disparam em paralelo por monitor (`PROBE_DISPATCH_REGION_PARALLEL`, default **3**). |
| **Semáforo global** | `scheduler/dispatch_limiter.rs` | Cap de `POST` de probe em voo em todo o processo (`PROBE_DISPATCH_MAX_GLOBAL`, default **64**). |
| **Semáforo por região** | `dispatch_limiter.rs` | Um `tokio::sync::Semaphore` lazy por `region_id` — no máximo `PROBE_DISPATCH_MAX_PER_REGION` requisições simultâneas à mesma URL de worker (default **3**). |
| **Retry em 429** | `dispatch_limiter.rs` | Até `PROBE_DISPATCH_429_MAX_ATTEMPTS` tentativas; entre tentativas liberta os semáforos, espera backoff exponencial ou respeita `Retry-After` numérico (segundos). |
| **Timeout de aquisição** | `dispatch_limiter.rs` | Se não conseguir permit em `PROBE_DISPATCH_ACQUIRE_TIMEOUT_SECS`, desiste **só dessa região neste ciclo** (evita fila infinita). |
| **Jitter determinístico** | `dispatch_limiter.rs` | Pequeno atraso inicial por `(monitor_id, region_id)` para espalhar pedidos no mesmo tick (sem `Math.random`/`rand` no caminho crítico). |
| **Lista de regiões compartilhada** | `runner.rs` | `Arc<Vec<(region_id, lambda_url)>>` no tick — evita clonar o vetor inteiro por monitor. |
| **Cliente HTTP** | `main.rs` | `reqwest::Client` com `timeout` e `connect_timeout` para não reter permits em rede presa. |

Configuração tipada: `ProbeDispatchConfig` em `api/src/config.rs` (carregada de env com defaults + `sanitize()` que garante `max_global >= max_per_region` e avisa se o produto monitores×regiões excede o cap global).

Referência de código: `api/src/scheduler/dispatch_limiter.rs`, testes unitários no mesmo ficheiro (`exponential_backoff`, `Retry-After`, jitter).

Os Probes (`probes/lambda/index.mjs`) rodam como AWS Lambda (Node.js 20, arm64):
- **Métricas de rede**: `dns_ms`, `tcp_ms`, `tls_ms` via `net.Socket` nativo — diferencial vs. Cloudflare Workers.
- **Timing completo**: `ttfb_ms`, `download_ms`, `total_ms`, `redirect_count`.
- **Cache**: `cache_status` de múltiplos CDNs (CF-Cache-Status, X-Vercel-Cache, X-Cache, etc.).
- **Headers de diagnóstico**: `served_by` (PoP), `server_timing`, `http_version`, `content_length`.
- **Security**: `security_headers` JSONB (HSTS, CSP, X-Frame-Options, etc.) + `age_s` (zombie cache detection).
- **CDN detection**: `cdn_provider` detectado por heurística de headers.

> **Legado:** `workers/probe/` (Cloudflare Workers, 5 regiões) — descontinuado em Abril/2026. Mantido apenas como referência histórica. Limitações que motivaram a migração: Anycast Trap (sem separação geográfica real) e ausência de acesso a `net.Socket` (dns_ms/tls_ms sempre null).

---

## Estrutura de arquivos

```
cachesnap/
├── src/                            ← Next.js 16 App Router
│   ├── app/
│   │   ├── layout.tsx              ← metadata + fontes Geist
│   │   ├── page.tsx                ← landing page (hero + test form) ou redirect para /dashboard
│   │   ├── hero-url-form.tsx       ← Client Component do formulário hero
│   │   ├── actions/
│   │   │   └── auth.ts             ← Server Actions: signup, login, logout
│   │   ├── (auth)/                 ← route group (layout centralizado)
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── dashboard/
│   │   │   ├── layout.tsx          ← nav + verificação de sessão
│   │   │   ├── page.tsx            ← overview: cards com borda de estado
│   │   │   ├── real-time-hub.tsx   ← SSE client (EventSource → debounced router.refresh)
│   │   │   ├── auto-refresh.tsx    ← polling quando collecting data
│   │   │   ├── presenter.ts        ← lógica de UI pura (statusLabel, cardBorderClass, etc.)
│   │   │   └── monitors/
│   │   │       ├── new/page.tsx    ← formulário de criação
│   │   │       └── [id]/
│   │   │           ├── page.tsx               ← detalhe com 4 abas (?tab=performance|cache|security|alerts)
│   │   │           ├── monitor-actions.tsx    ← edit/delete/toggle + bypass variant
│   │   │           ├── monitor-settings.tsx   ← painel de configurações inline
│   │   │           ├── monitor-dispatch.tsx   ← botão de probe manual
│   │   │           ├── ttfb-chart.tsx         ← gráfico SVG 24h/7d (sem D3)
│   │   │           ├── probe-waterfall.tsx    ← timing breakdown (edge/origin/download)
│   │   │           └── probe-waterfall.helpers.ts ← helpers puros (28 testes)
│   │   └── api/
│   │       └── monitors/
│   │           ├── route.ts        ← GET (lista) / POST (cria)
│   │           └── [id]/
│   │               ├── route.ts         ← GET / PATCH / DELETE
│   │               ├── stats/route.ts   ← stats por região (horas configuráveis)
│   │               └── dispatch/route.ts ← POST disparo on-demand
│   ├── lib/
│   │   ├── db.ts                   ← singleton postgres.js (DATABASE_URL)
│   │   ├── auth.ts                 ← createSession / getSession / deleteSession
│   │   ├── edge-helpers.ts         ← extractPop, detectCdn (9 testes)
│   │   └── cdn-providers.ts        ← heurísticas de detecção CDN + cores
│   └── components/
│       └── logo.tsx
│
├── api/                            ← Rust / axum
│   ├── src/
│   │   ├── main.rs                 ← entry point, router, tokio tasks
│   │   ├── config.rs               ← Config + ProbeDispatchConfig (env de DB, Redis, probe limits)
│   │   ├── db.rs                   ← PgPool + run_migrations()
│   │   ├── redis.rs                ← deadpool-redis Pool
│   │   ├── routes/
│   │   │   ├── health.rs           ← GET /health
│   │   │   ├── ingest.rs           ← POST /api/ingest (probe version contract)
│   │   │   ├── monitors.rs         ← GET /api/monitors/active
│   │   │   ├── dispatch.rs         ← POST /api/monitors/:id/dispatch
│   │   │   └── events.rs           ← GET /api/events (SSE por user_id)
│   │   ├── models/
│   │   │   ├── probe_result.rs     ← ProbeResultPayload + ProbeResult
│   │   │   ├── monitor.rs          ← Monitor model
│   │   │   └── region.rs           ← Region model (id, lambda_url)
│   │   ├── diagnosis/
│   │   │   └── engine.rs           ← diagnose() rule-based (com testes unitários)
│   │   ├── scheduler/
│   │   │   ├── runner.rs           ← loop 1s, Redis Lua, buffer_unordered, dispatch_probes
│   │   │   └── dispatch_limiter.rs ← semáforos global/região, retry 429, jitter
│   │   ├── baseline/
│   │   │   └── calculator.rs       ← hourly: TTFB avg/stddev, cache hit %, 7-day rolling
│   │   └── alerts/
│   │       ├── detector.rs         ← down / anomaly / anycast / zombie_cache / ssl_expiry
│   │       └── notifier.rs         ← Resend (email HTML) + Slack/Discord webhook
│   ├── Cargo.toml
│   └── Dockerfile                  ← multi-stage, imagem ~20MB
│
├── probes/lambda/                  ← AWS Lambda probes (ativo)
│   ├── index.mjs                   ← probe principal (Node.js 20, arm64)
│   ├── cdn-providers.mjs           ← CDN detection
│   └── README.md                   ← guia de deploy por região
│
├── workers/probe/                  ← ⚠️ LEGADO — Cloudflare Workers (descontinuado Abril/2026)
│
├── migrations/                     ← 16 migrations (001 a 016)
│   └── 001_initial.sql … 016_add_regions_table.sql
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
├── .env.example                    ← variáveis raiz (se existir no repo)
├── api/.env.example                ← modelo focado na API Rust (+ probe dispatch)
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
| `DATABASE_URL` | Rust API + Next.js | ✅ | URL completa de conexão ao PostgreSQL |
| `REDIS_URL` | Rust API | ✅ | URL completa de conexão ao Redis |
| `PORT` | Rust API | — | Porta HTTP da API (default `3001`). Evite definir na mesma raiz que o Next se `next dev` não deva mudar de porta. |
| `API_PORT` | Rust API | — | Alternativa a `PORT`: a API usa `PORT` ou, se vazio, `API_PORT` (recomendado em monorepo com Next). |
| `PROBE_SECRET` | Rust API + Lambda | ✅ | Token compartilhado para autenticar probes |
| `API_URL` | Rust API + Lambdas | ✅ | URL pública da API (`{API_URL}/api/ingest`) — workers precisam alcançá-la |
| `RESEND_API_KEY` | Rust API | — | API key do Resend para emails de alerta |
| `SLACK_WEBHOOK_URL` | Rust API | — | Webhook Slack (opcional) |
| `APP_URL` | Rust API | — | URL base do Next.js (CORS / links nos alertas) |
| `NEXT_PUBLIC_API_URL` | Next.js | ✅ | URL da Rust API no browser (fetch, SSE) |

**Probe dispatch (opcionais — ver `api/.env.example` e `ProbeDispatchConfig` em `config.rs`):**

| Variável | Default | Descrição |
|:---|:---:|:---|
| `PROBE_DISPATCH_MAX_GLOBAL` | 64 | Máximo de `POST` de probe em voo no processo |
| `PROBE_DISPATCH_MAX_PER_REGION` | 3 | Máximo em voo por `region_id` (cada Function URL) |
| `PROBE_DISPATCH_REGION_PARALLEL` | 3 | Regiões em paralelo por monitor dentro de um `dispatch_probes` |
| `PROBE_SCHEDULER_MAX_MONITORS_PARALLEL` | 16 | Monitores processados em paralelo por tick de 1s |
| `PROBE_DISPATCH_429_MAX_ATTEMPTS` | 5 | Tentativas HTTP por região (inclui a 1.ª) em caso de 429 |
| `PROBE_DISPATCH_429_BASE_MS` | 120 | Backoff base (ms) quando não há `Retry-After` |
| `PROBE_DISPATCH_429_MAX_MS` | 5000 | Teto do backoff (ms) |
| `PROBE_DISPATCH_ACQUIRE_TIMEOUT_SECS` | 18 | Tempo máximo à espera de um permit do semáforo |

> **Regiões Lambda**: não são mais env vars. Ficam na tabela `regions` do banco.
> Para adicionar uma nova região: `INSERT INTO regions (id, label, description, color, lambda_url) VALUES (...)`.
> O scheduler recarrega a tabela a cada 60 segundos automaticamente.

> **Nota:** `NEXTAUTH_SECRET` e `NEXTAUTH_URL` foram removidos — o sistema de auth é agora custom (sem NextAuth).
> A sessão usa um UUID armazenado na tabela `sessions` do PostgreSQL + cookie HTTP-only `session=<token>`.

Para desenvolvimento local, use o `.env` na raiz (ou copie de `api/.env.example` como referência para variáveis da API). Os defaults de `ProbeDispatchConfig` aplicam-se mesmo sem definir `PROBE_DISPATCH_*`.

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

**`probe_results`** (hypertable TimescaleDB — telemetria orgânica/agendada)
```sql
time                      TIMESTAMPTZ  -- partição automática
monitor_id                UUID
region                    TEXT         -- "sa-east" | "us-east" | "us-west" | "eu-west" | "ap-east" | "ap-south" | "oc" | "af-south"
ttfb_ms                   FLOAT        -- Time to First Byte
download_ms               FLOAT
total_ms                  FLOAT
dns_ms                    FLOAT        -- via net.Socket (AWS Lambda) — null em probes antigos
tcp_ms                    FLOAT        -- via net.Socket
tls_ms                    FLOAT        -- via net.Socket
status_code               INT
cache_status              TEXT         -- CF-Cache-Status / X-Vercel-Cache / X-Cache / etc.
served_by                 TEXT         -- PoP IATA (ex: GRU) ou datacenter
server_timing             TEXT         -- header bruto
server_timing_breakdown   JSONB        -- { db: ms, auth: ms, cache: ms, ... }
http_version              TEXT         -- "HTTP/2" | "HTTP/3" | "HTTP/1.1"
redirect_count            INT
content_length            BIGINT
error                     TEXT
age_s                     INT          -- header Age (zombie cache detection)
security_headers          JSONB        -- { hsts, csp, x_frame_options, ..., ssl: { days_remaining, ... } }
edge_ms                   FLOAT        -- via Server-Timing: edge
origin_ms                 FLOAT        -- via Server-Timing: origin
probe_version             TEXT         -- contrato de versão (rejeita probes desatualizados)
is_manual                 BOOLEAN      -- true = disparado pelo usuário
cdn_provider              TEXT         -- "cloudflare" | "vercel" | "fastly" | etc.
```
Compressão automática após 7 dias. Índices em `(monitor_id, time DESC)` e `(monitor_id, region, time DESC)`.

**`audit_results`** (hypertable TimescaleDB — runs de bypass/comparação edge vs. origin)

Mesmo shape de `probe_results`, porém escrito separadamente para manter pureza estatística. Bypass agendado 1×/hora; forçado no primeiro probe de cada monitor.

**`monitor_baselines`**
```sql
monitor_id      UUID   -- PK composta
region          TEXT   -- PK composta
ttfb_avg_ms     FLOAT  -- média rolling 7 dias
ttfb_stddev_ms  FLOAT
cache_hit_rate  FLOAT  -- % com status != MISS/BYPASS/EXPIRED/DYNAMIC
sample_count    INT
calculated_at   TIMESTAMPTZ
```

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
alert_type       TEXT   -- 'down' | 'anomaly' | 'anycast' | 'zombie_cache' | 'ssl_expiry'
baseline_ms      FLOAT  -- valor histórico para comparação
actual_ms        FLOAT  -- valor que disparou o alerta (ou days_remaining para ssl_expiry)
deviation_factor FLOAT  -- ex: 2.4 = "2.4× mais lento que o normal"
estimated_gain_ms FLOAT -- ganho estimado de performance ao resolver
diagnosis        TEXT   -- texto gerado pelo engine
action           TEXT   -- ação recomendada
notified_email   BOOLEAN
notified_slack   BOOLEAN
created_at       TIMESTAMPTZ
```

**`monitors`** (campos relevantes além do básico)
```sql
check_interval          INT         -- intervalo de probe em segundos
audit_interval          INT         -- intervalo de bypass probe (padrão: 3600s)
notify_email            TEXT
notify_email_enabled    BOOLEAN
notify_slack_webhook    TEXT
notify_slack_enabled    BOOLEAN
cdn_provider            TEXT        -- detectado automaticamente pelo probe
alert_trend_min_samples INT         -- padrão 10: mínimo de probes na hora atual e na janela de referência antes de avaliar alertas de tendência (cache hit / TTFB), ver `api/src/trend/detector.rs`
alert_ttfb_trend_threshold_pct FLOAT -- padrão 50: limiar em % de mudança relativa de TTFB vs janela de referência (`api/src/trend/detector.rs`)
alert_cache_hit_trend_comparators TEXT[] -- padrão {prev_hour, day_avg}; same_hour_prev_day opcional no UI
alert_ttfb_trend_comparators     TEXT[] -- idem
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
| Probes (ativo) | AWS Lambda (Node.js 20, arm64) | — | Separação geográfica real, `net.Socket` para dns_ms/tls_ms |
| Probes (legado) | ~~Cloudflare Workers~~ | — | Descontinuado Abril/2026 — Anycast Trap + sem DNS/TLS |
| Auth | Custom (bcryptjs + pg) | — | Self-hosted, sessões UUID na tabela `sessions`; NextAuth incompatível com Next.js 16 |
| Testes | Vitest | 4 | Zero config, compatível com TypeScript nativo |
| Email | Resend | — | API simples, 100 emails/dia grátis |
| Containerização | Docker Compose | — | Paridade perfeita local ↔ VPS |
