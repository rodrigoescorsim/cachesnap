import sql from './db'

export interface RegionMeta {
  id: string
  label: string
  description: string
  color: string
}

export async function getRegions(): Promise<RegionMeta[]> {
  return sql<RegionMeta[]>`
    SELECT id, label, description, color
    FROM regions
    WHERE enabled = true
    ORDER BY id
  `
}
