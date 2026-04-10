/**
 * HopLens Lambda Probe — Phase 2
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

  const { monitor_id, url, ingest_url, run_bypass } = body;
  const probeSecret = process.env.PROBE_SECRET;
  const region = process.env.REGION || 'unknown';

  if (!monitor_id || !url || !ingest_url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'monitor_id, url and ingest_url are required' }),
    };
  }

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
  };

  try {
    // 1. Count redirects (manual follow)
    const { redirectCount } = await countRedirects(url);
    result.redirect_count = redirectCount;

    // 2. Main probe (Edge) — Always run first to check cache status
    const metrics = await measureUrl(url);
    Object.assign(result, metrics);

    // 3. Smart Bypass logic
    // We only need a second bypass request if the first one was a CACHE HIT.
    // If it was a MISS, we already hit the origin and have its latency.
    if (run_bypass) {
      if (metrics.cache_status === 'HIT') {
        try {
          // It was a HIT, so we need a direct origin comparison point
          const bypassUrl = appendBypassParam(url);
          const bypassMetrics = await measureUrl(bypassUrl, true);
          result.bypass_ttfb_ms = bypassMetrics.ttfb_ms;
          result.bypass_total_ms = bypassMetrics.total_ms;
          result.bypass_status_code = bypassMetrics.status_code;
        } catch (err) {
          result.bypass_error = err.message;
        }
      } else {
        // It was a MISS, BYPASS, or DYNAMIC. We already have the origin data.
        // We populate the bypass fields with the main metrics to ensure 1:1 reports are complete.
        result.bypass_ttfb_ms = metrics.ttfb_ms;
        result.bypass_total_ms = metrics.total_ms;
        result.bypass_status_code = metrics.status_code;
        // Mark as "Smart Bypass Reuse" for debugging if needed
        result.server_timing_breakdown = { ...result.server_timing_breakdown, _bypass_mode: 'reused_from_miss' };
      }
    }
    
  } catch (err) {
    result.error = err.message;
  }

  // 4. Report to HopLens ingest API
  await sendToIngest(ingest_url, result, probeSecret);

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, region }),
  };
};

// ─── Core: Measure URL with granular DNS/TCP/TLS/TTFB/Download ────────────────

async function measureUrl(targetUrl, isBypass = false) {
  return new Promise((resolve, reject) => {
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
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
    };

    // For bypass probes, add cache-busting headers
    if (isBypass) {
      requestHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      requestHeaders['Pragma'] = 'no-cache';
    }

    const req = transport.get(
      targetUrl,
      {
        headers: requestHeaders,
        timeout: 15000,
      },
      (res) => {
        timings.ttfbEnd = performance.now();

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));

        res.on('end', () => {
          timings.end = performance.now();

          const h = res.headers;
          const bodyLength = chunks.reduce((acc, c) => acc + c.length, 0);

          // ── Cache Status Detection (same priority order as CF Worker) ──
          const cacheStatus = readCacheStatus(h);

          // ── Served-By / PoP Detection ──
          // CF-Ray is only trustworthy if the TARGET is on Cloudflare.
          const isCloudflare =
            (h['server'] || '').toLowerCase().includes('cloudflare') ||
            h['cf-cache-status'] != null ||
            h['cf-ray'] != null;

          let servedBy = null;
          if (isCloudflare) {
            servedBy = h['cf-ray'] || null;
          }
          if (!servedBy) {
            servedBy =
              h['x-served-by'] ||    // Fastly / Varnish
              h['x-vercel-id'] ||    // Vercel
              h['x-amz-cf-id'] ||    // CloudFront
              h['x-azure-ref'] ||    // Azure CDN
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
          timings.sslData = {
            valid_to: cert.valid_to,
            valid_from: cert.valid_from,
            days_remaining: Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000),
            issuer: cert.issuer?.O || cert.issuer?.CN,
            protocol: socket.getProtocol ? socket.getProtocol() : null,
          };
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout (15s)'));
    });
  });
}

// ─── Redirect Counter ─────────────────────────────────────────────────────────

async function countRedirects(url, maxRedirects = 10) {
  let current = url;
  let count = 0;

  while (count <= maxRedirects) {
    const { statusCode, location } = await headRequest(current);

    if (statusCode >= 300 && statusCode < 400 && location) {
      current = new URL(location, current).toString();
      count++;
      continue;
    }
    break;
  }

  return { redirectCount: count };
}

function headRequest(targetUrl) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const transport = urlObj.protocol === 'https:' ? https : http;

    const req = transport.get(
      targetUrl,
      {
        headers: { 'User-Agent': 'HopLens-Probe/2.0 (Lambda)' },
        timeout: 10000,
        // We need manual control to count redirects
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

    // Prevent auto-follow for redirect counting
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Redirect check timeout'));
    });
  });
}

// ─── Cache Status Detection ───────────────────────────────────────────────────
// Same priority order as the CF Worker to ensure data consistency.

function readCacheStatus(headers) {
  const providers = [
    'x-vercel-cache',     // Vercel
    'x-cache',            // CloudFront / Fastly
    'x-cache-status',     // Nginx / Wikipedia
    'cache-status',       // Netlify / General
    'cf-cache-status',    // Cloudflare (last — often DYNAMIC on proxied requests)
  ];

  for (const header of providers) {
    const value = headers[header];
    if (value) {
      const upper = value.toUpperCase();
      if (upper.includes('HIT')) return 'HIT';
      if (upper.includes('MISS')) return 'MISS';
      return upper;
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
    if (!parsed.searchParams.has('__hoplens_bypass')) {
      parsed.searchParams.set('__hoplens_bypass', '1');
    }
    return parsed.toString();
  } catch {
    if (url.includes('__hoplens_bypass=')) return url;
    return url.includes('?') ? `${url}&__hoplens_bypass=1` : `${url}?__hoplens_bypass=1`;
  }
}

// ─── Send to HopLens Ingest API ───────────────────────────────────────────────

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
        timeout: 10000,
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
