import { NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/db/summary')

  const [
    connStats,
    queryLatency,
    dbSize,
    dbSizeGrowth,
    tableStats,
  ] = await Promise.all([
    // Connection pool stats from pg_stat_activity
    sql<{
      total_connections: number
      active_connections: number
      idle_connections: number
      waiting_connections: number
      max_connections: number
    }[]>`
      SELECT
        COUNT(*)::int                                                            AS total_connections,
        COUNT(*) FILTER (WHERE state = 'active')::int                           AS active_connections,
        COUNT(*) FILTER (WHERE state = 'idle')::int                             AS idle_connections,
        COUNT(*) FILTER (WHERE wait_event_type IS NOT NULL AND state = 'active')::int AS waiting_connections,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections')   AS max_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `,

    // Query latency: p95 across recent slow queries tracked in pg_stat_statements
    // Falls back to a simple SELECT 1 round-trip if pg_stat_statements is unavailable
    sql<{ p95_ms: number | null; p50_ms: number | null; query_count: number }[]>`
      SELECT
        PERCENTILE_DISC(0.95) WITHIN GROUP (
          ORDER BY mean_exec_time
        )                                                                        AS p95_ms,
        PERCENTILE_DISC(0.50) WITHIN GROUP (
          ORDER BY mean_exec_time
        )                                                                        AS p50_ms,
        COUNT(*)::int                                                            AS query_count
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND calls > 5
    `.catch(() =>
      // pg_stat_statements not enabled — return null gracefully
      [{ p95_ms: null, p50_ms: null, query_count: 0 }]
    ),

    // Current DB size
    sql<{ size_bytes: number; size_pretty: string }[]>`
      SELECT
        pg_database_size(current_database())       AS size_bytes,
        pg_size_pretty(pg_database_size(current_database())) AS size_pretty
    `,

    // Growth over last 24h using TimescaleDB chunk sizes (approximate)
    sql<{ recent_chunks_bytes: number | null }[]>`
      SELECT
        COALESCE(SUM(total_bytes), 0) AS recent_chunks_bytes
      FROM timescaledb_information.chunks c
      JOIN timescaledb_information.hypertables h
        ON c.hypertable_name = h.hypertable_name
      WHERE c.range_start >= NOW() - INTERVAL '24 hours'
    `.catch(() => [{ recent_chunks_bytes: null }]),

    // Top tables by size (operational insight)
    sql<{ table_name: string; total_size: string; row_estimate: number }[]>`
      SELECT
        relname                                                                 AS table_name,
        pg_size_pretty(pg_total_relation_size(oid))                            AS total_size,
        reltuples::bigint                                                       AS row_estimate
      FROM pg_class
      WHERE relkind = 'r'
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY pg_total_relation_size(oid) DESC
      LIMIT 8
    `,
  ])

  const conn = connStats[0]
  const latency = queryLatency[0]
  const size = dbSize[0]
  const growth = dbSizeGrowth[0]

  const poolUsagePct =
    conn && conn.max_connections > 0
      ? Math.round((conn.total_connections / conn.max_connections) * 1000) / 10
      : null

  // Estimate days to capacity based on 24h growth rate (linear projection)
  const growthBytes24h = growth?.recent_chunks_bytes ?? null
  const sizeLimitBytes = 10 * 1024 * 1024 * 1024 // 10 GB default limit assumption
  const estimatedDaysToCapacity =
    growthBytes24h && growthBytes24h > 0 && size
      ? Math.round((sizeLimitBytes - size.size_bytes) / growthBytes24h)
      : null

  return NextResponse.json({
    data: {
      connections: {
        total: conn?.total_connections ?? 0,
        active: conn?.active_connections ?? 0,
        idle: conn?.idle_connections ?? 0,
        waiting: conn?.waiting_connections ?? 0,
        max: conn?.max_connections ?? 0,
        pool_usage_pct: poolUsagePct,
        status:
          poolUsagePct === null
            ? 'unknown'
            : poolUsagePct < 70
            ? 'healthy'
            : poolUsagePct < 90
            ? 'warning'
            : 'critical',
      },
      query_latency: {
        p50_ms: latency?.p50_ms !== null ? Math.round(Number(latency?.p50_ms)) : null,
        p95_ms: latency?.p95_ms !== null ? Math.round(Number(latency?.p95_ms)) : null,
        tracked_queries: latency?.query_count ?? 0,
        available: (latency?.query_count ?? 0) > 0,
      },
      size: {
        bytes: size?.size_bytes ?? null,
        pretty: size?.size_pretty ?? 'N/A',
        growth_bytes_24h: growth?.recent_chunks_bytes ?? null,
        estimated_days_to_capacity: estimatedDaysToCapacity,
      },
      top_tables: tableStats,
    },
  })
}
