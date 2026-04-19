import { Suspense } from 'react'
import { MonitorsStageOne } from '@/components/monitors/monitors-stage-one'

// MonitorsStageOne uses useSearchParams, which requires a Suspense boundary
// so the route can prerender everything above the boundary while the search
// params are resolved client-side.
export default function MonitorsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-zinc-600">
          <span className="h-2 w-2 animate-ping rounded-full bg-emerald-500/60" />
          <span className="text-[12px] font-semibold uppercase tracking-widest">Loading…</span>
        </div>
      </div>
    }>
      <MonitorsStageOne />
    </Suspense>
  )
}
