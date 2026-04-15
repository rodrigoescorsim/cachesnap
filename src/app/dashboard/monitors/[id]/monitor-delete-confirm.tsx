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
    <div className={`rounded-xl border border-red-500/20 bg-red-600/10 p-6 shadow-2xl backdrop-blur-md ${className}`}>
      <div className="flex items-center gap-2.5 text-red-500 mb-2">
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M8 5v3M8 11h.01M1 14l7-12 7 12H1z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h3 className="text-sm font-black uppercase tracking-tighter">
          Immediate Deletion
        </h3>
      </div>
      
      <p className="text-xs text-red-500/70 leading-relaxed mb-6">
        All probe history, diagnostic logs, and regional alerts for this monitor will be erased instantly. This action is irreversible.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-2">
          <p className="text-[10px] font-bold text-red-400">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="h-10 rounded-lg bg-[#ff3b3b] px-6 text-sm font-black text-white hover:bg-[#ff5252] disabled:opacity-50 transition-all active:scale-[0.98]"
        >
          {isPending ? 'Erasing...' : 'Yes, delete now'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="h-10 rounded-lg border border-white/5 bg-white/5 px-6 text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
