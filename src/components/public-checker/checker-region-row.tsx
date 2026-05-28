import type { CheckResult } from './types'

const CACHE_STATUS_CLASS: Record<string, string> = {
  HIT: 'cs-badge cs-badge-success',
  MISS: 'cs-badge cs-badge-muted',
  BYPASS: 'cs-badge cs-badge-warning',
  EXPIRED: 'cs-badge cs-badge-warning',
  STALE: 'cs-badge cs-badge-warning',
  UNKNOWN: 'cs-badge cs-badge-muted',
  ERROR: 'cs-badge cs-badge-danger',
}

function CacheStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-zinc-700">—</span>
  const cls = CACHE_STATUS_CLASS[status.toUpperCase()] ?? 'cs-badge cs-badge-muted'
  return <span className={cls}>{status}</span>
}

export function CheckerRegionRow({ result, loading }: { result: CheckResult | null; loading: boolean }) {
  if (loading && !result) {
    return (
      <tr className="border-b border-border/40">
        <td className="py-2.5 pl-4 pr-3">
          <div className="cs-skeleton h-3.5 w-20 rounded" />
        </td>
        <td className="py-2.5 px-3">
          <div className="cs-skeleton h-5 w-14 rounded-md" />
        </td>
        <td className="py-2.5 px-3">
          <div className="cs-skeleton h-3.5 w-16 rounded" />
        </td>
        <td className="py-2.5 px-3">
          <div className="cs-skeleton h-3.5 w-10 rounded" />
        </td>
        <td className="py-2.5 px-3">
          <div className="cs-skeleton h-3.5 w-8 rounded" />
        </td>
        <td className="py-2.5 px-3">
          <div className="cs-skeleton h-3.5 w-8 rounded" />
        </td>
        <td className="py-2.5 px-3">
          <div className="cs-skeleton h-3.5 w-8 rounded" />
        </td>
      </tr>
    )
  }

  if (!result) return null

  const hasError = !!result.error && !result.ttfb_ms

  return (
    <tr className="border-b border-border/40 transition-colors hover:bg-white/[0.02]">
      <td className="py-2.5 pl-4 pr-3 font-mono text-[11px] text-zinc-400">
        {result.region}
      </td>
      <td className="py-2.5 px-3">
        {hasError ? (
          <span className="cs-badge cs-badge-danger">Error</span>
        ) : (
          <CacheStatusBadge status={result.cache_status} />
        )}
      </td>
      <td className="py-2.5 px-3 text-[12px] text-zinc-300">
        {result.cdn_provider ?? <span className="text-zinc-600">Unknown</span>}
      </td>
      <td className="py-2.5 px-3 tabular-nums text-[12px]">
        {result.ttfb_ms !== null && result.ttfb_ms !== undefined ? (
          <span className={result.ttfb_ms < 200 ? 'text-emerald-400' : result.ttfb_ms < 600 ? 'text-amber-400' : 'text-rose-400'}>
            {result.ttfb_ms}
            <span className="text-zinc-600">ms</span>
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="py-2.5 px-3 tabular-nums text-[12px] text-zinc-400">
        {result.status_code ?? <span className="text-zinc-600">—</span>}
      </td>
      <td className="py-2.5 px-3 tabular-nums text-[12px] text-zinc-500">
        {result.age_s !== null && result.age_s !== undefined
          ? `${result.age_s}s`
          : <span className="text-zinc-600">—</span>}
      </td>
      <td className="py-2.5 px-3 tabular-nums text-[12px] text-zinc-500">
        {result.security_score !== null && result.security_score !== undefined
          ? (
            <span className={result.security_score >= 80 ? 'text-emerald-400' : result.security_score >= 50 ? 'text-amber-400' : 'text-rose-400'}>
              {result.security_score}
            </span>
          )
          : <span className="text-zinc-600">—</span>}
      </td>
    </tr>
  )
}
