'use client'

import { EdgeVsOrigin } from '@/app/dashboard/monitors/[id]/edge-vs-origin'

const REGION_LABELS: Record<string, string> = {
  'sao-paulo': 'São Paulo',
  mumbai: 'Mumbai',
  frankfurt: 'Frankfurt',
  ohio: 'Ohio',
  sydney: 'Sydney',
  tokyo: 'Tokyo',
  oregon: 'Oregon',
  'cape-town': 'Cape Town',
}

/** Valores alinhados ao preview de marketing — dados estáticos, sem API. */
const DEMO_REGIONS: Array<{
  region: string
  edge_ttfb: number
  origin_ttfb: number
  edge_hit_count: number
  origin_miss_count: number
}> = [
  { region: 'sao-paulo', edge_ttfb: 100, origin_ttfb: 5999, edge_hit_count: 32, origin_miss_count: 30 },
  { region: 'mumbai', edge_ttfb: 120, origin_ttfb: 3721, edge_hit_count: 30, origin_miss_count: 28 },
  { region: 'frankfurt', edge_ttfb: 70, origin_ttfb: 1450, edge_hit_count: 28, origin_miss_count: 27 },
  { region: 'ohio', edge_ttfb: 60, origin_ttfb: 859, edge_hit_count: 28, origin_miss_count: 26 },
  { region: 'sydney', edge_ttfb: 600, origin_ttfb: 4995, edge_hit_count: 26, origin_miss_count: 25 },
  { region: 'tokyo', edge_ttfb: 140, origin_ttfb: 1053, edge_hit_count: 28, origin_miss_count: 27 },
  { region: 'oregon', edge_ttfb: 150, origin_ttfb: 927, edge_hit_count: 27, origin_miss_count: 26 },
  { region: 'cape-town', edge_ttfb: 1100, origin_ttfb: 5188, edge_hit_count: 25, origin_miss_count: 24 },
]

function buildDemoBuckets() {
  const now = Date.now()
  const buckets = []
  for (let h = 0; h < 12; h++) {
    const hour = new Date(now - h * 3_600_000)
    for (const row of DEMO_REGIONS) {
      buckets.push({
        hour,
        region: row.region,
        edge_ttfb: row.edge_ttfb,
        origin_ttfb: row.origin_ttfb,
        edge_hit_count: row.edge_hit_count,
        origin_miss_count: row.origin_miss_count,
        sample_count: 39,
        edge_cache_status: 'HIT',
        origin_cache_status: 'MISS',
      })
    }
  }
  return buckets
}

const DEMO_DATA = buildDemoBuckets()

const DEMO_READINESS = {
  state: 'enabled' as const,
  reason: null,
  comparable_pairs: 96,
  comparable_regions: 8,
  edge_hit_ratio: 0.94,
  updated_at: new Date(),
}

export function LandingEdgeVsOriginDemo() {
  return (
    <div className="landing-showcase-live w-full max-w-[1042px]">
      <EdgeVsOrigin
        data={DEMO_DATA}
        regionLabels={REGION_LABELS}
        readiness={DEMO_READINESS}
        isDown={false}
      />
    </div>
  )
}
