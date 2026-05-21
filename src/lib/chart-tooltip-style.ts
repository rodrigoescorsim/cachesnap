import type { CSSProperties } from 'react'

/** Positions chart hover tooltips in viewport space so cs-panel overflow-hidden does not clip them. */
export function chartTooltipStyle(clientX: number, clientY: number): CSSProperties {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080
  const flipX = clientX > vw * 0.6
  const flipY = clientY > vh * 0.65
  return {
    position: 'fixed',
    left: clientX,
    top: clientY,
    transform: `translate(${flipX ? 'calc(-100% - 16px)' : '16px'}, ${flipY ? 'calc(-100% - 16px)' : '16px'})`,
  }
}

/**
 * Trends charts: horizontal offset follows cursor (% of viewport) so the tooltip
 * drifts smoothly across the chart instead of flipping sides at a threshold.
 */
export function trendsChartTooltipStyle(clientX: number, clientY: number): CSSProperties {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080
  const pctX = (clientX / vw) * 100
  const sideOffset = clientX > vw * 0.5 ? '-24px' : '24px'
  const flipY = clientY > vh * 0.5
  return {
    position: 'fixed',
    left: clientX,
    top: clientY,
    transform: `translate(calc(-${pctX}% + ${sideOffset}), ${flipY ? 'calc(-100% - 24px)' : '24px'})`,
  }
}
