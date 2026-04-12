import { parseServerTiming } from "./server-timing";

/**
 * HopLens Probe — Cloudflare Worker
 *
 * Dois modos de operação:
 *
 * 1. HTTP (disparado pelo Rust scheduler)
 *    POST /
 *    Headers: x-probe-secret: <PROBE_SECRET>
 *    Body: { monitor_id, url, ingest_url? }
 *    → Executa o probe e envia resultado para o ingest API
 *
 * 2. Scheduled (Cron Trigger do Cloudflare)
 *    → Busca monitors ativos na API e executa probes para cada um
 *    → CF distribui invocações de cron por múltiplos PoPs automaticamente
 *
 * Métricas coletadas (Phase 1 — CF Workers):
 *   ✅ TTFB, download_ms, total_ms
 *   ✅ cache_status (CF-Cache-Status, X-Vercel-Cache, X-Cache)
 *   ✅ served_by (CF-Ray, X-Served-By)
 *   ✅ server_timing (lido passivamente)
 *   ✅ status_code, http_version, redirect_count, content_length
 *   ❌ dns_ms, tls_ms → sempre null (requer Node.js probes no Fly.io, Phase 1 Mês 2-3)
 */

export interface Env {
  PROBE_SECRET: string;
  INGEST_URL: string;
  REGION: string;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProbeRequest {
  monitor_id: string;
  url: string;
  ingest_url?: string; // sobrescreve INGEST_URL da env se fornecido
  run_bypass?: boolean;
}

interface SecurityHeaders {
  hsts: string | null;           // Strict-Transport-Security
  csp: string | null;            // Content-Security-Policy
  x_frame_options: string | null; // X-Frame-Options
  x_content_type: string | null;  // X-Content-Type-Options
  referrer_policy: string | null; // Referrer-Policy
  permissions_policy: string | null;
  coop: string | null;
  coep: string | null;
  corp: string | null;
  score: number;                  // 0–9: number of headers present
}

interface ProbeResult {
  monitor_id: string;
  region: string;
  ttfb_ms: number | null;
  download_ms: number | null;
  total_ms: number | null;
  dns_ms: null;      // sempre null em CF Workers — não disponível na plataforma
  tls_ms: null;      // sempre null em CF Workers — não disponível na plataforma
  edge_ms: number | null;   // parseado do header Server-Timing
  origin_ms: number | null; // parseado do header Server-Timing
  status_code: number | null;
  cache_status: string | null;
  served_by: string | null;
  server_timing: string | null;
  http_version: string | null;
  redirect_count: number;
  content_length: number | null;
  error: string | null;
  bypass_ttfb_ms: number | null;
  bypass_total_ms: number | null;
  bypass_status_code: number | null;
  bypass_error: string | null;
  age_s: number | null;                             // Age response header (zombie cache detection)
  security_headers: SecurityHeaders | null;         // Security headers audit
  server_timing_breakdown: Record<string, number> | null; // Full parsed Server-Timing entries
}

// ─── Handler principal ────────────────────────────────────────────────────────

const handler = {
  // Modo HTTP: chamado pelo Rust scheduler
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Autenticação por secret compartilhado
    const secret = request.headers.get("x-probe-secret") ?? "";
    if (secret !== env.PROBE_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: ProbeRequest;
    try {
      body = await request.json() as ProbeRequest;
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!body.monitor_id || !body.url) {
      return new Response(JSON.stringify({ error: "monitor_id and url are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const region = resolveRegion(env, request);
    const ingestUrl = body.ingest_url ?? env.INGEST_URL;

    // Executar probe em background (não bloqueia a response)
    ctx.waitUntil(
      executeProbeAndIngest(body.monitor_id, body.url, region, ingestUrl, env.PROBE_SECRET, !!body.run_bypass)
    );

    return new Response(JSON.stringify({ ok: true, region }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  },

  // Modo Scheduled: cron trigger da Cloudflare
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Buscar monitors ativos na API de ingest
    // A API expõe GET /api/monitors/active que retorna { monitors: [...] }
    ctx.waitUntil(runScheduledProbes(env));
  },
};

export default handler;

// ─── Execução do probe ────────────────────────────────────────────────────────

async function executeProbeAndIngest(
  monitorId: string,
  targetUrl: string,
  region: string,
  ingestUrl: string,
  probeSecret: string,
  runBypass: boolean,
): Promise<void> {
  const result = await runProbe(monitorId, targetUrl, region, runBypass);
  await sendToIngest(result, ingestUrl, probeSecret);
}

async function runProbe(
  monitorId: string,
  targetUrl: string,
  region: string,
  runBypass: boolean,
): Promise<ProbeResult> {
  const base: ProbeResult = {
    monitor_id: monitorId,
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
    if (runBypass) {
      // MODO DIAGNÓSTICO: Bypass-First Sequence
      // 1. PRIMEIRO PASSO: Bypass Probe (Sempre começamos forçando a Origem)
      console.log(`[probe] Step 1: Bypass check for ${targetUrl}`);
      const bypassResult = await performDetailedFetch(targetUrl, true);
      
      // Registramos os dados do bypass (Origin) na base
      base.bypass_ttfb_ms = bypassResult.ttfb_ms;
      base.bypass_total_ms = bypassResult.total_ms;
      // Note: CF Workers fetch() does not expose DNS/TCP/TLS timings yet, but we map them if available.
      
      base.bypass_status_code = bypassResult.status_code;
      base.bypass_error = bypassResult.error;
      base.bypass_served_by = bypassResult.served_by;
      
      // Dados básicos e de segurança iniciais a partir da primeira resposta
      assignMetricsToBase(base, bypassResult);

      // 2. DECISAO REATIVA: Precisamos da segunda chamada?
      // Se o status for HIT, a CDN "travou" o cache mesmo com cabeçalhos de bypass.
      const isHit = base.cache_status === 'HIT';
      
      if (!isHit && !base.bypass_error) {
         console.log(`[probe] Step 2: Immediate Normal check (Bypass was ${base.cache_status})`);
         const normalResult = await performDetailedFetch(targetUrl, false);
         
         // Atualizamos as métricas de "Edge" (Cache) com os resultados da segunda chamada.
         base.ttfb_ms = normalResult.ttfb_ms;
         base.download_ms = normalResult.download_ms;
         base.total_ms = normalResult.total_ms;
         base.cache_status = normalResult.cache_status;
         base.status_code = normalResult.status_code;
      } else {
         // Se foi HIT ou erro no bypass, os tempos de Borda são os mesmos do bypass.
         base.ttfb_ms = bypassResult.ttfb_ms;
         base.download_ms = bypassResult.download_ms;
         base.total_ms = bypassResult.total_ms;
      }
    } else {
      // MODO NATURAL: Apenas uma chamada normal para refletir a experiência orgânica
      console.log(`[probe] Step 1: Normal natural check for ${targetUrl}`);
      const normalResult = await performDetailedFetch(targetUrl, false);
      
      assignMetricsToBase(base, normalResult);
      base.ttfb_ms = normalResult.ttfb_ms;
      base.download_ms = normalResult.download_ms;
      base.total_ms = normalResult.total_ms;
    }

  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
  }

  return base;
}

/** Helper to copy metrics from a single fetch to the base result object. */
function assignMetricsToBase(base: ProbeResult, result: FetchMetrics) {
  base.status_code = result.status_code;
  base.cache_status = result.cache_status;
  base.http_version = result.http_version;
  base.served_by = result.served_by;
  base.content_length = result.content_length;
  base.redirect_count = result.redirect_count;
  base.age_s = result.age_s;
  base.security_headers = result.security_headers;
  base.server_timing = result.server_timing;
  base.edge_ms = result.edge_ms;
  base.origin_ms = result.origin_ms;
  base.server_timing_breakdown = result.server_timing_breakdown;
}

interface FetchMetrics {
  ttfb_ms: number | null;
  download_ms: number | null;
  total_ms: number | null;
  status_code: number | null;
  content_length: number | null;
  cache_status: string | null;
  served_by: string | null;
  http_version: string | null;
  redirect_count: number;
  server_timing: string | null;
  edge_ms: number | null;
  origin_ms: number | null;
  server_timing_breakdown: Record<string, number> | null;
  age_s: number | null;
  security_headers: SecurityHeaders | null;
  error: string | null;
}

function appendBypassParam(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("__hoplens_bypass")) {
      parsed.searchParams.set("__hoplens_bypass", "1");
    }
    return parsed.toString();
  } catch {
    if (url.includes("__hoplens_bypass=")) return url;
    return url.includes("?") ? `${url}&__hoplens_bypass=1` : `${url}?__hoplens_bypass=1`;
  }
}

async function performDetailedFetch(targetUrl: string, useBypassHeaders: boolean): Promise<FetchMetrics> {
  const url = useBypassHeaders ? appendBypassParam(targetUrl) : targetUrl;
  const metrics: FetchMetrics = {
    ttfb_ms: null,
    download_ms: null,
    total_ms: null,
    status_code: null,
    content_length: null,
    cache_status: null,
    served_by: null,
    http_version: null,
    redirect_count: 0,
    server_timing: null,
    edge_ms: null,
    origin_ms: null,
    server_timing_breakdown: null,
    age_s: null,
    security_headers: null,
    error: null,
  };

  try {
    const { redirectCount } = await fetchWithRedirectCount(url);
    metrics.redirect_count = redirectCount;

    const start = performance.now();
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
    };

    if (useBypassHeaders) {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
      headers["Pragma"] = "no-cache";
      headers["Expires"] = "0";
    }

    const response = await fetch(url, { redirect: "follow", headers });
    const ttfbEnd = performance.now();
    const body = await response.arrayBuffer();
    const totalEnd = performance.now();

    metrics.ttfb_ms = round(ttfbEnd - start);
    metrics.download_ms = round(totalEnd - ttfbEnd);
    metrics.total_ms = round(totalEnd - start);
    metrics.status_code = response.status;
    metrics.content_length = body.byteLength;
    metrics.http_version = detectHttpVersion(response.headers);
    metrics.cache_status = readCacheStatus(response.headers);
    
    // Served-By detection
    const isCloudflare = response.headers.get("server")?.toLowerCase().includes("cloudflare") 
                      || response.headers.has("cf-cache-status")
                      || response.headers.has("cf-ray");

    if (isCloudflare) {
      metrics.served_by = response.headers.get("CF-Ray");
    } else {
      metrics.served_by = response.headers.get("X-Served-By") 
                       ?? response.headers.get("X-Vercel-Id") 
                       ?? response.headers.get("X-Amz-Cf-Id") 
                       ?? null;
    }

    metrics.server_timing = response.headers.get("Server-Timing") ?? response.headers.get("server-timing");
    const xTimer = response.headers.get("X-Timer") ?? response.headers.get("x-timer");
    if (metrics.server_timing || xTimer) {
      const timing = parseServerTiming(metrics.server_timing, xTimer);
      metrics.edge_ms = timing.edge_ms;
      metrics.origin_ms = timing.origin_ms;
      metrics.server_timing_breakdown = timing.breakdown;
    }

    const age = response.headers.get("Age");
    if (age) metrics.age_s = parseInt(age, 10) || null;
    metrics.security_headers = collectSecurityHeaders(response.headers);

  } catch (err) {
    metrics.error = err instanceof Error ? err.message : String(err);
  }

  return metrics;
}

// Faz fetch seguindo redirects manualmente para contar os hops
async function fetchWithRedirectCount(
  url: string,
  maxRedirects = 10,
): Promise<{ finalResponse: Response; redirectCount: number }> {
  let current = url;
  let count = 0;
  let lastResponse: Response | null = null;

  while (count <= maxRedirects) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "HopLens-Probe/1.0" },
    });

    lastResponse = response;

    // 3xx com Location → seguir redirect
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location) break;
      // Resolver URL relativa
      current = new URL(location, current).toString();
      count++;
      continue;
    }

    break;
  }

  // Se não houve nenhum redirect, fazer o fetch final normalmente
  const finalResponse = count === 0
    ? lastResponse!
    : await fetch(current, { redirect: "follow", headers: { "User-Agent": "HopLens-Probe/1.0" } });

  return { finalResponse, redirectCount: count };
}

// ─── Helpers de headers ───────────────────────────────────────────────────────

function readCacheStatus(headers: Headers): string | null {
  // Ordem importa: priorizamos headers específicos da aplicação/CDN original
  const providers = [
    "X-Vercel-Cache",    // Vercel
    "X-Cache",           // CloudFront / Fastly
    "X-Cache-Status",    // Nginx / Wikipedia
    "X-Served-By",       // Fastly / Others
    "Cache-Status",      // Netlify / General
    "CF-Cache-Status",   // Cloudflare (colocado por último pois costuma ser DYNAMIC em proxies)
  ];

  for (const header of providers) {
    const value = headers.get(header);
    // Se acharmos um HIT em qualquer lugar, retornamos ele imediatamente
    if (value) {
      const upper = value.toUpperCase();
      if (upper.includes('HIT')) return 'HIT';
      if (upper.includes('MISS')) return 'MISS';
      return upper;
    }
  }

  return null;
}

function detectHttpVersion(headers: Headers): string | null {
  // CF-Ray presente → quase certamente HTTP/2 ou HTTP/3
  if (headers.get("CF-Ray")) return "HTTP/2";

  // Alt-Svc com h3 → suporte a HTTP/3
  const altSvc = headers.get("Alt-Svc");
  if (altSvc?.includes("h3")) return "HTTP/3";

  return null;
}

function collectSecurityHeaders(headers: Headers): SecurityHeaders {
  const hsts = headers.get("Strict-Transport-Security");
  const csp = headers.get("Content-Security-Policy");
  const xFrameOptions = headers.get("X-Frame-Options");
  const xContentType = headers.get("X-Content-Type-Options");
  const referrerPolicy = headers.get("Referrer-Policy");
  const permissionsPolicy = headers.get("Permissions-Policy");
  const coop = headers.get("Cross-Origin-Opener-Policy");
  const coep = headers.get("Cross-Origin-Embedder-Policy");
  const corp = headers.get("Cross-Origin-Resource-Policy");

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

function resolveRegion(env: Env, request: Request): string {
  // Preferir o REGION do environment (sa-east, eu-west, etc.) — mantém consistência
  // com os REGION_LABELS do dashboard e com o scheduler Rust.
  if (env.REGION && env.REGION !== "auto") return env.REGION;
  // Fallback: colo IATA do CF (usado em dev local onde REGION="auto")
  const colo = (request as Request & { cf?: { colo?: string } }).cf?.colo;
  return colo ?? env.REGION ?? "unknown";
}

function round(ms: number): number {
  return Math.round(ms * 100) / 100;
}

// ─── Envio para o ingest API ──────────────────────────────────────────────────

async function sendToIngest(
  result: ProbeResult,
  ingestUrl: string,
  probeSecret: string,
): Promise<void> {
  try {
    const response = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-probe-secret": probeSecret,
      },
      body: JSON.stringify(result),
    });

    if (!response.ok) {
      console.error(`[probe] Ingest failed: ${response.status} ${await response.text()}`);
    }
  } catch (err) {
    console.error(`[probe] Failed to send to ingest: ${err}`);
  }
}

// ─── Modo scheduled (cron) ────────────────────────────────────────────────────

async function runScheduledProbes(env: Env): Promise<void> {
  // Buscar monitors ativos na API
  // GET /api/monitors/active → { monitors: [{ id, url }] }
  const apiBase = new URL(env.INGEST_URL).origin;

  let monitors: Array<{ id: string; url: string }> = [];

  try {
    const res = await fetch(`${apiBase}/api/monitors/active`, {
      headers: { "x-probe-secret": env.PROBE_SECRET },
    });
    if (!res.ok) {
      console.error(`[scheduled] Failed to fetch monitors: ${res.status}`);
      return;
    }
    const data = await res.json() as { monitors: Array<{ id: string; url: string }> };
    monitors = data.monitors ?? [];
  } catch (err) {
    console.error(`[scheduled] Error fetching monitors: ${err}`);
    return;
  }

  if (monitors.length === 0) return;

  const region = env.REGION === "auto" ? "cron" : env.REGION;

  // Executar probes em paralelo (com limite de concorrência)
  const CONCURRENCY = 10;
  for (let i = 0; i < monitors.length; i += CONCURRENCY) {
    const batch = monitors.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(monitor =>
        executeProbeAndIngest(monitor.id, monitor.url, region, env.INGEST_URL, env.PROBE_SECRET, false)
      )
    );
  }

  console.log(`[scheduled] Probed ${monitors.length} monitors from ${region}`);
}
