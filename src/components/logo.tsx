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
        viewBox="0 0 445 122"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-auto ${className}`}
        fill="none"
      >
        <g transform="translate(65, 61)">
          {/* Três ramificações partindo do centro (Cyan/Brand Primary) - Atualizado para stroke 4.5 */}
          <line x1="-38.97" y1="22.5" x2="0" y2="0" stroke="#22FF88" strokeWidth="4.5" strokeLinecap="round"/>
          <line x1="0" y1="0" x2="0" y2="-45" stroke="#22FF88" strokeWidth="4.5" strokeLinecap="round"/>
          <line x1="0" y1="0" x2="38.97" y2="22.5" stroke="#22FF88" strokeWidth="4.5" strokeLinecap="round"/>

          <polygon
            points="0,-45 38.97,-22.5 38.97,22.5 0,45 -38.97,22.5 -38.97,-22.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="6.0"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-white"
          />
        </g>

        <text
          x="132"
          y="78"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
          fontSize="64"
          fontWeight={header ? '400' : '300'}
          letterSpacing="0.8"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          paintOrder="stroke fill"
          fill="currentColor"
          className="text-white"
        >
          cache<tspan fill="#22FF88" stroke="#22FF88">snap</tspan>
        </text>
      </svg>
    </div>
  )
}
