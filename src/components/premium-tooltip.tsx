import React from 'react'

/** High-fidelity glassmorphism tooltip to replace native browser 'title' attributes. */
export function PremiumTooltip({ children, content, position = 'top-center', direction = 'top' }: { children: React.ReactNode, content: React.ReactNode, position?: 'top-center' | 'top-right' | 'top-left' | 'bottom-center' | 'bottom-right' | 'bottom-left', direction?: 'top' | 'bottom' }) {
  const isBottom = direction === 'bottom'
  
  const posClasses = {
    'top-center': 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    'top-right': 'bottom-full right-0 mb-2',
    'top-left': 'bottom-full left-0 mb-2',
    'bottom-center': 'top-full left-1/2 -translate-x-1/2 mt-2',
    'bottom-right': 'top-full right-0 mt-2',
    'bottom-left': 'top-full left-0 mt-2',
  }[position]

  return (
    <div className="relative group/tooltip inline-flex items-center">
      {children}
      {/* Fixed panel width: the trigger is only as wide as the badge (~72px). Without an explicit width, abspos shrink-to-fit uses that narrow containing block and long text wraps one word per line. */}
      <div
        className={`absolute ${posClasses} invisible z-[100] w-[min(320px,calc(100vw-2rem))] max-w-none opacity-0 transition-all duration-200 group-hover/tooltip:visible group-hover/tooltip:opacity-100 pointer-events-none ${isBottom ? '-translate-y-1 group-hover/tooltip:translate-y-0' : 'translate-y-1 group-hover/tooltip:translate-y-0'}`}
      >
        <div className="cs-tooltip-panel">
          {content}
        </div>
      </div>
    </div>
  )
}
