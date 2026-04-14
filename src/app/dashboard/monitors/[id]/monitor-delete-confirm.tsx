'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function MonitorDeleteConfirm({
  monitorId,
  onCancel,
  className = '',
}: {
  monitorId: string
  onCancel: () => void
  className?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${monitorId}`, { method: 'DELETE' })
        if (res.ok) {
          router.push('/dashboard')
        } else {
          setError('Failed to delete monitor')
        }
      } catch {
        setError('Failed to delete monitor')
      }
    })
  }

  return (
    <div className={`rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 shadow-xl ${className}`}>
      <p className="text-sm font-bold text-red-400 mb-4 flex items-center gap-2">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M8 5v3M8 11h.01M1 14l7-12 7 12H1z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Permanent deletion
      </p>
      <p className="text-xs text-red-500/60 leading-relaxed mb-5 max-w-sm">
        This action cannot be undone. All probe history, diagnostic logs, and regional alerts for this monitor will be erased forever.
      </p>
      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-lg bg-red-500 px-5 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-all active:scale-[0.98]"
        >
          {isPending ? 'Deleting...' : 'Confirm delete'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-lg border border-border bg-transparent px-5 py-2 text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
