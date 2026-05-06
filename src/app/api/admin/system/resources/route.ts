import { NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

/**
 * System resource metrics.
 *
 * In a managed/serverless environment (Vercel, Railway, etc.), most OS-level
 * metrics are not accessible from Node.js. This endpoint returns what is
 * deterministically available via Postgres system views, which serve as a
 * reliable proxy for host health in DB-bound architectures.
 *
 * Fields that cannot be retrieved are returned as null with a `source: 'N/A'`
 * annotation — the card renders "N/A" instead of being hidden (per plan rule).
 */
export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/system/resources')

  const [diskStats, cacheHitRatio, bgwriterStats] = await Promise.all([
    // Disk usage per tablespace (Postgres view — works in managed DBs)
    sql<{ tablespace: string; size_bytes: number; size_pretty: string }[]>`
      SELECT
        spcname                                           AS tablespace,
        pg_tablespace_size(oid)::float                    AS size_bytes,
        pg_size_pretty(pg_tablespace_size(oid))          AS size_pretty
      FROM pg_tablespace
      WHERE spcname NOT IN ('pg_global')
      ORDER BY size_bytes DESC
    `.catch(() => []),

    // Buffer cache hit ratio — key indicator of memory pressure
    sql<{ hit_ratio: number | null; blks_hit: number; blks_read: number }[]>`
      SELECT
        (CASE WHEN (blks_hit + blks_read) > 0
          THEN (blks_hit::float / (blks_hit + blks_read) * 100)
          ELSE NULL
        END)::float                                       AS hit_ratio,
        blks_hit::float                                   AS blks_hit,
        blks_read::float                                  AS blks_read
      FROM pg_stat_database
      WHERE datname = current_database()
    `,

    // Background writer stats — I/O pressure indicator
    sql<{
      buffers_clean: number
      buffers_checkpoint: number
      buffers_backend: number
      maxwritten_clean: number
    }[]>`
      SELECT
        buffers_clean,
        buffers_checkpoint,
        buffers_backend,
        maxwritten_clean
      FROM pg_stat_bgwriter
    `.catch(() => []),
  ])

  const cache = cacheHitRatio[0]
  const bgw = bgwriterStats[0]

  // Derive a status from the cache hit ratio
  const cacheHitStatus =
    cache?.hit_ratio === null || cache?.hit_ratio === undefined
      ? 'unknown'
      : cache.hit_ratio >= 95
      ? 'healthy'
      : cache.hit_ratio >= 80
      ? 'warning'
      : 'critical'

  return NextResponse.json({
    data: {
      // CPU, RAM, and network are not accessible from Next.js without an OS agent.
      // Marked as N/A with explanation per plan rule: "mark as N/A, never omit the card".
      cpu: {
        usage_pct: null,
        source: 'N/A — not accessible from Next.js (requires OS agent or cloud metrics API)',
      },
      memory: {
        usage_pct: null,
        // Buffer cache hit ratio is the best DB-level memory pressure proxy available
        db_cache_hit_ratio: cache?.hit_ratio ?? null,
        db_cache_status: cacheHitStatus,
        blks_hit: cache?.blks_hit ?? null,
        blks_read: cache?.blks_read ?? null,
        source: 'Postgres buffer cache ratio (db_cache_hit_ratio). OS RAM not accessible.',
      },
      disk: {
        tablespaces: diskStats,
        // Absolute free disk space not accessible without OS agent
        free_pct: null,
        source: 'Tablespace sizes via pg_tablespace_size(). OS free disk not accessible.',
      },
      io: {
        buffers_clean: bgw?.buffers_clean ?? null,
        buffers_checkpoint: bgw?.buffers_checkpoint ?? null,
        buffers_backend: bgw?.buffers_backend ?? null,
        maxwritten_clean: bgw?.maxwritten_clean ?? null,
        // maxwritten_clean > 0 means the BG writer is hitting its limit — I/O pressure signal
        pressure_signal: bgw ? bgw.maxwritten_clean > 0 : null,
        source: 'pg_stat_bgwriter. OS io_wait not accessible.',
      },
      network: {
        rx_bytes_per_sec: null,
        tx_bytes_per_sec: null,
        source: 'N/A — not accessible from Next.js.',
      },
    },
  })
}
