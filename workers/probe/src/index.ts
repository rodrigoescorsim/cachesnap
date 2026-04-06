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
}

interface ProbeResult {
  monitor_id: string;
  region: string;
  ttfb_ms: number | null;
  download_ms: number | null;
  total_ms: number | null;
  dns_ms: null;  // sempre null em CF Workers — não disponível na plataforma
  tls_ms: null;  // sempre null em CF Workers — não disponível na plataforma
  status_code: number | null;
  cache_status: string | null;
  served_by: string | null;
  server_timing: string | null;
  http_version: string | null;
  redirect_count: number;
  content_length: number | null;
  error: string | null;
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default {
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
      executeProbeAndIngest(body.monitor_id, body.url, region, ingestUrl, env.PROBE_SECRET)
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

// ─── Execução do probe ────────────────────────────────────────────────────────

async function executeProbeAndIngest(
  monitorId: string,
  targetUrl: string,
  region: string,
  ingestUrl: string,
  probeSecret: string,
): Promise<void> {
  const result = await runProbe(monitorId, targetUrl, region);
  await sendToIngest(result, ingestUrl, probeSecret);
}

async function runProbe(
  monitorId: string,
  targetUrl: string,
  region: string,
): Promise<ProbeResult> {
  const base: ProbeResult = {
    monitor_id: monitorId,
    region,
    ttfb_ms: null,
    download_ms: null,
    total_ms: null,
    dns_ms: null,
    tls_ms: null,
    status_code: null,
    cache_status: null,
    served_by: null,
    server_timing: null,
    http_version: null,
    redirect_count: 0,
    content_length: null,
    error: null,
  };

  try {
    // Seguir redirects manualmente para contar os hops
    const { finalResponse, redirectCount } = await fetchWithRedirectCount(targetUrl);
    base.redirect_count = redirectCount;

    // TTFB: tempo até receber os headers de resposta
    // O CF Worker mede com performance.now() antes e depois do await fetch()
    // O tempo de "await fetch()" em CF Workers = tempo até os headers chegarem = TTFB
    const fetchStart = performance.now();
    const response = await fetch(targetUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "HopLens-Probe/1.0 (+https://hoplens.io)",
        "Accept": "*/*",
      },
    });
    const ttfbEnd = performance.now();

    // Download: consumir o body e medir
    const bodyBytes = await response.arrayBuffer();
    const totalEnd = performance.now();

    base.ttfb_ms = round(ttfbEnd - fetchStart);
    base.download_ms = round(totalEnd - ttfbEnd);
    base.total_ms = round(totalEnd - fetchStart);
    base.status_code = response.status;
    base.content_length = bodyBytes.byteLength;

    // Detectar versão HTTP via headers de diagnóstico
    base.http_version = detectHttpVersion(response.headers);

    // Ler headers de diagnóstico de cache e edge
    base.cache_status = readCacheStatus(response.headers);
    base.served_by = response.headers.get("CF-Ray")
      ?? response.headers.get("X-Served-By")
      ?? null;
    base.server_timing = response.headers.get("Server-Timing");

    // Usar redirect count do rastreamento manual
    base.redirect_count = finalResponse.redirected ? redirectCount : 0;

  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
  }

  return base;
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
  // Cloudflare
  const cfCache = headers.get("CF-Cache-Status");
  if (cfCache) return cfCache;

  // Vercel
  const vercelCache = headers.get("X-Vercel-Cache");
  if (vercelCache) return vercelCache;

  // AWS CloudFront
  const xCache = headers.get("X-Cache");
  if (xCache) return xCache;

  // Fastly
  const xServedBy = headers.get("X-Served-By");
  if (xServedBy) return null; // apenas indica o nó, não o status de cache

  // Netlify
  const netlifyCache = headers.get("X-Nf-Request-Id");
  if (netlifyCache) return headers.get("Cache-Status") ?? null;

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

function resolveRegion(env: Env, request: Request): string {
  // Preferir o colo real reportado pelo CF (mais preciso que a var de env)
  const colo = (request as Request & { cf?: { colo?: string } }).cf?.colo;
  if (colo) return colo;
  // Fallback para a variável de ambiente do environment deployado
  return env.REGION ?? "unknown";
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
        executeProbeAndIngest(monitor.id, monitor.url, region, env.INGEST_URL, env.PROBE_SECRET)
      )
    );
  }

  console.log(`[scheduled] Probed ${monitors.length} monitors from ${region}`);
}
