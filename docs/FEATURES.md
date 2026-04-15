# CacheSnap — Product features

This document is the **canonical catalog** of what the system offers today: capabilities, differentiators, and alert behavior. User-facing strings are described in **English** (the product’s UI language).

---

## Positioning

- **Zero-code edge monitoring:** Monitor any public HTTPS URL without installing an SDK, agent, or changing DNS—paste a URL and select regions.
- **Cache- and latency-aware:** Interprets CDN/cache signals (e.g. cache status headers) alongside timing so “slow” is explained in context, not only as a number.
- **Multi-region synthetic checks:** Probes run from multiple global locations so you can compare behavior by geography.
- **Plain-English diagnosis:** A deterministic, rule-based engine turns probe signals into short **diagnosis** and **recommended action** text (no LLM required for core rules).
- **Historical baselines:** Per-monitor, per-region rolling statistics (e.g. TTFB average and spread) support anomaly detection against *your* normal, not a fixed global threshold alone.
- **Rust ingest API:** Central ingestion, scheduling hooks, baselines, and alert detection run in the Rust service for predictable performance and clear separation from the dashboard.

---

## Stack snapshot (for context)

| Layer | Role |
| :--- | :--- |
| **Next.js (App Router)** | Dashboard, session auth, Server Actions, and app API routes backed by PostgreSQL |
| **Rust API (axum)** | Ingest, scheduler, baselines, diagnosis, alerts, SSE broadcast |
| **PostgreSQL / TimescaleDB** | Hypertables for time-series probe (and audit) data; **compression policies** on older chunks (e.g. `probe_results` after ~7 days—see migrations) to keep storage predictable |
| **Redis** | Atomic per-monitor scheduling locks (Lua scripts)—which monitor is due for a check or bypass audit |
| **AWS Lambda probes** | Regional HTTP probes (Node.js 20, arm64); **up to eight** region endpoints configured via environment variables |

See `README.md` and `docs/STACK.md` for runbooks and deeper technical detail.

---

## Account & monitors

- **Session-based access:** Sign up / sign in flows protect the dashboard; each **monitor** belongs to a **user** and is isolated from other accounts.
- **Per-monitor tuning:** Configurable **check interval** (how often scheduled probes run) and optional **audit interval** for origin/bypass runs (see below). Legacy fields such as `alert_threshold_ms` may exist in the schema for future or ancillary use—**anomaly alerts** are driven by statistical baselines in `detector.rs`, not that static threshold.

---

## Backend API surface (Rust)

| Endpoint | Purpose |
| :--- | :--- |
| `GET /health` | Liveness for the API process |
| `POST /api/ingest` | Authenticated probe results (`x-probe-secret`); enforces a **probe version** contract so stale workers cannot pollute data |
| `GET /api/monitors/active` | Lists active monitors for automation (e.g. legacy or auxiliary schedulers) |
| `GET /api/events?user_id=…` | **Server-Sent Events (SSE)** stream; after each successful ingest, the API notifies the owning user so the dashboard can refresh |
| `POST /api/monitors/:id/dispatch` | On-demand probe run for one monitor across all configured regions (`x-probe-secret`); optional **bypass** and **manual** flags align with audit vs. routine checks |

---

## Scheduling & probe execution

- **Redis-gated intervals:** The scheduler uses an atomic **Redis Lua** check so only one dispatch wins per monitor per interval (safe when multiple API instances run).
- **Regional dispatch:** Each due monitor triggers parallel requests to every **configured** regional probe URL (Lambda Function URL or equivalent); empty region env vars are skipped.
- **Manual runs:** The dashboard (via Next.js) can call **dispatch** to refresh data immediately instead of waiting for the next interval.

---

## Monitoring & analytics

- **HTTP/HTTPS endpoints:** Timing, status codes, redirects, HTTP version, content length, and diagnostic headers where the probe captures them.
- **Layer-oriented metrics:** DNS, TCP, TLS, TTFB, download, total, plus **edge** / **origin** split fields when the probe provides them—supporting “where is time going?” views.
- **Server-Timing:** Raw header and optional **structured breakdown** JSON for richer dashboards.
- **Security & TLS profile:** Structured **security headers** (e.g. HSTS, COOP) and **SSL/TLS metadata** (validity, days remaining, issuer, etc.) for UI and for the SSL expiry alert.
- **Per-region views:** Results and baselines are keyed by **monitor × region** so issues can be isolated geographically.
- **Probe metadata:** Fields such as **probe version** and **manual vs. scheduled** help distinguish user-triggered runs from routine checks.

---

## Origin / bypass audit (infrastructure comparison)

Some probe runs include a **bypass** path that measures the **origin** (or non-edge) route separately from the **edge** response. When bypass metrics are present, the API writes an additional row to the **`audit_results`** hypertable (edge vs. origin timings, status, cache signals, etc.). Scheduled runs use a **bypass audit interval** (default **1 hour**); if there is **no** audit history yet for a monitor, the system forces a bypass run so the dashboard is not empty indefinitely. The monitor detail UI includes a **bypass audit** view for this timeline.

---

## Baselines

- **Window:** Rolling **7 days** of successful probes (`error` excluded) per monitor × region.
- **Refresh:** Recalculated on a **fixed interval** (worker runs on an hourly ticker in `baseline/calculator.rs`).
- **Fields:** **TTFB mean and standard deviation**, **sample count**, and a simple **cache hit rate** (share of results whose cache status is not MISS/BYPASS/EXPIRED/DYNAMIC).

---

## Real-time dashboard updates

- After a successful ingest, the API resolves the monitor’s **user id** and pushes a small message on an internal broadcast channel; clients subscribed to **`GET /api/events`** receive SSE payloads filtered by **user**.
- The Next.js **RealTimeHub** component opens an `EventSource` to the Rust API and **debounces** `router.refresh()` so bursts of multi-region results collapse into a single UI refresh.

---

## Dashboard (Next.js)

- **Shared database:** The app uses **`postgres.js`** with `DATABASE_URL` for server-side reads and mutations (monitors, sessions, probe history)—the same PostgreSQL/TimescaleDB instance the Rust service writes to for ingest and baselines.
- **Typical monitor view:** Regional results table, TTFB trends, security-header checklist, TLS/SSL profile, alerts history, and (when data exists) **bypass audit** context—aligned with the fields described above.

---

## Ingest contract (probes)

- Probes must send the shared secret on **`x-probe-secret`**.
- The API rejects payloads whose **`probe_version`** does not match the currently deployed expectation (see `api/src/routes/ingest.rs`); this prevents obsolete or rogue workers from corrupting statistics.

---

## Diagnosis engine

The rule-based engine (`api/src/diagnosis/engine.rs`) consumes probe fields (errors, cache status, TTFB vs baseline, redirects, HTTP version, routing hints, cache age, etc.) and returns structured guidance: **severity**, **summary**, **cause**, **action**, and optional estimated gain.

It powers **down** and **anomaly** alerts and supports shared wording for other alert types where a diagnosis object is built.

---

## Alerts and notifications

Alerts are created in the Rust **detector** (`api/src/alerts/detector.rs`) immediately after a successful ingest. Rows live in the **`alerts`** table; the **notifier** (`api/src/alerts/notifier.rs`) attempts outbound delivery based on **per-monitor** settings.

### Delivery channels

| Channel | Behavior |
| :--- | :--- |
| **Email** | Sent via **Resend** when `notify_email_enabled` is true and `notify_email` is set; requires `RESEND_API_KEY` on the API. HTML body includes diagnosis and context. |
| **Slack-compatible webhook** | POST to the monitor’s webhook URL when `notify_slack_enabled` is true (many teams use the same payload shape for **Discord** incoming webhooks). |
| **Persistence** | Successful deliveries set `notified_email` / `notified_slack` on the alert row for auditing. |

If no channel is configured or the API key is missing, alerts are still **stored** and visible in the dashboard; only outbound delivery is skipped.

### 1. Downtime / error (`down`)

- **When:** The probe reports an **error** (e.g. timeout) **or** HTTP **status ≥ 500**.
- **Metric:** `uptime` (stored `actual_ms` reflects total time where applicable).
- **Copy:** Diagnosis and action come from the diagnosis engine based on the failure context.

### 2. TTFB statistical anomaly (`anomaly`)

- **When:** Monitor is “up”, a regional **baseline** exists, and current TTFB is statistically far above normal: greater than **max(mean + 3×σ, mean + 500 ms)** (reduces noise on very fast sites).
- **Metric:** `ttfb_ms`; includes **baseline**, **actual**, and **deviation_factor** (e.g. multiple of normal).
- **Copy:** Engine-generated diagnosis and recommended action.

### 3. Anycast / routing mismatch (`anycast`)

- **When:** Heuristics detect a **routing / POP mismatch** vs the probe region (via `served_by` and related signals).
- **Metric:** `routing`.
- **Rate limit:** At most **one** alert of this type per **monitor + region** per **24 hours** (prevents repeated alerts for a persistent condition).

### 4. Zombie / stale cache signal (`zombie_cache`)

- **When:** Response **cache age** (`age_s`) exceeds **86 400** seconds (24 hours)—long-lived cached object worth reviewing.
- **Metric:** `age_s`.
- **Rate limit:** Same **24-hour** deduplication per **monitor + region**.

### 5. SSL certificate expiry (`ssl_expiry`)

Non-latency rule: it does **not** use TTFB baselines. It relies on structured SSL data in the ingest payload.

| Aspect | Behavior |
| :--- | :--- |
| **Payload field** | `security_headers.ssl.days_remaining` (integer). |
| **Condition** | Alert fires when **days_remaining &lt; 15** (i.e. **14 days or fewer** remaining). |
| **Severity** | Treated as **critical** in the diagnosis object used for this alert. |
| **Diagnosis (summary)** | **"SSL Certificate expiring in {N} days"** (English). |
| **Cause** | **"SSL Certificate will expire in {N} days."** |
| **Recommended action** | **"Renew your SSL certificate immediately to prevent site downtime and security warnings."** |
| **Stored metric name** | `days_remaining`; `actual_ms` column holds the numeric days value for this alert type. |
| **Rate limit** | At most **one** `ssl_expiry` alert per **monitor + region** per **24 hours**. |

> **Note:** The dashboard may also show `valid_from` / `valid_to`; the backend rule for this alert uses **`days_remaining`** from the probe payload, not a raw `valid_to` timestamp.

---

## Strong points (summary)

1. **Frictionless onboarding** — URL-only, no instrumentation.  
2. **Regional truth** — same monitor, multiple vantage points (Lambda-backed regions with honest geography vs. pure Anycast illusions).  
3. **Actionable narrative** — diagnosis + next step, not only charts.  
4. **Adaptive anomalies** — baselines make “slow” relative to *your* history (7-day rolling stats).  
5. **Operational safety nets** — downtime, routing surprises, stale cache, and **certificate expiry** covered by automated alerts.  
6. **Origin-aware auditing** — optional **bypass** path and **`audit_results`** storage to contrast edge vs. origin behavior.  
7. **Live dashboard** — **SSE** from the Rust API to debounced refresh of monitor views when new data lands.  
8. **Flexible notifications** — **email (Resend)** and **Slack webhook** per monitor, with delivery flags on each alert.  
9. **Reliable scheduling** — Redis-coordinated intervals and optional **on-demand dispatch**.  
10. **Single ingest pipeline** — authenticated ingest → TimescaleDB → baselines + detector → notifier + real-time fan-out.

For business positioning, pricing tiers, and roadmap narrative, see `docs/cachesnap.md`. For implementation status and milestones, see `docs/STATUS.md`.
