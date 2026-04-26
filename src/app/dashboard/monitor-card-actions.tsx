'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useTransition } from 'react'
import { invalidateMonitorsSummary } from '@/hooks/use-monitors'

interface Props {
  monitorId: string
  monitorLabel: string
}

export function MonitorCardActions({ monitorId, monitorLabel }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function askDelete() {
    setError(null)
    setConfirmOpen(true)
  }

  function cancelDelete() {
    if (isPending) return
    setConfirmOpen(false)
  }

  function confirmDelete() {
    setError(null)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${monitorId}`, { method: 'DELETE' })
        if (!res.ok) {
          setError('Failed to delete monitor')
          return
        }
        await invalidateMonitorsSummary(queryClient)
        setConfirmOpen(false)
        router.refresh()
      } catch {
        setError('Failed to delete monitor')
      }
    })
  }

  return (
    <div className={`relative z-20 flex items-center gap-1 transition-opacity ${confirmOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
      <Link
        href={`/dashboard/monitors/${monitorId}`}
        className="p-1 text-zinc-400 hover:text-zinc-500 dark:hover:text-zinc-200 transition-colors"
        title="Edit monitor"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
      </Link>
      <button
        type="button"
        onClick={askDelete}
        disabled={isPending}
        className="p-1 text-zinc-400 hover:text-red-500 transition-colors disabled:opacity-50"
        title="Delete monitor"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
      </button>

      {confirmOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-3">
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            Delete monitor?
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            "{monitorLabel}" and all probe data and alerts will be permanently removed.
          </p>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelDelete}
              disabled={isPending}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={isPending}
              className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <span className="absolute right-0 top-full mt-1 whitespace-nowrap rounded bg-red-50 px-2 py-1 text-[10px] text-red-600 border border-red-200">
          {error}
        </span>
      )}
    </div>
  )
}
