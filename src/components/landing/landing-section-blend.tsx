type LandingSectionBlendProps = {
  from: string
  to: string
}

/** Thin full-bleed strip centered on the boundary between two landing sections. */
export function LandingSectionBlend({ from, to }: LandingSectionBlendProps) {
  return (
    <div
      aria-hidden
      className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 h-18 sm:h-22 shrink-0"
      style={{ background: `linear-gradient(180deg, ${from} 0%, ${to} 100%)` }}
    />
  )
}
