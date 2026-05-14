'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export function CustomSelect({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: number
  options: { value: number; label: string }[]
  onChange: (val: number) => void
  /** When true, shows the current option but does not open or change selection. */
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeLabel = options.find(o => o.value === value)?.label || ''

  const updateCoords = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setCoords({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width
      })
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      updateCoords()
      window.addEventListener('scroll', updateCoords, true)
      window.addEventListener('resize', updateCoords)
    }
    return () => {
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
  }, [isOpen, updateCoords])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isInsideTrigger = containerRef.current?.contains(e.target as Node)
      const isInsideDropdown = dropdownRef.current?.contains(e.target as Node)
      if (!isInsideTrigger && !isInsideDropdown) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const dropdownContent = isOpen && !disabled && (
    <div 
      ref={dropdownRef}
      className="cs-select-dropdown"
      style={{
        top: coords.top,
        left: coords.left,
        width: coords.width,
        position: 'fixed',
        zIndex: 9999,
      }}
    >
      {options.map(opt => (
        <div
          key={opt.value}
          className={`cs-select-option ${opt.value === value ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onChange(opt.value)
            setIsOpen(false)
          }}
        >
          {opt.label}
        </div>
      ))}
    </div>
  )

  return (
    <div className={`relative ${disabled ? 'opacity-60' : ''}`} ref={containerRef}>
      <div
        className={`w-full h-11 cs-input flex items-center justify-between select-none ${
          disabled ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer'
        }`}
        onClick={() => {
          if (disabled) return
          setIsOpen(!isOpen)
        }}
        aria-disabled={disabled}
      >
        <span className={`font-semibold ${disabled ? 'text-zinc-400' : 'text-zinc-100'}`}>{activeLabel}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-300 ${
            disabled ? 'text-zinc-600' : 'text-zinc-500'
          } ${isOpen && !disabled ? 'rotate-180' : ''}`}
        />
      </div>
      {isOpen && typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  )
}
