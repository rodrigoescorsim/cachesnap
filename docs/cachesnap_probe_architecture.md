# CacheSnap — Arquitetura de Probe: do Disparo ao Dashboard

> Diagramas de sequência e fluxo de **tudo** que acontece entre o scheduler disparar um probe
> e o dado aparecer no dashboard — com os pontos exatos de captura de cada métrica.

---

## 1. Visão geral do sistema (componentes)

```mermaid
graph TD
    subgraph Browser["Usuário"]
        UI[Dashboard Next.js]
    end

    subgraph VPS["VPS — Rust API"]
        SCHED[Scheduler\ntokio loop 1s]
        INGEST[POST /api/ingest]
        BASELINE[Baseline Calculator\n1h loop]
        DETECTOR[Anomaly Detector]
        NOTIFIER[Notifier\nResend / Slack]
        REDIS[(Redis\nlast_check:uuid\nwarmup_probe_index:uuid)]
        DB[(TimescaleDB\nprobe_results\nmonitor_baselines\nalerts)]
    end

    subgraph LAMBDA["AWS Lambda — 8 regiões"]
        SA[sa-east\nSão Paulo 🇧🇷]
        EU[eu-west\nFrankfurt 🇩🇪]
        USE[us-east\nOhio 🇺🇸]
        USW[us-west\nOregon 🇺🇸]
        AP[ap-east\nTokyo 🇯🇵]
        APS[ap-south\nMumbai 🇮🇳]
        OC[oc\nSydney 🇦🇺]
        AF[af-south\nCape Town 🇿🇦]
    end

    subgraph Target["Site monitorado"]
        EDGE_CDN[Edge / CDN PoP\nCloudflare · Fastly · Vercel]
        ORIGIN[Servidor de origem]
    end

    SCHED -->|"POST /\nx-probe-secret"| SA & EU & USE & USW & AP & APS & OC & AF
    SA & EU & USE & USW & AP & APS & OC & AF -->|"fetch(url)"| EDGE_CDN
    EDGE_CDN -->|"cache MISS"| ORIGIN
    EDGE_CDN -->|"response + headers"| SA & EU & USE & USW & AP & APS & OC & AF
    SA & EU & USE & USW & AP & APS & OC & AF -->|"POST /api/ingest"| INGEST
    INGEST --> DB
    INGEST -->|broadcast monitor_id| SSE[SSE Channel\nbroadcast::Sender]
    INGEST --> DETECTOR
    DETECTOR --> DB
    DETECTOR --> NOTIFIER
    BASELINE --> DB
    UI -->|queries SQL| DB
    UI -->|GET /api/events\nEventSource| SSE
    SSE -->|router.refresh on probe complete| UI
```

---

## 2. Warmup Burst — primeiras probes aceleradas

Ao criar um monitor, as 3 primeiras probes usam intervalos reduzidos para que o
usuário veja gráficos e médias (que requerem ≥ 2 amostras) logo nos primeiros 90
segundos, independente do `check_interval_seconds` configurado.

### Cadência

| Probe | Offset acumulado | Gap usado |
|-------|-----------------|-----------|
| 1 | t = 0 s | imediata (via `/dispatch` na criação) |
| 2 | t = 60 s | `warmup_probe_index = 0` → gap 60s |
| 3 | t = 120 s | `warmup_probe_index = 1` → gap 60s |
| 4+ | t = 120 s + `interval` | cadência normal |

**Regra de aceleração exclusiva:** o gap de warmup só é aplicado se for **menor**
que `check_interval_seconds`. Monitores com intervalo ≤ 60s não são afetados.

### Estado Redis

| Chave | Valor | TTL | Descrição |
|-------|-------|-----|-----------|
| `last_check:{monitor_id}` | timestamp UNIX | sem TTL | Última probe despachada pelo scheduler |
| `warmup_probe_index:{monitor_id}` | `0`, `1` ou `2` | 300s | Contador de warmup; ausente ou ≥ 2 = cadência normal |

O `warmup_probe_index` é setado como `0` pelo endpoint `POST /api/monitors/:id/dispatch`
na criação do monitor (flag `is_manual = false`). O Lua script em `should_run_now`
incrementa e renova o TTL (300s) a cada probe de warmup, funcionando como fallback
caso o endpoint de dispatch não seja chamado.

### Sequência de criação com warmup

```
Next.js API                  Rust /dispatch            Redis                 Scheduler
─────────────────────────────────────────────────────────────────────────────────────────
POST /api/monitors           →  SET last_check = now   last_check = t0
(monitor criado)             →  SET warmup_index = 0   warmup_index = 0
                             →  spawn dispatch_probes  (probe 1 disparada)

                                                                          tick t+1s:
                                                                          should_run_now?
                                                                          (now-last_check)=1s
                                                                          gap=30s → NÃO

                                                                          tick t+60s:
                                                                          (now-last_check)=60s
                                                                          gap=60s → SIM
                             SET last_check = t+60s   last_check = t60   (probe 2 disparada)
                             INCR + EXPIRE warmup_index  warmup_index = 1

                                                                          tick t+120s:
                                                                          (now-last_check)=60s
                                                                          gap=60s → SIM
                             SET last_check = t+120s  last_check = t120  (probe 3 disparada)
                             INCR + EXPIRE warmup_index  warmup_index = 2

                                                                          tick t+120s+interval:
                                                                          gap = interval → SIM
                                                                          (cadência normal)
```

---

## 3. Ciclo completo de um probe (sequência)

> Um ciclo a cada `check_interval_seconds` por monitor (padrão: 300s).

```mermaid
sequenceDiagram
    participant RS as Rust Scheduler
    participant RD as Redis
    participant LB as Lambda Probe (região)
    participant TGT as Site monitorado
    participant API as Rust /api/ingest
    participant DB as TimescaleDB
    participant SSE as SSE Channel
    participant UI as Dashboard (Next.js)
    participant DT as Anomaly Detector
    participant NT as Notifier

    RS->>RS: ticker.tick() a cada 1s
    RS->>DB: SELECT monitors WHERE is_active = TRUE
    DB-->>RS: lista de monitores

    loop para cada monitor
        RS->>RD: Lua script — last_check:{uuid}
        RD-->>RS: should_run? (agora - last_check ≥ interval)

        alt deve rodar
            RS->>RD: SET last_check:{uuid} = now
            RS->>LB: POST / {monitor_id, url, ingest_url}\n x-probe-secret: ***
            LB-->>RS: 202 Accepted {ok, region}

            Note over LB: probe roda em background (async Node.js)

            LB->>LB: dns_start = performance.now()\naws_dns = socket 'lookup' event\ndns_ms = dns_end - dns_start
            LB->>LB: tls_ms = socket 'secureConnect' - 'connect'
            LB->>TGT: fetchStart = performance.now()\nfetch(url, {redirect: "follow"})
            Note over TGT: Edge CDN decide: HIT ou MISS

            alt cache HIT
                TGT-->>CF: resposta do edge\n+ headers (CF-Cache-Status, Server-Timing, CF-Ray...)
            else cache MISS
                TGT->>TGT: origin processa
                TGT-->>CF: resposta do origin\n+ headers
            end

            CF->>CF: ttfb_ms = performance.now() - fetchStart
            CF->>CF: await response.arrayBuffer()
            CF->>CF: download_ms = totalEnd - ttfbEnd\ntotal_ms = totalEnd - fetchStart

            LB->>LB: parseServerTiming(headers)\n→ edge_ms, origin_ms, breakdown{}
            LB->>LB: readCacheStatus() → HIT/MISS/BYPASS
            LB->>LB: served_by = CF-Ray ou X-Served-By
            LB->>LB: http_version = detectHttpVersion()
            LB->>LB: age_s = parseInt(Age header)
            LB->>LB: security_headers = collectSecurityHeaders()

            LB->>API: POST /api/ingest {ProbeResult JSON}\nx-probe-secret: ***
            API->>DB: INSERT INTO probe_results (...)
            DB-->>API: OK

            API->>SSE: tx.send(monitor_id)
            Note over SSE,UI: RealTimeHub (EventSource) recebe o\nmonitor_id e agenda router.refresh()\napós janela de debounce de 2s.\nO watchId filtra updates de outros monitors\nna página de detalhe.

            API->>DT: tokio::spawn(check_for_anomalies)

            alt probe retornou erro ou status ≥ 500
                DT->>DB: INSERT alerts (type='down')
                DT->>NT: notify(email + slack)
            else TTFB > baseline + 3σ ou +500ms
                DT->>DB: SELECT monitor_baselines
                DB-->>DT: avg, stddev
                DT->>DB: INSERT alerts (type='anomaly')
                DT->>NT: notify(email + slack)
            else anycast mismatch
                DT->>DB: INSERT alerts (type='anycast') se < 1 por 24h
            else age_s > 86400
                DT->>DB: INSERT alerts (type='zombie_cache') se < 1 por 24h
            end
        else intervalo não atingido
            Note over RS: pula este monitor neste tick
        end
    end

    loop a cada 1 hora (paralelo)
        RS->>DB: SELECT AVG/STDDEV ttfb_ms dos últimos 7 dias
        DB-->>RS: baselines por monitor+região
        RS->>DB: UPSERT monitor_baselines
    end
```

---

## 3. O que o Worker captura e de onde

```mermaid
flowchart LR
    subgraph Request["Requisição HTTP"]
        A[fetch com redirect:manual\npara contar hops]
        B[fetch com redirect:follow\nfetch final medido]
    end

    subgraph Timing["Medições de tempo"]
        T1["fetchStart = performance.now()"]
        T2["await fetch() retorna headers\n→ ttfb_ms = now - fetchStart"]
        T3["await arrayBuffer() drena body\n→ download_ms = now - ttfb_end\n→ total_ms = now - fetchStart"]
    end

    subgraph Headers["Headers lidos na response"]
        H1["CF-Cache-Status / X-Vercel-Cache / X-Cache\n→ cache_status = HIT | MISS | BYPASS"]
        H2["CF-Ray: abc123-GRU\n→ served_by = 'abc123-GRU'\n→ PoP extraído = 'GRU'"]
        H3["Server-Timing: edge;dur=12, origin;dur=38, db;dur=5\n→ edge_ms=12, origin_ms=38\n→ breakdown={edge:12, origin:38, db:5}"]
        H4["X-Timer: S12345,VS0,VE227 (Fastly)\n→ edge_ms=227 se Server-Timing ausente"]
        H5["Age: 7200\n→ age_s=7200 (zombie cache: >86400)"]
        H6["Alt-Svc: h3=...\n→ http_version='HTTP/3'"]
        H7["Strict-Transport-Security\nContent-Security-Policy\nX-Frame-Options\nX-Content-Type-Options\nReferrer-Policy\n→ security_headers{score: 0-5}"]
    end

    subgraph Null["Não disponível em CF Workers (legado)"]
        N1["dns_ms → ✅ Disponível no Lambda\n(socket 'lookup' event do Node.js)"]
        N2["tls_ms → ✅ Disponível no Lambda\n(socket 'secureConnect' - 'connect')"]
    end

    A --> B
    B --> T1 --> T2 --> T3
    B --> H1 & H2 & H3 & H4 & H5 & H6 & H7
    B -.- N1 & N2
```

---

## 4. Caminho da requisição na rede

> O que acontece entre o Worker fazer `fetch(url)` e a resposta chegar.

```mermaid
sequenceDiagram
    participant W as CF Worker\n(ex: sa-east / GRU)
    participant E as Edge PoP\n(CDN do site)
    participant O as Origin Server

    W->>E: GET https://site.com HTTP/2\n+ User-Agent CacheSnap

    alt Cache HIT
        E-->>W: 200 OK\nCF-Cache-Status: HIT\nCF-Ray: abc123-GRU\nAge: 120\nServer-Timing: cf-cache-status;desc="HIT"\nHsts, CSP, ...
        Note over W: ttfb_ms medido aqui ↑
        Note over W: download_ms: body drenado
        Note over W: edge_ms = dur do Server-Timing\norigin_ms = null (não tocou origin)

    else Cache MISS
        E->>O: Faz request ao origin
        O->>O: Processa (db, auth, app...)
        O-->>E: 200 OK + Server-Timing: db;dur=12, app;dur=38
        E-->>W: 200 OK\nCF-Cache-Status: MISS\nServer-Timing: edge;dur=5, origin;dur=50\nCF-Ray: abc123-GRU

        Note over W: ttfb_ms = edge + origem\nedge_ms = 5ms\norigin_ms = 50ms
    end

    W->>W: Monta ProbeResult completo
    W->>API: POST /api/ingest
```

---

## 5. Decomposição de tempo por probe

> Como os campos de tempo se relacionam graficamente.

```
Linha do tempo de um probe (cache MISS com Server-Timing):

t=0ms ─────────────────────────────────────────────────── t=total_ms
│                                                                    │
│  [── edge_ms ──][────── origin_ms ──────]                         │
│  [────────────── ttfb_ms ──────────────][── download_ms ──]       │
│                                                                    │
0           10          20          50          60          65ms

Exemplo concreto:
  ttfb_ms     = 55ms  ← tempo até receber os headers (edge + origin)
  download_ms = 10ms  ← drenar o body HTML
  total_ms    = 65ms  ← tudo junto
  edge_ms     =  5ms  ← tempo no PoP do CDN (do Server-Timing)
  origin_ms   = 50ms  ← tempo no servidor de origem (do Server-Timing)
  dns_ms      = null  ← não disponível em CF Workers
  tls_ms      = null  ← não disponível em CF Workers

Cache HIT (sem origin_ms):
  ttfb_ms     = 12ms  ← resposta direto do cache edge
  edge_ms     = 10ms  ← tempo no PoP
  origin_ms   = null  ← cache serviu, origin não foi acionado
  download_ms =  5ms
  total_ms    = 17ms
```

### Breakdown do Server-Timing (quando disponível)

> Servidores bem instrumentados expõem `Server-Timing` granular.
> CacheSnap armazena todo o breakdown em `server_timing_breakdown JSONB`.

```
Exemplo de Server-Timing real (Next.js + Vercel):
  Server-Timing: db;dur=12.4, auth;dur=3.1, cache;dur=0.8, app;dur=38.2

Capturado como:
  server_timing_breakdown = {
    "db":    12.4,
    "auth":   3.1,
    "cache":  0.8,
    "app":   38.2
  }
  origin_ms = 38.2   ← maior entrada com nome "app" ou "server"
  edge_ms   = 0.8    ← entrada com nome "cache"
```

---

## 6. Pipeline de análise pós-ingest

```mermaid
flowchart TD
    IN[POST /api/ingest recebido] --> SAVE[INSERT probe_results]
    SAVE --> SPAWN[tokio::spawn detector]

    SPAWN --> D1{error IS NOT NULL\nou status_code ≥ 500?}
    D1 -->|Sim| ADOWN[INSERT alerts\ntype='down'\nmetric='uptime']
    ADOWN --> NOTIFY

    D1 -->|Não| D2{Tem baseline?\nmonitor_baselines}
    D2 -->|Não - aguarda dados| END[Silencioso]
    D2 -->|Sim| D3{ttfb_ms >\nmax\navg + 3σ,\navg + 500ms?}
    D3 -->|Não| D4{anycast\nmismatch?}
    D3 -->|Sim| AANOM[INSERT alerts\ntype='anomaly'\ndesvio=actual/avg]
    AANOM --> NOTIFY

    D4 -->|Não| D5{age_s > 86400?}
    D4 -->|Sim| AANY[INSERT alerts\ntype='anycast'\nse não há alerta < 24h]
    AANY --> NOTIFY

    D5 -->|Não| END
    D5 -->|Sim| AZOM[INSERT alerts\ntype='zombie_cache'\nse não há alerta < 24h]
    AZOM --> NOTIFY

    NOTIFY[Notifier\nResend email + Slack/Discord webhook]

    subgraph Baseline ["Baseline Calculator — a cada 1h"]
        BQ[SELECT AVG·STDDEV ttfb_ms\nGROUP BY monitor_id, region\nwhere last 7 days\nAND error IS NULL]
        BQ --> BU[UPSERT monitor_baselines\nttfb_avg_ms\nttfb_stddev_ms\ncache_hit_rate\nsample_count]
    end
```

---

## 7. Dados armazenados por probe — tabela completa

| Campo | Tipo | Origem | Disponível? |
|---|---|---|---|
| `ttfb_ms` | float | `performance.now()` após `await fetch()` | ✅ Sempre |
| `download_ms` | float | `performance.now()` após `arrayBuffer()` − ttfb_end | ✅ Sempre |
| `total_ms` | float | `totalEnd - fetchStart` | ✅ Sempre |
| `dns_ms` | float | Socket `lookup` event do Node.js (Lambda) | ✅ Sempre (no Lambda) |
| `tls_ms` | float | Socket `secureConnect` - `connect` event (Lambda) | ✅ Sempre (no Lambda) |
| `edge_ms` | float | `Server-Timing` — entrada com nome edge/cdn/cache | ⚠️ Se site expõe |
| `origin_ms` | float | `Server-Timing` — entrada com nome origin/app/server | ⚠️ Se site expõe |
| `status_code` | int | `response.status` | ✅ Sempre |
| `cache_status` | string | `CF-Cache-Status` / `X-Vercel-Cache` / `X-Cache` | ⚠️ Se CDN responde |
| `served_by` | string | `CF-Ray` (código IATA) ou `X-Served-By` | ⚠️ Se Cloudflare/Fastly |
| `http_version` | string | `CF-Ray` presente → H2, `Alt-Svc: h3` → H3 | ⚠️ Heurística |
| `redirect_count` | int | Fetch manual com `redirect: "manual"` | ✅ Sempre |
| `content_length` | int | `arrayBuffer().byteLength` | ✅ Sempre |
| `age_s` | int | Header `Age` | ⚠️ Se CDN envia |
| `security_headers` | JSONB | 5 headers: HSTS, CSP, X-Frame, X-Content-Type, Referrer | ✅ Sempre (score 0-5) |
| `server_timing_breakdown` | JSONB | Todos os entries `name;dur=N` do Server-Timing | ⚠️ Se site expõe |
| `region` | string | Variável `REGION` do ambiente do Worker | ✅ Sempre |
| `error` | string | `catch(err)` — timeout, DNS fail, etc. | ⚠️ Só em falha |

---

## 8. Mapa de regiões e PoPs

```mermaid
graph LR
    subgraph Lambda["AWS Lambda (8 regiões)"]
        SA["sa-east\nSão Paulo 🇧🇷"]
        EU["eu-west\nFrankfurt 🇩🇪"]
        USE["us-east\nOhio 🇺🇸"]
        USW["us-west\nOregon 🇺🇸"]
        AP["ap-east\nTokyo 🇯🇵"]
        APS["ap-south\nMumbai 🇮🇳"]
        OC["oc\nSydney 🇦🇺"]
        AF["af-south\nCape Town 🇿🇦"]
    end

    subgraph CDN["PoPs detectados via CF-Ray / X-Served-By"]
        P1["GRU — Guarulhos, BR"]
        P2["FRA — Frankfurt, DE"]
        P3["CMH/CLE — Ohio, US"]
        P4["PDX — Oregon, US"]
        P5["NRT — Tokyo, JP"]
        P6["BOM — Mumbai, IN"]
        P7["SYD — Sydney, AU"]
        P8["CPT — Cape Town, ZA"]
    end

    SA --> P1
    EU --> P2
    USE --> P3
    USW --> P4
    AP --> P5
    APS --> P6
    OC --> P7
    AF --> P8

    Note["O CF-Ray identifica qual PoP\nda CDN do site atendeu a requisição.\nEx: abc123-GRU significa que o PoP\nde Guarulhos serviu a resposta."]
```

---

## 9. É possível mostrar o waterfall visualmente no monitor?

**Sim.** Os dados já estão todos capturados. O que falta é a visualização.

### O que se pode exibir hoje (dados existentes)

```
Probe de stripe.com — São Paulo — 2026-04-08 14:32:01
─────────────────────────────────────────────────────────────────────────────

Fase              │ 0ms    10ms   20ms   30ms   40ms   50ms   60ms   65ms
──────────────────┼──────────────────────────────────────────────────────────
Edge (CDN PoP)    │ ████   12ms
Origin (servidor) │        ████████████████████████████   38ms
──────────────────┼──────────────────────────────────────────────────────────
TTFB              │ ██████████████████████████████████████   50ms
Download (body)   │                                     ██████   15ms
TOTAL             │ ██████████████████████████████████████████████   65ms
──────────────────┼──────────────────────────────────────────────────────────

Cache: MISS  │  PoP: GRU  │  Hops: 1  │  HTTP/2  │  Security: 4/5
Age: —  │  Content: 42.3 KB

Server-Timing breakdown:
  db    ████ 12ms
  auth  ██ 5ms
  app   ████████████████████ 38ms
```

### Comparação das 5 regiões (waterfall compacto por linha)

```
Região        TTFB    │ Waterfall (0────────────────100ms)  │ Cache  PoP
──────────────────────┼──────────────────────────────────────┼──────────────
São Paulo     38ms    │ ████████████████                     │ HIT    GRU
Frankfurt     41ms    │ █████████████████                    │ HIT    FRA
New York      44ms    │ ██████████████████                   │ HIT    IAD
Tokyo         89ms    │ ██████████████████████████████████   │ MISS   NRT ⚠️
Sydney        94ms    │ ███████████████████████████████████  │ HIT    SYD
```

### O que ainda NÃO se pode exibir (limitação de plataforma)

| Fase | Status | Motivo |
|---|---|---|
| DNS lookup | ❌ Não disponível | CF Workers usa pool global, sem acesso ao timing de DNS |
| TLS handshake | ❌ Não disponível | TLS ocorre antes do código do Worker |
| TCP connect | ❌ Não disponível | Mesmo motivo |
| DNS → TLS → TTFB completo | 🔲 Fase 2 | Exige probes Node.js no Fly.io (acesso à `net.connect()`) |

### Implementação recomendada

A visualização seria uma nova seção na **aba Performance** do monitor detail,
renderizada em SVG puro (como o TTFB timeline já existente), usando os campos
`ttfb_ms`, `download_ms`, `edge_ms`, `origin_ms`, `server_timing_breakdown`,
`cache_status`, `served_by`, `redirect_count` e `age_s` de um probe específico.

**Dados de entrada:** último probe por região (ou probe selecionado por timestamp).

**Output:** barra de waterfall horizontal por região + breakdown do Server-Timing
quando disponível.

---

## 10. Fluxo completo resumido (uma linha por etapa)

```mermaid
flowchart LR
    A["⏱ Scheduler Rust\n1s tick\nLua Redis dedup"] -->|"POST /\nx-probe-secret"| B

    B["☁️ CF Worker\nsa-east · eu-west\nus-east · ap-east · oc"] -->|"fetch url\n+ contar redirects\n+ medir TTFB"| C

    C["🌐 Edge CDN\nPoP do site\n(CF, Fastly, Vercel...)"] -->|"cache MISS"| D
    D["🖥 Origin\nservidor real\ndb + app + auth"]

    C -->|"response\n+ headers"| B
    D -->|"response\n+ Server-Timing"| C

    B -->|"ProbeResult JSON\nx-probe-secret"| E

    E["🦀 Rust /api/ingest\nINSERT probe_results"] --> F
    E --> G

    F["🐘 TimescaleDB\nprobe_results\nhypertable 7d"] --> H
    G["🔍 Anomaly Detector\ndown · anomaly\nanycast · zombie_cache"] --> I
    I["📬 Notifier\nResend email\nSlack / Discord"] 

    H --> J["📊 Dashboard\nNext.js queries SQL\nServer Component"]
    H --> K["📈 TtfbChart\ntime_bucket queries\nTTFB · DNS/TLS · Cache hit rate"]
```

---

## 6. Gráficos de série temporal

Os dados armazenados em `probe_results` são agregados por `time_bucket` e visualizados como gráficos SVG inline no componente `TtfbChart` (`src/app/dashboard/monitors/[id]/ttfb-chart.tsx`).

| Gráfico | Métrica | Granularidade 24h | Granularidade 7d | Tipo de linha |
|---------|---------|------------------|-----------------|---------------|
| Main Speed | `AVG(ttfb_ms)` por região | 30 min | 6 h | Sólida, cor por região |
| Network Phase | `AVG(dns_ms + tls_ms)` global | 30 min | 6 h | Tracejada (DNS=roxo, TLS=fuchsia) |
| Cache hit rate | `COUNT HIT / COUNT *` por região | 30 min | 6 h | Sólida, cor por região; escala 0-100% |

O componente renderiza apenas a partir de 2+ buckets. Com menos dados exibe "Analyzing historical patterns...".

Os helpers puros de cálculo (`formatChartLabel`, `niceMax`, `globalBucketAverage`) estão em `ttfb-chart.helpers.ts` e cobertos por testes unitários em `ttfb-chart.test.ts`.

---

*Documento atualizado em 2026-04-10. Reflete a migração de Cloudflare Workers para AWS Lambda (8 regiões), SSE real-time e gráficos de série temporal.*
*Baseado no código real de `probes/lambda/index.mjs`, `api/src/routes/ingest.rs`, `api/src/alerts/detector.rs` e `api/src/scheduler/runner.rs`.*
