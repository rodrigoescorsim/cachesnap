type LogoProps = {
  className?: string
  /** Wordmark ligeiramente mais forte e tracking refinado — uso típico na header. */
  variant?: 'default' | 'header'
}

export function Logo({ className = 'h-10', variant = 'default' }: LogoProps) {
  const header = variant === 'header'
  return (
    <div className="flex items-center">
      <svg
        viewBox="0 0 420 118"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-auto ${className}`}
        fill="none"
      >
        <g transform="translate(62, 59)">
          <line
            x1="38.97"
            y1="-22.5"
            x2="-38.97"
            y2="22.5"
            stroke="#22FF88"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <polygon
            points="0,-45 38.97,-22.5 38.97,22.5 0,45 -38.97,22.5 -38.97,-22.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinejoin="miter"
            strokeMiterlimit="10"
            className="text-white"
          />
        </g>

        <text
          x="126"
          y="76"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
          fontSize={header ? '58' : '56'}
          fontWeight={header ? '600' : '500'}
          letterSpacing={header ? '-0.52' : '-0.6'}
          fill="currentColor"
          className="text-white"
        >
          cachesnap
        </text>
      </svg>
    </div>
  )
}
