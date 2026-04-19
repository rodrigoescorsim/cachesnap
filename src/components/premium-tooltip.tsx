'use client'

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type PremiumTooltipPosition =
  | 'top-center'
  | 'top-right'
  | 'top-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'

const TOOLTIP_WIDTH = 'min(320px, calc(100vw - 2rem))' as const
const GAP_PX = 8

function tooltipFixedStyle(trigger: DOMRect, position: PremiumTooltipPosition): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'fixed',
    zIndex: 99999,
    pointerEvents: 'none',
    width: TOOLTIP_WIDTH,
    maxWidth: 'calc(100vw - 2rem)',
  }

  switch (position) {
    case 'top-center':
      return {
        ...base,
        left: trigger.left + trigger.width / 2,
        top: trigger.top,
        transform: `translate(-50%, calc(-100% - ${GAP_PX}px))`,
      }
    case 'top-right':
      return {
        ...base,
        left: trigger.right,
        top: trigger.top,
        transform: `translate(-100%, calc(-100% - ${GAP_PX}px))`,
      }
    case 'top-left':
      return {
        ...base,
        left: trigger.left,
        top: trigger.top,
        transform: `translate(0, calc(-100% - ${GAP_PX}px))`,
      }
    case 'bottom-center':
      return {
        ...base,
        left: trigger.left + trigger.width / 2,
        top: trigger.bottom + GAP_PX,
        transform: 'translate(-50%, 0)',
      }
    case 'bottom-right':
      return {
        ...base,
        left: trigger.right,
        top: trigger.bottom + GAP_PX,
        transform: 'translate(-100%, 0)',
      }
    case 'bottom-left':
      return {
        ...base,
        left: trigger.left,
        top: trigger.bottom + GAP_PX,
        transform: 'translate(0, 0)',
      }
    default:
      return base
  }
}

/** High-fidelity tooltip; panel renders in a portal with `position: fixed` so it is not clipped by sticky table headers or overflow. */
export function PremiumTooltip({
  children,
  content,
  position = 'top-center',
  direction: _direction = 'top',
}: {
  children: React.ReactNode
  content: React.ReactNode
  position?: PremiumTooltipPosition
  direction?: 'top' | 'bottom'
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [fixedStyle, setFixedStyle] = useState<React.CSSProperties>({})

  const updatePosition = useCallback(() => {
    const el = hostRef.current
    if (!el) return
    setFixedStyle(tooltipFixedStyle(el.getBoundingClientRect(), position))
  }, [position])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  const onEnter = () => {
    const el = hostRef.current
    if (el) setFixedStyle(tooltipFixedStyle(el.getBoundingClientRect(), position))
    setOpen(true)
  }

  const onLeave = () => setOpen(false)

  const panel =
    open && typeof document !== 'undefined' ? (
      <div
        style={fixedStyle}
        className="opacity-100 transition-opacity duration-200 ease-out"
        aria-hidden
      >
        <div className="cs-tooltip-panel">{content}</div>
      </div>
    ) : null

  return (
    <div
      ref={hostRef}
      className="relative inline-flex items-center"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
      {panel ? createPortal(panel, document.body) : null}
    </div>
  )
}
