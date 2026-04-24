import { describe, it, expect } from 'vitest'
import {
  dowLabel,
  interpolateColor,
  heatmapTtfbColor,
  heatmapCacheColor,
  buildHeatmapGrid,
  type HeatmapCell,
} from './ttfb-heatmap.helpers'

function makeCell(dow: number, hour: number, ttfb: number | null = 200, cache: number | null = 80): HeatmapCell {
  return { dow, hour_of_day: hour, ttfb_avg: ttfb, cache_hit_pct: cache, sample_count: 10 }
}

// ── dowLabel ─────────────────────────────────────────────────────────────────

describe('dowLabel', () => {
  it('returns "Sun" for 0', () => {
    expect(dowLabel(0)).toBe('Sun')
  })

  it('returns "Sat" for 6', () => {
    expect(dowLabel(6)).toBe('Sat')
  })

  it('returns "?" for values outside 0–6', () => {
    expect(dowLabel(7)).toBe('?')
    expect(dowLabel(-1)).toBe('?')
  })
})

// ── interpolateColor ──────────────────────────────────────────────────────────

describe('interpolateColor', () => {
  it('returns "from" when t=0', () => {
    expect(interpolateColor(0, '#000000', '#ffffff')).toBe('#000000')
  })

  it('returns "to" when t=1', () => {
    expect(interpolateColor(1, '#000000', '#ffffff')).toBe('#ffffff')
  })

  it('returns an intermediate color for t=0.5', () => {
    const mid = interpolateColor(0.5, '#000000', '#ffffff')
    expect(mid).toMatch(/^#[0-9a-f]{6}$/)
    expect(mid).not.toBe('#000000')
    expect(mid).not.toBe('#ffffff')
  })

  it('clamps t<0 to return from color', () => {
    expect(interpolateColor(-1, '#aabbcc', '#112233')).toBe('#aabbcc')
  })

  it('clamps t>1 to return to color', () => {
    expect(interpolateColor(2, '#aabbcc', '#112233')).toBe('#112233')
  })
})

// ── heatmapTtfbColor ──────────────────────────────────────────────────────────

describe('heatmapTtfbColor', () => {
  it('returns surface-muted for null', () => {
    expect(heatmapTtfbColor(null, 500)).toBe('#1F2A3A')
  })

  it('returns a color close to fast when ttfb=0', () => {
    const color = heatmapTtfbColor(0, 1000)
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    // Should be very close to FAST_HEX #22FF88 — green-ish
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    expect(g).toBeGreaterThan(r)
  })

  it('returns a color close to slow when ttfb >= maxTtfb', () => {
    const color = heatmapTtfbColor(1000, 1000)
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    // Should be close to SLOW_HEX #f43f5e — red-ish
    const r = parseInt(color.slice(1, 3), 16)
    const b = parseInt(color.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
  })

  it('clamps: ttfb > maxTtfb gives same result as ttfb = maxTtfb', () => {
    expect(heatmapTtfbColor(2000, 1000)).toBe(heatmapTtfbColor(1000, 1000))
  })
})

// ── heatmapCacheColor ─────────────────────────────────────────────────────────

describe('heatmapCacheColor', () => {
  it('returns surface-muted for null', () => {
    expect(heatmapCacheColor(null)).toBe('#1F2A3A')
  })

  it('returns a red-ish color for 0% (worst)', () => {
    const color = heatmapCacheColor(0)
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    const r = parseInt(color.slice(1, 3), 16)
    const b = parseInt(color.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
  })

  it('returns a green-ish color for 100% (best)', () => {
    const color = heatmapCacheColor(100)
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    expect(g).toBeGreaterThan(r)
  })

  it('clamps values > 100 to 100', () => {
    expect(heatmapCacheColor(150)).toBe(heatmapCacheColor(100))
  })
})

// ── buildHeatmapGrid ──────────────────────────────────────────────────────────

describe('buildHeatmapGrid', () => {
  it('returns array of dimensions [7][24]', () => {
    const grid = buildHeatmapGrid([])
    expect(grid.length).toBe(7)
    expect(grid[0].length).toBe(24)
  })

  it('fills null in cells without data', () => {
    const grid = buildHeatmapGrid([makeCell(1, 10)])
    expect(grid[0][0]).toBeNull()
    expect(grid[1][9]).toBeNull()
    expect(grid[1][11]).toBeNull()
  })

  it('places a cell at the correct [dow][hour] index', () => {
    const cell = makeCell(3, 15, 400)
    const grid = buildHeatmapGrid([cell])
    expect(grid[3][15]).toEqual(cell)
  })

  it('does not overwrite on duplicate — first occurrence wins', () => {
    const first  = makeCell(2, 8, 200)
    const second = makeCell(2, 8, 500)
    const grid = buildHeatmapGrid([first, second])
    expect(grid[2][8]).toEqual(first)
  })
})
