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
