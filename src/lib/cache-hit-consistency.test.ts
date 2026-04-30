import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CACHE_HIT_STATUSES, IS_HIT_SQL, isCacheHit } from './cache-utils'

const CANONICAL_HIT_STATUSES = [
  'HIT',
  'STALE',
  'REVALIDATED',
  'UPDATING',
  'REVALIDATE',
  'REFRESH_HIT',
] as const

function readProjectFile(relativePath: string): string {
  const absolutePath = path.resolve(process.cwd(), relativePath)
  return fs.readFileSync(absolutePath, 'utf8')
}

describe('cache-hit canonical statuses', () => {
  it('keeps exactly the 6 canonical hit statuses', () => {
    expect(CACHE_HIT_STATUSES).toEqual(CANONICAL_HIT_STATUSES)
  })

  it('keeps SQL fragment aligned with the canonical statuses', () => {
    for (const status of CANONICAL_HIT_STATUSES) {
      expect(IS_HIT_SQL).toContain(`'${status}'`)
    }
  })

  it('classifies every canonical status as hit', () => {
    for (const status of CANONICAL_HIT_STATUSES) {
      expect(isCacheHit(status)).toBe(true)
    }
  })
})

describe('cache-hit consistency in critical SQL files', () => {
  const criticalSqlFiles = [
    'src/app/dashboard/monitors/[id]/page.tsx',
    'src/app/api/monitors/[id]/stats/route.ts',
    'src/app/api/monitors/summary/route.ts',
    'api/src/scheduler/readiness.rs',
    'api/src/baseline/calculator.rs',
    'migrations/020_cache_hits_hourly_aggregate.sql',
    'migrations/022_probe_results_hourly.sql',
  ]

  for (const file of criticalSqlFiles) {
    it(`includes all 6 statuses in ${file}`, () => {
      const content = readProjectFile(file)
      for (const status of CANONICAL_HIT_STATUSES) {
        expect(content).toContain(`'${status}'`)
      }
    })
  }
})

