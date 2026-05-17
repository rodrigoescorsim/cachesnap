# Background Workers

The API process spawns four background tasks on startup (`main.rs`). None of these expose HTTP endpoints — they run on internal timers.

---

## 1. Scheduler (`scheduler::runner::start`)

**Purpose:** Probe dispatch loop — the heartbeat of the system.

**Cycle:** Ticks every **1 second**. On each tick it fetches all active monitors and dispatches HTTP probes to AWS Lambda for each region that is "due" according to the monitor's `check_interval_seconds`.

**Sub-tasks within the loop:**

| Interval | Action |
|----------|--------|
| Every tick (1 s) | Evaluate each monitor via Lua/Redis atomic gate (`should_run_now`). Dispatch probes in parallel via `buffer_unordered`. |
| Every 60 ticks (1 min) | Re-fetch enabled regions from `regions` table (picks up new or disabled regions without restart). |
| Every 900 ticks (15 min) | Spawn `readiness::evaluate_and_persist` for every active monitor to update `audit_readiness_state`. |

**Warmup burst:** The first two dispatches for a new monitor use 60 s gaps (regardless of `check_interval_seconds`) so users see data fast.

**Bypass (audit) mode:** Decided per-monitor from `audit_readiness_state`:
- `disabled` → no bypass probe
- `warmup` → per-region Redis gate with `2 × audit_interval` gap
- `enabled` → global Redis gate at `audit_interval_seconds`

**Concurrency limits:** `ProbeDispatchLimits` (global semaphore + per-region semaphore + 429 retry with backoff).

**Env vars:** `PROBE_SECRET`, `API_URL` (for `ingest_url` sent to Lambda).

---

## 2. Alerts Worker (`alerts::worker::run`)

**Purpose:** Periodic audit of all active monitors for threshold-based alerts: cache hit rate, cache age, anycast routing, SSL expiry. Also runs the trend detector on each cycle.

**Cycle:** Configurable via `ALERTS_WORKER_INTERVAL_SECS` (default: **900 s / 15 min**).

**Per-cycle steps:**
1. Fetch all active monitors with their alert configs.
2. For each monitor — `audit_monitor_alerts`:
   - Pull latest probe per region (24 h window).
   - Check `cache_hit_low` via `probe_results_hourly` aggregate (≥ 5 CDN-eligible rows required).
   - Check `ssl_expiry` (< 15 days remaining → fires).
   - Check `anycast` (diagnosis engine detects routing anomaly).
   - Check `cache_age_alert` (age exceeds configured threshold hours).
   - Call `handle_incident` for any firing type → UPSERT `alert_incidents`, insert `alerts` history row, spawn notification.
   - Resolve incidents for types no longer detected (with positive-clear gate for `cache_hit_low`).
3. `resolve_stale_probe_incidents` — closes probe/trend incidents with no recent activity (silence = 2× digest backoff cap).
4. `trend::detector::run_cycle` — runs trend detection for all monitors.

**Incident state machine (`handle_incident`):**
- First open → `FirstFire` notification immediately.
- Subsequent fires → `Digest` after severity-tier cooldown; skipped if snoozed or cooldown still active.
- Key: one incident row per `(monitor_id, alert_type)` (unique constraint on non-resolved).

**Fast-path resolution:** `try_resolve_per_probe_incidents` is also called from the **ingest path** (not just this worker) for `cache_age_alert`, `anycast`, and `ssl_expiry` — resolves immediately when a new probe clears the condition, without waiting for the next audit cycle.

**Env vars:** `ALERTS_WORKER_INTERVAL_SECS`, `ALERT_SNOOZE_SECRET` (falls back to `PROBE_SECRET`).

---

## 3. Baseline Calculator (`baseline::calculator::run`)

**Purpose:** Computes per-monitor, per-region baselines for anomaly detection (ttfb and cache hit rate).

**Cycle:** Runs once on startup then every **3 600 s (1 hour)**.

**What it computes:** Aggregates raw `probe_results` over a **7-day window** (errors and null ttfb excluded) and upserts into `monitor_baselines`:

| Field | Definition |
|-------|-----------|
| `ttfb_avg_ms` / `ttfb_stddev_ms` | Overall TTFB stats |
| `cache_hit_rate` | `SUM(hit_count) / SUM(cdn_count)` — same denominator as `probe_results_hourly` (excludes DYNAMIC/BYPASS) |
| `ttfb_hit_avg_ms` / `ttfb_hit_stddev_ms` | TTFB for HIT/STALE/REVALIDATED rows only |
| `ttfb_miss_avg_ms` / `ttfb_miss_stddev_ms` | TTFB for non-hit CDN rows |

**Used by:** `alerts::detector` (anomaly detection — compares live probe TTFB to `ttfb_avg_ms ± N×stddev`).

---

## 4. Trend Baseline Computer (`trend::baseline_computer::run`)

**Purpose:** Computes per-hour trend baselines for trend-alert detection.

**Cycle:** Every **65 minutes**. The 65-minute offset (not 60) ensures the TimescaleDB continuous aggregate `probe_results_hourly` has refreshed for the previous closed bucket before we read it.

**What it computes:** For each `(monitor_id, region)` pair that has data in the last fully-closed hour bucket, upserts into `trend_baselines` with four reference points:

| Field | Definition |
|-------|-----------|
| `current_value` | Metric for the closed bucket hour |
| `prev_hour_value` | Same metric one hour earlier |
| `same_hour_yday_value` | Same metric 24 hours earlier (day-over-day) |
| `day_avg_value` | Average over the preceding 24 h window |

**Metrics computed:** `cache_hit_pct` and `ttfb_avg_ms`, both regional and global (`__global__` sentinel region — weighted aggregate across all regions).

**Used by:** `trend::detector` (called from the alerts worker cycle) to compare the current bucket against these references and open trend incidents.

---

## Startup order

```
main()
  ├── tokio::spawn(scheduler::runner::start)       — probe dispatch (1 s tick)
  ├── tokio::spawn(baseline::calculator::run)      — anomaly baselines (1 h)
  ├── tokio::spawn(alerts::worker::run)            — alert audit (15 min default)
  └── tokio::spawn(trend::baseline_computer::run)  — trend baselines (65 min)
```

All four workers share the same `AppState` (DB pool, Redis pool, config, HTTP client). Workers do not communicate with each other directly — coordination happens through the database tables they read and write.

---

## Observability

Logs use `tracing` with `subsystem: key=value` format. Set `RUST_LOG=api=debug` to see per-cycle output from all workers.

Set `RUST_LOG_FORMAT=json` to enable JSON-structured log output (useful for log aggregators like Loki or CloudWatch).
