'use client'

import React from 'react'

interface VisualGlowProps {
  children: React.ReactNode
  value: unknown
  className?: string
}

/**
 * VisualGlow wraps a metric and triggers a subtle background animation 
 * whenever its value changes, signaling a real-time update to the user.
 */
export function VisualGlow({ children, value, className = "" }: VisualGlowProps) {
  const glowKey = `glow-${String(value)}`

  return (
    <span
      key={glowKey}
      className={`${className} animate-flash-highlight rounded-sm px-1 -mx-1`}
    >
      {children}
    </span>
  )
}
