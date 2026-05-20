type LogoProps = {
  className?: string
}

export function Logo({ className = 'h-10' }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      alt="CacheSnap"
      className={`w-auto ${className}`}
    />
  )
}
