import sql from './db'

export interface RegionMeta {
  id: string
  label: string
  description: string
  color: string
}

/**
 * Returns the list of active regions.
 *
 * Source-of-truth priority (per admin_observability_page_plan.md):
 *  1. PROBE_REGIONS env var — comma-separated list of region IDs (e.g. "us-east-1,eu-west-1")
 *     This is the canonical source for infrastructure deployment decisions.
 *     Adding a region here + restarting the API makes it visible across the entire stack
 *     without any code change.
 *  2. `regions` DB table — richer metadata (label, color, description). Rows whose `id`
 *     is NOT in PROBE_REGIONS are considered legacy and excluded from active sets.
 *
 * When PROBE_REGIONS is set, only regions whose `id` appears in the env var are returned
 * as active. Regions in the DB but NOT in PROBE_REGIONS are silently omitted (they may
 * appear as `legacy` in UI components that explicitly query for them).
 */
export async function getRegions(): Promise<RegionMeta[]> {
  const envRegions = parseProbeRegions()

  if (envRegions.length > 0) {
    // Fetch DB metadata only for IDs declared in PROBE_REGIONS
    const rows = await sql<RegionMeta[]>`
      SELECT id, label, description, color
      FROM regions
      WHERE enabled = true
        AND id = ANY(${envRegions}::text[])
      ORDER BY id
    `

    // Include any PROBE_REGIONS IDs that have no DB row yet
    // (fresh region added to env before a DB seed is done)
    const dbIds = new Set(rows.map((r) => r.id))
    const missing: RegionMeta[] = envRegions
      .filter((id) => !dbIds.has(id))
      .map((id) => ({ id, label: id, description: '', color: '#6b7280' }))

    return [...rows, ...missing].sort((a, b) => a.id.localeCompare(b.id))
  }

  // Fallback: no PROBE_REGIONS env var — trust the DB table directly
  return sql<RegionMeta[]>`
    SELECT id, label, description, color
    FROM regions
    WHERE enabled = true
    ORDER BY id
  `
}

/**
 * Returns region IDs from the PROBE_REGIONS environment variable.
 * Returns an empty array when the variable is not set or empty.
 */
export function parseProbeRegions(): string[] {
  const raw = process.env.PROBE_REGIONS
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
