import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CACHE_HIT_STATUSES, IS_HIT_SQL, isCacheHit, PG_CACHE_CDN_CLASSIFIABLE_FILTER, PG_CACHE_CDN_HIT_FILTER } from './cache-utils'

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

describe('CDN-classifiable SQL predicates', () => {
  it('keeps denominator list aligned with Timescale probe_results_hourly cdn_count', () => {
    expect(PG_CACHE_CDN_CLASSIFIABLE_FILTER).toContain("'REFRESH_MISS'")
    expect(PG_CACHE_CDN_CLASSIFIABLE_FILTER).toContain("'MISS'")
    expect(PG_CACHE_CDN_HIT_FILTER).not.toContain("'MISS'")
  })
})

describe('cache-hit consistency in critical SQL files', () => {
  // Files that *must* route through the centralized helpers in `cache-utils.ts`
  // (or its Rust counterpart `api/src/cache_status.rs`). The literal lists of
  // statuses are intentionally not duplicated here anymore — see the helper.
  const tsHelperConsumers = [
    'src/app/api/monitors/[id]/stats/route.ts',
    'src/app/api/monitors/summary/route.ts',
    'src/app/dashboard/monitors/[id]/page.tsx',
  ]

  it('summary route uses pgTtfbExceedsRowLimitSql for slow regions', () => {
    const content = readProjectFile('src/app/api/monitors/summary/route.ts')
    expect(content).toContain('pgTtfbExceedsRowLimitSql')
  })

  for (const file of tsHelperConsumers) {
    it(`${file} routes cache-hit SQL through cache-utils helpers`, () => {
      const content = readProjectFile(file)
      expect(
        content.includes('pgCacheHitPctSqlExpr') ||
          content.includes('PG_CACHE_CDN_HIT_FILTER'),
      ).toBe(true)
    })
  }

  const rustHelperConsumers = [
    'api/src/scheduler/readiness.rs',
    'api/src/baseline/calculator.rs',
  ]

  for (const file of rustHelperConsumers) {
    it(`${file} routes cache-hit SQL through cache_status module`, () => {
      const content = readProjectFile(file)
      expect(content).toContain('crate::cache_status::CACHE_HIT_FILTER')
      expect(content).toContain('crate::cache_status::CACHE_CDN_CLASSIFIABLE_FILTER')
    })
  }

  it('Rust cache_status module mirrors the TS canonical statuses', () => {
    const content = readProjectFile('api/src/cache_status.rs')
    for (const status of CANONICAL_HIT_STATUSES) {
      expect(content).toContain(`'${status}'`)
    }
    expect(content).toContain("'MISS'")
    expect(content).toContain("'REFRESH_MISS'")
  })
})

