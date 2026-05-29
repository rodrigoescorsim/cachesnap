import type { ReactNode } from 'react'

export function formatCacheAgeShort(seconds: number): ReactNode {
  const unitStyle = 'text-[9px] opacity-70 ml-0.5 font-medium'
  if (seconds < 60) return <>{seconds}<span className={unitStyle}>s</span></>
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return <>{minutes}<span className={unitStyle}>m</span></>
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return <>{hours}<span className={unitStyle}>h</span></>
  const days = Math.floor(hours / 24)
  return <>{days}<span className={unitStyle}>d</span></>
}

function formatCacheAgeVerbose(seconds: number): string {
  const s = Math.floor(Math.max(0, seconds))
  let rem = s
  const days = Math.floor(rem / 86400)
  rem %= 86400
  const hours = Math.floor(rem / 3600)
  rem %= 3600
  const minutes = Math.floor(rem / 60)
  const secs = rem % 60
  const parts: string[] = []
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  if (secs || parts.length === 0) parts.push(`${secs} second${secs === 1 ? '' : 's'}`)
  return parts.join(', ')
}

export function cacheAgeColumnVisual(
  ageSeconds: number,
  alertEnabled: boolean,
  thresholdHours: number
): { className: string; tooltip: string } {
  const verbose = formatCacheAgeVerbose(ageSeconds)
  if (!alertEnabled) {
    return {
      className: 'cs-badge-live-age cs-badge-live-age-muted',
      tooltip: `Edge-reported cache age: ${verbose}.`,
    }
  }
  const limitSeconds = Math.max(1, Math.floor(thresholdHours)) * 3600
  const limitVerbose = formatCacheAgeVerbose(limitSeconds)
  const within = ageSeconds <= limitSeconds
  return {
    className: `cs-badge-live-age ${within ? 'cs-badge-live-age-success' : 'cs-badge-live-age-danger'}`,
    tooltip: within
      ? `${verbose}. Within the Cache Age Alert limit (${limitVerbose}).`
      : `${verbose}. Above the Cache Age Alert limit (${limitVerbose}).`,
  }
}
