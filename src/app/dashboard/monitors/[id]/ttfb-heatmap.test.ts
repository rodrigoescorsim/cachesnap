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
})

// ── heatmapTtfbColor ──────────────────────────────────────────────────────────
const FAST_HEX = '#22FF88'

describe('heatmapTtfbColor', () => {
  it('returns surface-muted for null', () => {
    expect(heatmapTtfbColor(null, 500)).toBe('#1F2A3A')
  })

  it('returns pure green for elite values relative to site average', () => {
    // siteAvg 100ms, ttfb 50ms -> Elite
    expect(heatmapTtfbColor(50, 100)).toBe(FAST_HEX)
  })

  it('provides resolution for fast values even in elite sites', () => {
    const v1 = heatmapTtfbColor(80, 100)
    const v2 = heatmapTtfbColor(180, 100)
    expect(v1).not.toBe(v2)
  })

  it('anchors colors in absolute tiers (800ms in slow site is not green)', () => {
    const color = heatmapTtfbColor(800, 1200)
    expect(color).not.toBe(FAST_HEX)
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    expect(r).toBeGreaterThan(g)
  })
})

// ── heatmapCacheColor ─────────────────────────────────────────────────────────

describe('heatmapCacheColor', () => {
  it('returns surface-muted for null', () => {
    expect(heatmapCacheColor(null)).toBe('#1F2A3A')
  })

  it('returns a red-ish color for 0% (worst)', () => {
    const color = heatmapCacheColor(0)
    const r = parseInt(color.slice(1, 3), 16)
    const b = parseInt(color.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
  })

  it('returns a green-ish color for 100% (best)', () => {
    const color = heatmapCacheColor(100)
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    expect(g).toBeGreaterThan(r)
  })
})

// ── buildHeatmapGrid ──────────────────────────────────────────────────────────

describe('buildHeatmapGrid', () => {
  it('returns array of dimensions [7][24]', () => {
    const grid = buildHeatmapGrid([])
    expect(grid.length).toBe(7)
    expect(grid[0].length).toBe(24)
  })

  it('places a cell at the correct [dow][hour] index', () => {
    const cell = makeCell(3, 15, 400)
    const grid = buildHeatmapGrid([cell])
    expect(grid[3][15]).toEqual(cell)
  })
})
