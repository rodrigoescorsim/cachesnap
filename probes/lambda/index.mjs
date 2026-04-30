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
    // 1. Count redirects (manual follow)
    const { redirectCount } = await countRedirects(url);
    result.redirect_count = redirectCount;

    // 2. Probing Logic (Bypass-First Sequence)
    if (run_bypass) {
      console.log(`[probe] Step 1: Bypass-First check for ${url}`);
      const bypassUrl = appendBypassParam(url);
      const bypassMetrics = await measureUrl(bypassUrl, true);
      
      // Store Origin Measurements (Auditoria)
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

      // Assinalar métricas base por padrão (Headers, Seguranças, etc)
      Object.assign(result, bypassMetrics);

      const cacheStatus = bypassMetrics.cache_status || 'HIDDEN';
      const isConfirmedHit = cacheStatus === 'HIT';

      // Reativo: se o provedor respeitou o bypass (não foi HIT cacheado) e não teve erro, medimos a Borda
      if (!isConfirmedHit && !bypassMetrics.error) {
         console.log(`[probe] Step 2: Immediate Normal check (Bypass was ${cacheStatus})`);
         const normalMetrics = await measureUrl(url, false);
         
         // Atualiza as métricas Naturais (Edge) refletindo o tempo real do usuário
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
         console.log(`[probe] Step 2 Skipped: Bypass resulted in HIT or Error. Falling back single measurement.`);
      }

    } else {
      // MODO NATURAL: Única chamada orgânica
      console.log(`[probe] Normal natural check for ${url}`);
      const metrics = await measureUrl(url, false);
      Object.assign(result, metrics);
    }
    
  } catch (err) {
    result.error = err.message;
  }

  // 4. Report to CacheSnap ingest API
  const reportData = {
    ...result,
    probe_version: "1.24"
  };
  await sendToIngest(ingest_url, reportData, probeSecret);

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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
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

    // Use randomized Browser UAs to avoid fingerprinting
    const browserUAs = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
    ];
    const selectedUA = browserUAs[Math.floor(Math.random() * browserUAs.length)];

    const finalHeaders = {
      ...requestHeaders,
      'User-Agent': selectedUA,
    };

    // Only add identifying headers if explicitly in bypass/debug mode
    if (isBypass) {
      finalHeaders['X-CacheSnap-Nonce'] = nonce;
    }

    const req = transport.get(
      finalUrl,
      {
        headers: finalHeaders,
        timeout: 10000,
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
        headers: { 'User-Agent': 'CacheSnap-Probe/2.0.0 (Lambda)' },
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

      // 5. Default: return the first 15 characters for other custom headers
      return upper.slice(0, 15).trim();
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
