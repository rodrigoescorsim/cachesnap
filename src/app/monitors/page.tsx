import { Suspense } from 'react'
import { MonitorsStageOne } from '@/components/monitors/monitors-stage-one'

// MonitorsStageOne uses useSearchParams, which requires a Suspense boundary
// so the route can prerender everything above the boundary while the search
// params are resolved client-side.
export default function MonitorsPage() {
  return (
    <Suspense>
      <MonitorsStageOne />
    </Suspense>
  )
}
