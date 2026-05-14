/**
 * CacheSnap Lambda Probe — Phase 2
 *
 * Drop-in replacement for the Cloudflare Worker probe.
 * Runs on AWS Lambda (Node.js 20.x runtime) in 5 fixed regions.
 *
 * Gains over CF Workers:
 *   ✅ dns_ms   — Real DNS resolution time
 *   ✅ tls_ms   — Real TLS handshake time
 *   ✅ Honest PoP — No Anycast trap; the region IS where the code runs
 *
 * Feature parity with CF Worker probe:
 *   ✅ ttfb_ms, download_ms, total_ms
 *   ✅ cache_status (CF-Cache-Status, X-Vercel-Cache, X-Cache, X-Cache-Status, Cache-Status)
 *   ✅ served_by (CF-Ray, X-Served-By, X-Vercel-Id, X-Amz-Cf-Id, X-Azure-Ref)
 *   ✅ cdn_provider (stable label from response headers + served_by heuristics)
 *   ✅ server_timing + server_timing_breakdown (parsed)
 *   ✅ edge_ms / origin_ms (from Server-Timing + X-Timer)
 *   ✅ security_headers (9-point audit: HSTS, CSP, X-Frame, X-Content-Type,
 *       Referrer-Policy, Permissions-Policy, COOP, COEP, CORP)
 *   ✅ redirect_count (manual redirect following)
 *   ✅ age_s (zombie cache detection)
 *   ✅ http_version
 *   ✅ bypass probe (cache-busting second request)
 *   ✅ content_length
 *
 * Environment variables (set in Lambda Configuration):
 *   PROBE_SECRET  — shared secret for ingest API authentication
 *   REGION        — logical region name (sa-east, eu-west, us-east, ap-east, oc)
 *
 * Invocation (from Rust scheduler via HTTP POST to Function URL):
 *   Body: { monitor_id, url, ingest_url, run_bypass }
 *   Header: x-probe-secret: <secret>
 *
 * Zero dependencies — uses only Node.js built-in modules.
 */

import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';
import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';
import { detectCdnProviderFromHeaders } from './cdn-providers.mjs';

// ─── Timeout Budget ───────────────────────────────────────────────────────────
//
// Two separate clocks govern execution:
//
//   LAMBDA_TIMEOUT_MS  — AWS Lambda runtime limit (keep in sync with
//                        scripts/fix-lambda-timeout.ps1 and deploy-lambda.*).
//                        When this fires, the AWS runtime kills the process
//                        immediately; nothing more runs.
//
//   PROBE_DEADLINE_MS  — Our internal soft cut-off. All measurement phases
//                        (redirects + bypass + normal) must finish within this
//                        budget. Leaving the remaining ~8s for ingest + overhead
//                        ensures the Lambda can always send a classified error to
//                        the backend before the AWS runtime kills it.
//
// Flow:
//   0s ──────── PROBE_DEADLINE_MS = 27s ──────── LAMBDA_TIMEOUT_MS = 35s
//   [measure phases → deadline guard] → [ingest ≤ 6s] → [return]
//                                  ↑
//                         deadline exceeded here? emit timeout: error → ingest
//
// MIN_PHASE_MS  — Minimum remaining budget required to START a new phase.
//                 If the remaining time is less than this, the phase is skipped
//                 and a deadline error is recorded instead of silently omitting data.
//
// MAX_PROBE_MS  — Hard cap for a single measureUrl call (so one slow site
//                 cannot consume the entire deadline on its own).
//
// MAX_REDIRECT_MS — Cap per redirect hop (not total chain — total is gated by deadline).
//
// INGEST_TIMEOUT_MS — Budget for the POST back to CacheSnap (outside the deadline,
//                     uses the reserved window between PROBE_DEADLINE_MS and LAMBDA_TIMEOUT_MS).
//
// Detector classification (api/src/alerts/detector.rs) keys off the prefix:
//   - `timeout: ...`           → slow_timeout (measurement failure, NOT down)
//   - `timeout_redirect: ...`  → slow_timeout (pre-measurement redirect chain)
//   - `connection_reset: ...`  → transient (down only with corroboration)
//   - `socket_aborted: ...`    → transient (down only with corroboration)
const LAMBDA_TIMEOUT_MS  = 35000;  // AWS runtime. Keep in sync with deploy scripts.
const PROBE_DEADLINE_MS  = 27000;  // Internal measurement cut-off.
const MIN_PHASE_MS       =  2000;  // Skip a phase if remaining < this.
const MAX_PROBE_MS       = 20000;  // Per-request cap inside measureUrl.
const MAX_REDIRECT_MS    =  5000;  // Per-hop cap inside headRequest.
const INGEST_TIMEOUT_MS  =  6000;  // POST result back to CacheSnap.

// Defensive invariant: the internal deadline must leave room for the ingest
// POST + cold-start overhead. If someone bumps PROBE_DEADLINE_MS too close to
// LAMBDA_TIMEOUT_MS, surface the misconfiguration loudly on module load.
if (PROBE_DEADLINE_MS + INGEST_TIMEOUT_MS >= LAMBDA_TIMEOUT_MS) {
  throw new Error(
    `[probe] Misconfigured budget: PROBE_DEADLINE_MS (${PROBE_DEADLINE_MS}) + ` +
      `INGEST_TIMEOUT_MS (${INGEST_TIMEOUT_MS}) must be < LAMBDA_TIMEOUT_MS (${LAMBDA_TIMEOUT_MS})`,
  );
}

// ─── Deadline ────────────────────────────────────────────────────────────────
// Tracks wall-clock time from the start of the Lambda invocation and exposes
// helpers used by every measurement phase to compute their effective timeout.
// Exported for unit testing (see probes/lambda/deadline.test.mjs).

export class Deadline {
  constructor(limitMs) {
    this._start = performance.now();
    this._limitMs = limitMs;
  }

  elapsedMs() {
    return performance.now() - this._start;
  }

  /**
   * Remaining budget. Can go NEGATIVE once the deadline has been crossed —
   * callers should not use this for arithmetic; use `effectiveTimeoutMs`
   * (clamped ≥1) for socket timeouts and `exceeded()` for guards.
   */
  remainingMs() {
    return this._limitMs - this.elapsedMs();
  }

  /**
   * True when fewer than `minRequired` ms remain. With the default `0` this
   * means "the deadline has been crossed". With a positive value it means
   * "not enough budget to start a phase that needs at least minRequired ms".
   */
  exceeded(minRequired = 0) {
    return this.remainingMs() <= minRequired;
  }

  /**
   * Effective socket timeout for a single request: the lower of `maxMs` and
   * the remaining deadline. Always at least 1ms so the Node.js API accepts it.
   */
  effectiveTimeoutMs(maxMs) {
    return Math.min(maxMs, Math.max(1, this.remainingMs()));
  }
}

// ─── Lambda Handler ───────────────────────────────────────────────────────────

export const handler = async (event) => {
  // Support both API Gateway (event.body string) and Function URL (event as object)
  let body;
  if (typeof event.body === 'string') {
    body = JSON.parse(event.body);
  } else if (event.body && typeof event.body === 'object') {
    body = event.body;
  } else {
    body = event;
  }

  const { monitor_id, url, ingest_url, run_bypass, is_manual } = body;
  const probeSecret = process.env.PROBE_SECRET;
  const region = process.env.REGION || 'unknown';

  if (!monitor_id || !url || !ingest_url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'monitor_id, url and ingest_url are required' }),
    };
  }

  // One deadline per Lambda invocation. All measurement phases share it.
  // Ingest send lives OUTSIDE the deadline window (uses the reserved buffer).
  const deadline = new Deadline(PROBE_DEADLINE_MS);

  // Build the result object with ALL fields the Rust ingest API expects
  const result = {
    monitor_id,
    region,
    ttfb_ms: null,
    download_ms: null,
    total_ms: null,
    dns_ms: null,
    tls_ms: null,
    edge_ms: null,
    origin_ms: null,
    status_code: null,
    cache_status: null,
    served_by: null,
    server_timing: null,
    http_version: null,
    redirect_count: 0,
    content_length: null,
    error: null,
    bypass_ttfb_ms: null,
    bypass_total_ms: null,
    bypass_status_code: null,
    bypass_error: null,
    age_s: null,
    security_headers: null,
    server_timing_breakdown: null,
    is_manual: !!is_manual,
    bypass_served_by: null,
    bypass_server_timing: null,
    bypass_server_timing_breakdown: null,
    bypass_cache_status: null,
    bypass_age_s: null,
    cdn_provider: null,
  };

  try {
    // ── Phase 1: Redirect count ───────────────────────────────────────────────
    // countRedirects follows the redirect chain and records the hop count.
    // It consumes its per-hop budget from the shared deadline.
    if (!deadline.exceeded(MIN_PHASE_MS)) {
      const { redirectCount } = await countRedirects(url, deadline);
      result.redirect_count = redirectCount;
    } else {
      result.error = `timeout: Probe exceeded internal deadline (${PROBE_DEADLINE_MS / 1000}s) before redirect check`;
    }

    // ── Phase 2: Measurement ──────────────────────────────────────────────────
    if (result.error === null) {
      if (run_bypass) {
        // Step 2a: Bypass (origin) measurement
        if (!deadline.exceeded(MIN_PHASE_MS)) {
          console.log(`[probe] Step 1: Bypass-First check for ${url} (${deadline.remainingMs().toFixed(0)}ms remaining)`);
          const bypassUrl = appendBypassParam(url);
          const bypassMetrics = await measureUrl(bypassUrl, true, deadline);

          result.bypass_ttfb_ms = bypassMetrics.ttfb_ms;
          result.bypass_total_ms = bypassMetrics.total_ms;
          result.bypass_dns_ms = bypassMetrics.dns_ms;
          result.bypass_tcp_ms = bypassMetrics.tcp_ms;
          result.bypass_tls_ms = bypassMetrics.tls_ms;
          result.bypass_status_code = bypassMetrics.status_code;
          result.bypass_served_by = bypassMetrics.served_by;
          result.bypass_server_timing = bypassMetrics.server_timing;
          result.bypass_server_timing_breakdown = bypassMetrics.server_timing_breakdown;
          result.bypass_cache_status = bypassMetrics.cache_status;
          result.bypass_error = bypassMetrics.error;
          result.bypass_age_s = bypassMetrics.age_s;

          // Assinalar métricas base por padrão (Headers, Segurança, etc)
          Object.assign(result, bypassMetrics);

          const cacheStatus = bypassMetrics.cache_status || 'HIDDEN';
          const isConfirmedHit = cacheStatus === 'HIT';

          // Step 2b: Normal (edge) measurement — only if bypass didn't HIT or error,
          // and enough deadline budget remains to make the attempt worthwhile.
          if (!isConfirmedHit && !bypassMetrics.error) {
            if (!deadline.exceeded(MIN_PHASE_MS)) {
              console.log(`[probe] Step 2: Normal check (Bypass was ${cacheStatus}, ${deadline.remainingMs().toFixed(0)}ms remaining)`);
              const normalMetrics = await measureUrl(url, false, deadline);

              result.ttfb_ms = normalMetrics.ttfb_ms;
              result.download_ms = normalMetrics.download_ms;
              result.total_ms = normalMetrics.total_ms;
              result.dns_ms = normalMetrics.dns_ms;
              result.tcp_ms = normalMetrics.tcp_ms;
              result.tls_ms = normalMetrics.tls_ms;
              result.status_code = normalMetrics.status_code;
              result.cache_status = normalMetrics.cache_status;
              result.served_by = normalMetrics.served_by;
              result.cdn_provider = normalMetrics.cdn_provider;
            } else {
              // Deadline exhausted: record partial result, log for ops visibility.
              // The bypass data is still useful; the error explains the gap.
              console.warn(`[probe] Step 2 skipped — deadline reached (${deadline.elapsedMs().toFixed(0)}ms elapsed)`);
              result.error = `timeout: Probe exceeded internal deadline (${PROBE_DEADLINE_MS / 1000}s) before normal measurement`;
            }
          } else {
            console.log(`[probe] Step 2 Skipped: Bypass resulted in HIT or Error.`);
          }

        } else {
          result.error = `timeout: Probe exceeded internal deadline (${PROBE_DEADLINE_MS / 1000}s) before bypass measurement`;
        }

      } else {
        // MODO NATURAL: Única chamada orgânica
        if (!deadline.exceeded(MIN_PHASE_MS)) {
          console.log(`[probe] Normal check for ${url} (${deadline.remainingMs().toFixed(0)}ms remaining)`);
          const metrics = await measureUrl(url, false, deadline);
          Object.assign(result, metrics);
        } else {
          result.error = `timeout: Probe exceeded internal deadline (${PROBE_DEADLINE_MS / 1000}s) before measurement`;
        }
      }
    }

  } catch (err) {
    result.error = err.message;
  }

  // Safety net: if all phases completed but deadline was already gone, tag it.
  // This covers edge cases where a phase loop exits cleanly but just barely.
  if (result.error === null && deadline.exceeded(0)) {
    result.error = `timeout: Probe exceeded internal deadline (${PROBE_DEADLINE_MS / 1000}s)`;
  }

  // 4. Report to CacheSnap ingest API
  const reportData = {
    ...result,
    probe_version: "1.29"
  };
  await sendToIngest(ingest_url, reportData, probeSecret);

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, region }),
  };
};

// ─── Core: Measure URL with granular DNS/TCP/TLS/TTFB/Download ────────────────

async function measureUrl(targetUrl, isBypass = false, deadline = null) {
  return new Promise((resolve, reject) => {
    const timeoutMs = deadline
      ? deadline.effectiveTimeoutMs(MAX_PROBE_MS)
      : MAX_PROBE_MS;
    const urlObj = new URL(targetUrl);
    const isHttps = urlObj.protocol === 'https:';
    const transport = isHttps ? https : http;

    const timings = {
      start: performance.now(),
      dnsEnd: null,
      tcpEnd: null,
      tlsEnd: null,
      ttfbEnd: null,
      end: null,
      sslData: null,
    };

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };

    const nonce = Math.random().toString(36).substring(2, 15);

    // ── Header Strategy ──
    // For bypass probes (Manual Refresh / Alerts), we force the edge to miss.
    // For normal probes (Automatic Sync), we want to measure cache performance,
    // so we don't send Cache-Control: no-cache.
    if (isBypass) {
      requestHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      requestHeaders['Pragma'] = 'no-cache';
      requestHeaders['X-CacheSnap-Salt'] = nonce;
      requestHeaders['X-CacheSnap-Bypass'] = 'true';
    }

    requestHeaders['Connection'] = 'keep-alive';

    const probeUrl = new URL(targetUrl);
    // Only use query params for bypass probes to force edge misses.
    // For automatic sync, we keep the URL clean to measure real cache performance.
    if (isBypass) {
      probeUrl.searchParams.set('cs_v', '2.0.0');
      probeUrl.searchParams.set('cs_s', nonce);
      probeUrl.searchParams.set('__cachesnap_bypass', '1');
      probeUrl.searchParams.set('_t', Date.now().toString());
    }
    const finalUrl = probeUrl.toString();

    const finalHeaders = {
      ...requestHeaders,
    };

    // ── Probing Engine ──

    const req = transport.get(
      finalUrl,
      {
        headers: finalHeaders,
        timeout: timeoutMs,
        agent: false,
      },
      (res) => {
        timings.ttfbEnd = performance.now();

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));

        res.on('end', () => {
          timings.end = performance.now();

          if (res.socket) {
            res.socket.setKeepAlive(false);
            res.socket.unref();
            res.socket.destroy();
          }

          const h = res.headers;
          const bodyLength = chunks.reduce((acc, c) => acc + c.length, 0);

          // ── Cache Status Detection (same priority order as CF Worker) ──
          const cacheStatus = readCacheStatus(h);

          // ── Served-By / PoP Detection ──
          const isCloudflare =
            (h['server'] || '').toLowerCase().includes('cloudflare') ||
            h['cf-cache-status'] != null ||
            h['cf-ray'] != null;

          const isCloudfront =
            h['x-amz-cf-id'] != null ||
            h['x-amz-cf-pop'] != null ||
            (h['server'] || '').toLowerCase().includes('cloudfront');

          let servedBy = null;
          if (isCloudflare) {
            servedBy = h['cf-ray'] || h['x-amz-cf-pop'] || null;
          } else if (isCloudfront) {
            servedBy = h['x-amz-cf-pop'] || h['x-amz-cf-id'] || null;
          }

          if (!servedBy) {
            servedBy =
              h['x-vercel-id'] ||    // Vercel
              h['x-served-by'] ||    // Fastly / Varnish
              h['x-amz-cf-id'] ||    // CloudFront (generic ID if not already caught)
              h['x-azure-ref'] ||    // Azure
              h['x-edge-location'] || // General
              h['x-cache-info'] ||   // Fastly
              h['server'] ||         // Last resort
              null;
          }

          // ── Server-Timing parsing ──
          const serverTimingRaw = h['server-timing'] || null;
          const xTimer = h['x-timer'] || null;
          let edgeMs = null;
          let originMs = null;
          let breakdown = null;

          if (serverTimingRaw || xTimer) {
            const parsed = parseServerTiming(serverTimingRaw, xTimer);
            edgeMs = parsed.edge_ms;
            originMs = parsed.origin_ms;
            breakdown = parsed.breakdown;
          }

          if (!breakdown) breakdown = {};
          if (timings.tcpEnd != null) {
            const tcpStart = timings.dnsEnd != null ? timings.dnsEnd : timings.start;
            breakdown.tcp_ms = round(timings.tcpEnd - tcpStart);
          }

          // ── Age header (zombie cache detection) ──
          let ageS = null;
          if (h['age'] != null) {
            const parsed = parseInt(h['age'], 10);
            if (!isNaN(parsed)) ageS = parsed;
          }

          // ── HTTP version ──
          const httpVersion = `HTTP/${res.httpVersion}`;

          // ── Security Headers Audit (9-point) ──
          const securityHeaders = collectSecurityHeaders(h);
          if (timings.sslData) {
            securityHeaders.ssl = timings.sslData;
          }

          resolve({
            ttfb_ms: round(timings.ttfbEnd - timings.start),
            download_ms: round(timings.end - timings.ttfbEnd),
            total_ms: round(timings.end - timings.start),
            dns_ms: timings.dnsEnd != null ? round(timings.dnsEnd - timings.start) : null,
            tcp_ms: timings.tcpEnd != null ? round(timings.tcpEnd - (timings.dnsEnd || timings.start)) : null,
            tls_ms:
              timings.tlsEnd != null && timings.tcpEnd != null
                ? round(timings.tlsEnd - timings.tcpEnd)
                : null,
            status_code: res.statusCode,
            cache_status: cacheStatus,
            served_by: servedBy,
            server_timing: serverTimingRaw,
            http_version: httpVersion,
            content_length: parseInt(h['content-length'] || '0', 10) || bodyLength,
            edge_ms: edgeMs,
            origin_ms: originMs,
            age_s: ageS,
            security_headers: securityHeaders,
            server_timing_breakdown: breakdown,
            cdn_provider: detectCdnProviderFromHeaders(h, servedBy),
          });
        });

        res.on('error', reject);
      }
    );

    // ── Socket-level timing hooks ──
    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        timings.dnsEnd = performance.now();
      });
      socket.on('connect', () => {
        timings.tcpEnd = performance.now();
      });
      socket.on('secureConnect', () => {
        timings.tlsEnd = performance.now();
        const cert = socket.getPeerCertificate && socket.getPeerCertificate();
        if (cert && cert.valid_to) {
          const issuerO = cert.issuer?.O || null;
          const issuerCN = cert.issuer?.CN || null;
          timings.sslData = {
            valid_to: cert.valid_to,
            valid_from: cert.valid_from,
            days_remaining: Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000),
            issuer: issuerO || issuerCN,
            issuer_o: issuerO,
            issuer_cn: issuerCN,
            subject_cn: cert.subject?.CN || null,
            subject_o: cert.subject?.O || null,
            protocol: socket.getProtocol ? socket.getProtocol() : null,
            fingerprint256: cert.fingerprint256 || null,
            bits: typeof cert.bits === 'number' ? cert.bits : null,
          };
        }
      });
    });

    req.on('error', (err) => {
      reject(normalizeMeasurementError(err));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout: Request did not complete within ${(timeoutMs / 1000).toFixed(1)}s`));
    });
  });
}

// ─── Redirect Counter ─────────────────────────────────────────────────────────

async function countRedirects(url, deadline = null, maxRedirects = 10) {
  let current = url;
  let count = 0;

  while (count <= maxRedirects) {
    // Stop following if the deadline has been exhausted — partial counts are
    // still useful (they won't be 0), and the caller already guards.
    if (deadline && deadline.exceeded(MIN_PHASE_MS)) break;

    const { statusCode, location } = await headRequest(current, deadline);

    if (statusCode >= 300 && statusCode < 400 && location) {
      current = new URL(location, current).toString();
      count++;
      continue;
    }
    break;
  }

  return { redirectCount: count };
}

function headRequest(targetUrl, deadline = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const transport = urlObj.protocol === 'https:' ? https : http;
    const timeoutMs = deadline
      ? deadline.effectiveTimeoutMs(MAX_REDIRECT_MS)
      : MAX_REDIRECT_MS;

    const req = transport.get(
      targetUrl,
      {
        headers: { 'User-Agent': 'CacheSnap-Probe/2.0.0 (Lambda)' },
        timeout: timeoutMs,
      },
      (res) => {
        // Consume body to free up the socket
        res.resume();
        resolve({
          statusCode: res.statusCode,
          location: res.headers['location'] || null,
        });
      }
    );

    req.on('error', (err) => {
      reject(normalizeRedirectError(err));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(
        new Error(
          `timeout_redirect: Redirect chain did not complete within ${(timeoutMs / 1000).toFixed(1)}s`,
        ),
      );
    });
  });
}

// ─── Error Normalization ──────────────────────────────────────────────────────
// Tag low-level Node errors with a prefix the detector can classify on. The
// human-readable message stays after the colon for the UI/advisor copy.

function normalizeMeasurementError(err) {
  const tag = classifyNetworkError(err);
  if (!tag) return err;
  return new Error(`${tag}: ${err.message || err.code || tag}`);
}

function normalizeRedirectError(err) {
  const tag = classifyNetworkError(err);
  // Redirect chain failures share the slow-timeout/transient buckets but carry
  // the `_redirect` suffix so the detector and operators know the failure
  // occurred during the pre-measurement HEAD walk, not the main request.
  const finalTag = tag ? `${tag}_redirect` : 'redirect_error';
  return new Error(`${finalTag}: ${err.message || err.code || finalTag}`);
}

function classifyNetworkError(err) {
  const code = err && err.code ? String(err.code) : '';
  const message = err && err.message ? String(err.message) : '';
  if (code === 'ETIMEDOUT' || /ETIMEDOUT|ESOCKETTIMEDOUT/i.test(message)) {
    return 'timeout';
  }
  if (code === 'ECONNRESET' || /ECONNRESET/i.test(message)) {
    return 'connection_reset';
  }
  if (code === 'ABORT_ERR' || /aborted|socket hang up/i.test(message)) {
    return 'socket_aborted';
  }
  return null;
}

// ─── Cache Status Detection ───────────────────────────────────────────────────
// Same priority order as the CF Worker to ensure data consistency.

function readCacheStatus(headers) {
  const providers = [
    'x-vercel-cache',     // Vercel
    'cf-cache-status',    // Cloudflare
    'cache-status',       // RFC 9213 (Netlify, Fastly)
    'x-cache',            // CloudFront / Fastly / Akamai / Bunny
    'x-cache-status',     // Nginx / Wikipedia
    'x-goog-cache-status', // Google Cloud
    'x-ms-cache-status',  // Azure
    'x-proxy-cache',      // Nginx Proxy
    'x-ls-cache',         // LiteSpeed
    'x-sucuri-cache',     // Sucuri
    'x-gw-cache'          // GCore
  ];

  for (const header of providers) {
    const value = headers[header];
    if (value) {
      const upper = value.toUpperCase();

      // 1. Precise HIT detection (includes tiered/stale hits)
      if (upper.includes('HIT') || upper.includes('STALE') || upper.includes('REVALIDATED')) {
        return 'HIT';
      }

      // 2. Precise BYPASS/DYNAMIC detection (Intentional origin fetch)
      // Includes PASS (Varnish/Fastly), NO-CACHE (Azure), UNCALCULABLE (Akamai)
      if (
        upper.includes('BYPASS') ||
        upper.includes('DYNAMIC') ||
        upper.includes('PASS') ||
        upper.includes('NONE') ||
        upper.includes('NO-CACHE') ||
        upper.includes('UNCALCULABLE') ||
        upper.includes('LAMBDAGENERATED')
      ) {
        const providerName =
          header.includes('cf') ? 'Cloudflare' :
            header.includes('vercel') ? 'Vercel' :
              header.includes('goog') ? 'Google' :
                header.includes('ms-') ? 'Azure' : 'Edge';
        return `BYPASS:${providerName} ${upper}`;
      }

      // 3. Precise MISS detection (Failure to fetch from cache)
      if (upper.includes('MISS') || upper.includes('EXPIRED')) {
        return 'MISS';
      }

      // 4. Wikipedia/Custom PoP code detection (e.g. "CP5020 INT")
      if (upper.startsWith('CP') && (upper.includes('INT') || upper.includes(' ') || upper.length < 15)) {
        return 'MISS';
      }

      // 5. Default: return the first 64 characters for other custom headers
      return upper.slice(0, 64).trim();
    }
  }

  return null;
}

// ─── Server-Timing Parser ─────────────────────────────────────────────────────
// Exact port of workers/probe/src/server-timing.ts

function parseServerTiming(header, xTimer) {
  let edge_ms = null;
  let origin_ms = null;
  const breakdown = {};

  // 1. Parse official Server-Timing header
  if (header) {
    for (const entry of header.split(',')) {
      const parts = entry.trim().split(';');
      const name = parts[0].trim().toLowerCase();

      const durMatch = entry.match(/dur=([\d.]+)/i);
      if (durMatch) {
        const duration = Math.round(parseFloat(durMatch[1]) * 100) / 100;

        if (name) breakdown[name] = duration;

        const isEdge =
          name.includes('edge') ||
          name.includes('cdn') ||
          name.includes('cache') ||
          name.includes('hit') ||
          name.includes('cf');
        const isOrigin =
          name.includes('origin') ||
          name.includes('app') ||
          name.includes('server') ||
          name.includes('back') ||
          name.includes('miss') ||
          name.includes('host') ||
          name.includes('upstream');

        if (isEdge && edge_ms === null) edge_ms = duration;
        else if (isOrigin && origin_ms === null) origin_ms = duration;
      }
    }
  }

  // 2. Fastly X-Timer fallback (NY Times / GitHub format: S123.45,VS0,VE227)
  if (edge_ms === null && xTimer) {
    const veMatch = xTimer.match(/VE([\d.]+)/i);
    if (veMatch) {
      edge_ms = Math.round(parseFloat(veMatch[1]) * 100) / 100;
    }
  }

  return {
    edge_ms,
    origin_ms,
    breakdown: Object.keys(breakdown).length > 0 ? breakdown : null,
  };
}

// ─── Security Headers Audit (9-point) ─────────────────────────────────────────
// Exact port of the CF Worker's collectSecurityHeaders.

function collectSecurityHeaders(h) {
  const hsts = h['strict-transport-security'] || null;
  const csp = h['content-security-policy'] || null;
  const xFrameOptions = h['x-frame-options'] || null;
  const xContentType = h['x-content-type-options'] || null;
  const referrerPolicy = h['referrer-policy'] || null;
  const permissionsPolicy = h['permissions-policy'] || null;
  const coop = h['cross-origin-opener-policy'] || null;
  const coep = h['cross-origin-embedder-policy'] || null;
  const corp = h['cross-origin-resource-policy'] || null;

  let score = 0;
  if (hsts) score++;
  if (csp) score++;
  if (xFrameOptions) score++;
  if (xContentType) score++;
  if (referrerPolicy) score++;
  if (permissionsPolicy) score++;
  if (coop) score++;
  if (coep) score++;
  if (corp) score++;

  return {
    hsts,
    csp,
    x_frame_options: xFrameOptions,
    x_content_type: xContentType,
    referrer_policy: referrerPolicy,
    permissions_policy: permissionsPolicy,
    coop,
    coep,
    corp,
    score,
  };
}

// ─── Bypass Helper ────────────────────────────────────────────────────────────

function appendBypassParam(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('__cachesnap_bypass')) {
      parsed.searchParams.set('__cachesnap_bypass', '1');
    }
    return parsed.toString();
  } catch {
    if (url.includes('__cachesnap_bypass=')) return url;
    return url.includes('?') ? `${url}&__cachesnap_bypass=1` : `${url}?__cachesnap_bypass=1`;
  }
}

// ─── Send to CacheSnap Ingest API ───────────────────────────────────────────────

async function sendToIngest(ingestUrl, data, secret) {
  const payload = JSON.stringify(data);
  const urlObj = new URL(ingestUrl);
  const transport = urlObj.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = transport.request(
      ingestUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-probe-secret': secret || '',
        },
        timeout: INGEST_TIMEOUT_MS,
      },
      (res) => {
        res.resume(); // drain response
        if (res.statusCode >= 400) {
          console.error(`[probe] Ingest responded ${res.statusCode}`);
        }
        resolve();
      }
    );

    req.on('error', (err) => {
      console.error(`[probe] Ingest send error: ${err.message}`);
      resolve(); // Don't throw — we still want the Lambda to return 200
    });
    req.on('timeout', () => {
      req.destroy();
      console.error('[probe] Ingest request timed out');
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function round(ms) {
  return Math.round(ms * 100) / 100;
}
