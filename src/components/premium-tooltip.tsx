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
const GAP_PX = 24

function tooltipFixedStyle(
  trigger: DOMRect,
  position: PremiumTooltipPosition,
  interactive: boolean,
  /** `hug` sizes the panel to content (capped at 320px); `wide` keeps the standard full strip width. */
  panelSizing: 'wide' | 'hug',
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'fixed',
    zIndex: 99999,
    pointerEvents: interactive ? 'auto' : 'none',
    maxWidth: 'calc(100vw - 2rem)',
    ...(panelSizing === 'hug'
      ? {
          width: 'max-content',
          maxWidth: 'min(320px, calc(100vw - 2rem))',
        }
      : {
          width: TOOLTIP_WIDTH,
        }),
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
  /** When true, panel accepts clicks (e.g. links) and stays open while the cursor is over the panel. */
  interactive = false,
  panelSizing = 'hug',
  className,
  style,
}: {
  children: React.ReactNode
  content: React.ReactNode
  position?: PremiumTooltipPosition
  direction?: 'top' | 'bottom'
  interactive?: boolean
  panelSizing?: 'wide' | 'hug'
  className?: string
  style?: React.CSSProperties
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [fixedStyle, setFixedStyle] = useState<React.CSSProperties>({})

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => setOpen(false), interactive ? 120 : 0)
  }, [clearCloseTimer, interactive])

  const updatePosition = useCallback(() => {
    const el = hostRef.current
    if (!el) return
    setFixedStyle(tooltipFixedStyle(el.getBoundingClientRect(), position, interactive, panelSizing))
  }, [position, interactive, panelSizing])

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

  useLayoutEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  const onEnterHost = () => {
    clearCloseTimer()
    const el = hostRef.current
    if (el) setFixedStyle(tooltipFixedStyle(el.getBoundingClientRect(), position, interactive, panelSizing))
    setOpen(true)
  }

  const onLeaveHost = () => {
    if (!interactive) {
      setOpen(false)
      return
    }
    scheduleClose()
  }

  const onEnterPanel = () => {
    if (!interactive) return
    clearCloseTimer()
  }

  const onLeavePanel = () => {
    if (!interactive) return
    scheduleClose()
  }

  const panel =
    open && typeof document !== 'undefined' ? (
      <div
        data-premium-tooltip-panel
        style={fixedStyle}
        className="opacity-100 transition-opacity duration-200 ease-out"
        aria-hidden={interactive ? undefined : true}
        onMouseEnter={interactive ? onEnterPanel : undefined}
        onMouseLeave={interactive ? onLeavePanel : undefined}
      >
        <div
          className={
            panelSizing === 'hug' ? 'cs-tooltip-panel cs-tooltip-panel--hug' : 'cs-tooltip-panel'
          }
        >
          {content}
        </div>
      </div>
    ) : null

  return (
    <div
      ref={hostRef}
      className={`relative inline-flex items-center ${className || ''}`}
      style={style}
      onMouseEnter={onEnterHost}
      onMouseLeave={onLeaveHost}
    >
      {children}
      {panel ? createPortal(panel, document.body) : null}
    </div>
  )
}
