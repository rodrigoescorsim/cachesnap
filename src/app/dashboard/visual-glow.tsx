'use client'

import React, { useEffect, useState, useRef } from 'react'

interface VisualGlowProps {
  children: React.ReactNode
  value: any
  className?: string
}

/**
 * VisualGlow wraps a metric and triggers a subtle background animation 
 * whenever its value changes, signaling a real-time update to the user.
 */
export function VisualGlow({ children, value, className = "" }: VisualGlowProps) {
  const [animationKey, setAnimationKey] = useState(0)
  const prevValue = useRef(value)

  useEffect(() => {
    // Only trigger if values are different and it's not the initial mount
    if (prevValue.current !== value && prevValue.current !== undefined) {
      setAnimationKey(prev => prev + 1)
    }
    prevValue.current = value
  }, [value])

  return (
    <span 
      key={animationKey === 0 ? 'initial' : animationKey}
      className={`${className} ${animationKey > 0 ? 'animate-flash-highlight rounded-sm px-1 -mx-1' : ''}`}
    >
      {children}
    </span>
  )
}
