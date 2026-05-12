import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

// Static flag map — region IDs are stable, no need to store in DB
const FLAG_MAP: Record<string, string> = {
  'sa-east':  '🇧🇷',
  'eu-west':  '🇩🇪',
  'us-east':  '🇺🇸',
  'us-west':  '🇺🇸',
  'ap-east':  '🇯🇵',
  'ap-south': '🇮🇳',
  'oc':       '🇦🇺',
  'af-south': '🇿🇦',
}

export async function GET() {
  const user = await getSession()
  if (!user) return unauthorized()

  let rows: Array<Record<string, unknown>>
  try {
    rows = await sql`
    WITH
    -- Latest probe per (monitor, region) within the last 30 days.
    -- DISTINCT ON relies on idx_probe_results_monitor_region_time — fast.
    -- 30-day window covers paused monitors that haven't run recently.
    latest AS (
      SELECT DISTINCT ON (monitor_id, region)
        monitor_id,
        region,
        ttfb_ms,
        cache_status,
        status_code,
        time  AS probe_time,
        error
      FROM probe_results
      WHERE time > NOW() - INTERVAL '30 days'
      ORDER BY monitor_id, region, time DESC
    ),

    -- 24-hour aggregate per monitor (TTFB p50 + cache hit rate)
    h24 AS (
      SELECT
        monitor_id,
        ROUND(AVG(ttfb_ms) FILTER (WHERE ttfb_ms IS NOT NULL AND error IS NULL))::int  AS ttfb_avg_24h,
        ROUND(
          100.0
          * COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT') AND error IS NULL)
          / NULLIF(COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'MISS', 'STALE', 'REVALIDATED', 'UPDATING', 'EXPIRED', 'REVALIDATE', 'REFRESH_HIT', 'REFRESH_MISS') AND error IS NULL), 0),
          1
        )                                                                               AS cache_hit_avg_24h
        ,
        ROUND(
          100.0
          * COUNT(*) FILTER (WHERE error IS NULL AND status_code < 500)
          / NULLIF(COUNT(*), 0),
          1
        )                                                                               AS uptime_24h
      FROM probe_results
      WHERE time > NOW() - INTERVAL '24 hours'
      GROUP BY monitor_id
    ),

    -- 1-hour aggregate per monitor (TTFB + cache hit rate) for more stable Insights
    h1 AS (
      SELECT
        monitor_id,
        ROUND(AVG(ttfb_ms) FILTER (WHERE ttfb_ms IS NOT NULL AND error IS NULL))::int  AS ttfb_avg_1h,
        ROUND(
          100.0
          * COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT') AND error IS NULL)
          / NULLIF(COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'MISS', 'STALE', 'REVALIDATED', 'UPDATING', 'EXPIRED', 'REVALIDATE', 'REFRESH_HIT', 'REFRESH_MISS') AND error IS NULL), 0),
          1
        )                                                                               AS cache_hit_avg_1h
      FROM probe_results
      WHERE time > NOW() - INTERVAL '1 hour'
      GROUP BY monitor_id
    ),

    -- Current snapshot: latest probes aggregated across all regions
    curr AS (
      SELECT
        monitor_id,
        ROUND(AVG(ttfb_ms) FILTER (WHERE ttfb_ms IS NOT NULL AND error IS NULL))::int   AS ttfb_current,
        ROUND(
          100.0
          * COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT') AND error IS NULL)
          / NULLIF(COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'MISS', 'STALE', 'REVALIDATED', 'UPDATING', 'EXPIRED', 'REVALIDATE', 'REFRESH_HIT', 'REFRESH_MISS') AND error IS NULL), 0),
          1
        )                                                                                AS cache_hit_current,
        MODE() WITHIN GROUP (ORDER BY COALESCE(cache_status, 'NO HEADER')) FILTER (WHERE error IS NULL) AS dominant_cache_status,
        MAX(probe_time)                                                                  AS last_checked_at,
        COUNT(*)::int                                                                    AS total_region_count,
        COUNT(*) FILTER (WHERE error IS NOT NULL)::int                                   AS error_region_count,
        COUNT(*) FILTER (WHERE status_code >= 500 AND error IS NULL)::int                AS error_5xx_count,
        COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500 AND status_code NOT IN (401, 403, 404) AND error IS NULL)::int AS error_4xx_count,
        COUNT(*) FILTER (WHERE status_code IN (401, 403))::int                           AS waf_region_count
      FROM latest
      GROUP BY monitor_id
    ),

    -- Slow region count using each monitor's configured TTFB thresholds (HIT vs MISS)
    slow AS (
      SELECT
        l.monitor_id,
        COUNT(*) FILTER (
          WHERE l.ttfb_ms IS NOT NULL AND l.error IS NULL AND (
            CASE
              WHEN l.cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT')
                THEN l.ttfb_ms > m.alert_threshold_hit_ms
              ELSE l.ttfb_ms > m.alert_threshold_ms
            END
          )
        )::int AS slow_region_count
      FROM latest l
      JOIN monitors m ON m.id = l.monitor_id AND m.user_id = ${user.id}
      GROUP BY l.monitor_id
    ),

    -- Per-region detail array (label from regions table, flag added in app layer)
    reg AS (
      SELECT
        l.monitor_id,
        jsonb_agg(
          jsonb_build_object(
            'code',    l.region,
            'label',   COALESCE(r.label, l.region),
            'isSlow',  (l.error IS NULL AND l.ttfb_ms IS NOT NULL AND CASE
              WHEN l.cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT')
                THEN l.ttfb_ms > m.alert_threshold_hit_ms
              ELSE l.ttfb_ms > m.alert_threshold_ms
            END),
            'isError', (l.error IS NOT NULL)
          )
          ORDER BY l.region
        ) AS regions
      FROM latest l
      LEFT JOIN regions r ON r.id = l.region
      JOIN monitors m ON m.id = l.monitor_id AND m.user_id = ${user.id}
      GROUP BY l.monitor_id
    ),

    -- Open (unresolved) incidents per monitor
    inc AS (
      SELECT monitor_id, COUNT(*)::int AS active_incident_count
      FROM alert_incidents
      WHERE resolved_at IS NULL
      GROUP BY monitor_id
    ),

    -- Hourly TTFB sparkline over the last 24 hours (up to 24 points)
    spark AS (
      SELECT
        monitor_id,
        array_agg(pt ORDER BY bucket) AS sparkline
      FROM (
        SELECT
          monitor_id,
          time_bucket('1 hour', time)                                                        AS bucket,
          ROUND(AVG(ttfb_ms) FILTER (WHERE ttfb_ms IS NOT NULL AND error IS NULL))::int      AS pt
        FROM probe_results
        WHERE time > NOW() - INTERVAL '24 hours'
        GROUP BY monitor_id, time_bucket('1 hour', time)
        HAVING AVG(ttfb_ms) FILTER (WHERE ttfb_ms IS NOT NULL AND error IS NULL) IS NOT NULL
      ) t
      GROUP BY monitor_id
    )

    SELECT
      m.id,
      m.url,
      m.name                                                                                AS name,
      CASE WHEN m.is_active THEN 'active' ELSE 'paused' END                                 AS status,

      COALESCE(c.ttfb_current,      0)                                                      AS ttfb_current,
      COALESCE(h.ttfb_avg_24h,      0)                                                      AS ttfb_avg_24h,
      -- Positive = current is WORSE than 24h avg (inverted delta for TTFB — higher is bad)
      CASE
        WHEN h.ttfb_avg_24h > 0
          THEN ROUND(
            ((c.ttfb_current - h.ttfb_avg_24h)::float / h.ttfb_avg_24h * 100)::numeric, 1
          )
        ELSE 0
      END                                                                                    AS ttfb_delta,

      -- NULL = no recognisable cache-status header; 0 = header present but no HITs
      c.cache_hit_current                                                                    AS cache_hit_current,
      c.dominant_cache_status                                                                AS cache_status_current,
      h.cache_hit_avg_24h                                                                    AS cache_hit_avg_24h,
      COALESCE(h1.ttfb_avg_1h, c.ttfb_current, 0)                                            AS ttfb_avg_1h,
      COALESCE(h1.cache_hit_avg_1h, c.cache_hit_current)                                     AS cache_hit_avg_1h,
      h.uptime_24h                                                                            AS uptime_24h,
      -- Positive = current better than 24h avg (percentage-point diff); null if no data
      CASE
        WHEN c.cache_hit_current IS NOT NULL AND h.cache_hit_avg_24h IS NOT NULL
          THEN ROUND((c.cache_hit_current - h.cache_hit_avg_24h)::numeric, 1)
        ELSE NULL
      END                                                                                    AS cache_hit_delta,

      COALESCE(r.regions, '[]'::jsonb)                                                      AS regions,
      COALESCE(sl.slow_region_count,  0)                                                    AS slow_region_count,
      COALESCE(c.total_region_count, 0)                                                     AS total_region_count,
      COALESCE(c.error_region_count, 0)                                                     AS error_region_count,
      COALESCE(c.error_5xx_count,    0)                                                     AS error_5xx_count,
      COALESCE(c.error_4xx_count,    0)                                                     AS error_4xx_count,
      (COALESCE(c.waf_region_count, 0) >= 2 OR (COALESCE(c.total_region_count, 0) = 1 AND COALESCE(c.waf_region_count, 0) = 1)) AS is_waf_blocked,
      c.last_checked_at,
      COALESCE(s.sparkline, ARRAY[]::int[])                                                 AS sparkline,
      COALESCE(i.active_incident_count, 0)                                                   AS active_incident_count

    FROM monitors m
    LEFT JOIN curr  c  ON c.monitor_id  = m.id
    LEFT JOIN slow  sl ON sl.monitor_id = m.id
    LEFT JOIN h24   h  ON h.monitor_id  = m.id
    LEFT JOIN h1    h1 ON h1.monitor_id = m.id
    LEFT JOIN reg   r  ON r.monitor_id  = m.id
    LEFT JOIN spark s  ON s.monitor_id  = m.id
    LEFT JOIN inc   i  ON i.monitor_id  = m.id
    WHERE m.user_id = ${user.id}
    ORDER BY m.created_at DESC
  `
  } catch (err) {
    console.error('[GET /api/monitors/summary]', err)
    return NextResponse.json({ error: 'Failed to load monitors' }, { status: 500 })
  }

  // Attach emoji flags (stable mapping, no reason to persist in DB)
  const result = rows.map((row) => ({
    ...row,
    regions: (
      row.regions as Array<{ code: string; label: string; isSlow: boolean; isError: boolean }>
    ).map((r) => ({ ...r, flag: FLAG_MAP[r.code] ?? '🌐' })),
  }))

  return NextResponse.json(result)
}
