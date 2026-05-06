import { NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/db/locks')

  const [longRunning, longLocks, idleInTransaction] = await Promise.all([
    // Long-running queries (>10s)
    sql<{
      pid: number
      duration_s: number
      state: string
      wait_event: string | null
      query_preview: string
    }[]>`
      SELECT
        pid,
        EXTRACT(EPOCH FROM (NOW() - query_start))::int    AS duration_s,
        state,
        wait_event,
        LEFT(query, 120)                                  AS query_preview
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND state NOT IN ('idle')
        AND query_start < NOW() - INTERVAL '10 seconds'
        AND pid <> pg_backend_pid()
      ORDER BY duration_s DESC
      LIMIT 20
    `,

    // Lock contention: locks being waited on
    sql<{
      pid: number
      blocking_pid: number
      relation: string
      lock_type: string
      duration_s: number
    }[]>`
      SELECT
        blocked.pid                                             AS pid,
        blocking.pid                                           AS blocking_pid,
        blocked_rel.relname                                    AS relation,
        blocked_locks.locktype                                 AS lock_type,
        EXTRACT(EPOCH FROM (NOW() - blocked_activity.query_start))::int AS duration_s
      FROM pg_catalog.pg_locks blocked_locks
      JOIN pg_catalog.pg_stat_activity blocked_activity
        ON blocked_activity.pid = blocked_locks.pid
      JOIN pg_catalog.pg_locks blocking_locks
        ON blocking_locks.locktype = blocked_locks.locktype
        AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
        AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
        AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
        AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
        AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
        AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
        AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
        AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
        AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
        AND blocking_locks.pid <> blocked_locks.pid
      JOIN pg_catalog.pg_stat_activity blocking
        ON blocking.pid = blocking_locks.pid
      LEFT JOIN pg_class blocked_rel
        ON blocked_rel.oid = blocked_locks.relation
      WHERE NOT blocked_locks.granted
      ORDER BY duration_s DESC
      LIMIT 10
    `,

    // Idle-in-transaction sessions (common source of lock buildup)
    sql<{ pid: number; duration_s: number; client_addr: string | null }[]>`
      SELECT
        pid,
        EXTRACT(EPOCH FROM (NOW() - state_change))::int   AS duration_s,
        client_addr::text
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND state = 'idle in transaction'
        AND state_change < NOW() - INTERVAL '30 seconds'
      ORDER BY duration_s DESC
      LIMIT 10
    `,
  ])

  const hasBlockedLocks = longLocks.length > 0
  const hasLongQueries = longRunning.length > 0
  const hasIdleInTransaction = idleInTransaction.length > 0

  const overallStatus =
    hasBlockedLocks ? 'critical'
    : hasIdleInTransaction ? 'warning'
    : hasLongQueries ? 'warning'
    : 'healthy'

  return NextResponse.json({
    data: {
      status: overallStatus,
      long_running_queries: longRunning,
      blocked_locks: longLocks,
      idle_in_transaction: idleInTransaction,
      summary: {
        long_running_count: longRunning.length,
        blocked_count: longLocks.length,
        idle_in_transaction_count: idleInTransaction.length,
      },
    },
  })
}
