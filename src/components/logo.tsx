export function Logo({ className = 'h-10' }: { className?: string }) {
  return (
    <div className="flex items-center">
      <svg
        viewBox="0 0 370 120"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-auto ${className}`}
        fill="none"
      >
        <g transform="translate(65, 60)">
          <polygon
            points="0,-45 38.97,-22.5 38.97,22.5 0,45 -38.97,22.5 -38.97,-22.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinejoin="miter"
            strokeMiterlimit="10"
            className="text-white"
          />
          <line
            x1="38.97"
            y1="-22.5"
            x2="-38.97"
            y2="22.5"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="miter"
            className="text-white"
          />
        </g>

        <text
          x="125"
          y="75"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
          fontSize="49"
          fontWeight="500"
          letterSpacing="-0.6"
          fill="currentColor"
          className="text-white"
        >
          cachesnap
        </text>
      </svg>
    </div>
  )
}
