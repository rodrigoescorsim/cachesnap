import { NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

type ServiceStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

interface ServiceEntry {
  name: string
  status: ServiceStatus
  latency_ms?: number
  last_seen?: string
  detail?: string
}

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/health/services')

  const services: ServiceEntry[] = []

  // PostgreSQL latency check
  try {
    const start = Date.now()
    await sql`SELECT 1`
    const latency = Date.now() - start
    services.push({
      name: 'PostgreSQL',
      status: latency < 100 ? 'healthy' : latency < 500 ? 'warning' : 'critical',
      latency_ms: latency,
    })
  } catch {
    services.push({ name: 'PostgreSQL', status: 'critical', detail: 'Connection failed' })
  }

  // Rust API health check
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  try {
    const start = Date.now()
    const res = await fetch(`${apiUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    })
    const latency = Date.now() - start
    services.push({
      name: 'Rust API',
      status: res.ok ? (latency < 500 ? 'healthy' : 'warning') : 'critical',
      latency_ms: latency,
      detail: res.ok ? undefined : `HTTP ${res.status}`,
    })
  } catch {
    services.push({ name: 'Rust API', status: 'critical', detail: 'Unreachable' })
  }

  // Redis: not accessible from Next.js without ioredis — delegated to Rust API
  services.push({
    name: 'Redis',
    status: 'unknown',
    detail: 'Check via Rust API /health',
  })

  // Worker health per region: last probe received
  const since30m = new Date(Date.now() - 30 * 60 * 1000)

  const [regions, regionProbes] = await Promise.all([
    sql<{ id: string; label: string }[]>`
      SELECT id, label FROM regions WHERE enabled = true ORDER BY id
    `,
    sql<{ region: string; last_seen: Date; count: number }[]>`
      SELECT region, MAX(time) AS last_seen, COUNT(*)::int AS count
      FROM probe_results
      WHERE time > ${since30m}
      GROUP BY region
    `,
  ])

  const regionMap = new Map(regionProbes.map(r => [r.region, r]))

  for (const region of regions) {
    const info = regionMap.get(region.id)
    if (!info) {
      services.push({
        name: `Worker ${region.id}`,
        status: 'critical',
        detail: 'No probes in last 30 min',
      })
    } else {
      const ageSec = Math.floor((Date.now() - new Date(info.last_seen).getTime()) / 1000)
      services.push({
        name: `Worker ${region.id}`,
        status: ageSec < 300 ? 'healthy' : ageSec < 900 ? 'warning' : 'critical',
        last_seen: new Date(info.last_seen).toISOString(),
        detail: `${info.count} probes/30m`,
      })
    }
  }

  return NextResponse.json({
    regions: regions.map(r => r.id),
    data: { services },
  })
}
