import { NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/tenants/activity')

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [activeTenants, inactiveTenants, inactiveTenantCount, monitorStats, topConsumers, openAlerts] =
    await Promise.all([
      // Active: users who received at least one probe in 24h
      sql<{ count: number }[]>`
        SELECT COUNT(DISTINCT m.user_id)::int AS count
        FROM probe_results pr
        JOIN monitors m ON m.id = pr.monitor_id
        WHERE pr.time > ${since24h}
      `,
      // Inactive: users with active monitors but zero probes in 24h
      sql<{ tenant_id: string; monitor_count: number }[]>`
        SELECT
          m.user_id                  AS tenant_id,
          COUNT(m.id)::int           AS monitor_count
        FROM monitors m
        WHERE m.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM probe_results pr
            WHERE pr.monitor_id = m.id
              AND pr.time > ${since24h}
          )
        GROUP BY m.user_id
        ORDER BY monitor_count DESC
        LIMIT 20
      `,
      // Total count of inactive tenants (separate from the 20-row sample above)
      sql<{ count: number }[]>`
        SELECT COUNT(DISTINCT m.user_id)::int AS count
        FROM monitors m
        WHERE m.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM probe_results pr
            WHERE pr.monitor_id = m.id
              AND pr.time > ${since24h}
          )
      `,
      // Total active monitors and orphaned monitors
      sql<{ active: number; orphaned: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE is_active = true)::int                     AS active,
          COUNT(*) FILTER (
            WHERE is_active = true
              AND NOT EXISTS (
                SELECT 1 FROM probe_results pr
                WHERE pr.monitor_id = monitors.id
                  AND pr.time > NOW() - INTERVAL '7 days'
              )
          )::int AS orphaned
        FROM monitors
      `,
      // Top consumers: no PII — user UUID + probe count only
      sql<{ tenant_id: string; probe_count: number }[]>`
        SELECT
          m.user_id         AS tenant_id,
          COUNT(*)::int     AS probe_count
        FROM probe_results pr
        JOIN monitors m ON m.id = pr.monitor_id
        WHERE pr.time > ${since24h}
        GROUP BY m.user_id
        ORDER BY probe_count DESC
        LIMIT 10
      `,
      // Monitors with alerts in last 24h
      sql<{ count: number }[]>`
        SELECT COUNT(DISTINCT monitor_id)::int AS count
        FROM alerts
        WHERE created_at > ${since24h}
      `,
    ])

  return NextResponse.json({
    data: {
      active_tenants_24h: activeTenants[0]?.count ?? 0,
      inactive_tenants_24h: inactiveTenantCount[0]?.count ?? 0,
      total_monitors_active: monitorStats[0]?.active ?? 0,
      monitors_orphaned_count: monitorStats[0]?.orphaned ?? 0,
      monitors_with_alerts_24h: openAlerts[0]?.count ?? 0,
      top_consumers: topConsumers,
      inactive_tenants: inactiveTenants,
    },
  })
}
