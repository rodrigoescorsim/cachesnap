'use client'

import { FormEvent, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'
import { invalidateMonitorsSummary } from '@/hooks/use-monitors'

export function MonitorDeleteConfirm({
  monitorId,
  onClose,
}: {
  monitorId: string
  onClose: () => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [confirmValue, setConfirmValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [portalNode] = useState<HTMLElement | null>(() => (typeof document === 'undefined' ? null : document.body))
  const confirmInputRef = useRef<HTMLInputElement>(null)
  const normalizedConfirm = confirmValue.trim().toUpperCase()
  const canDelete = normalizedConfirm === 'DELETE'

  useEffect(() => {
    if (!portalNode) return
    confirmInputRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isPending) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isPending, onClose, portalNode])

  function handleDelete() {
    if (!canDelete || isPending) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${monitorId}`, { method: 'DELETE' })
        if (res.ok) {
          await invalidateMonitorsSummary(queryClient)
          onClose()
          router.push('/monitors')
          router.refresh()
        } else {
          setError('Failed to delete monitor')
        }
      } catch {
        setError('Failed to delete monitor')
      }
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    handleDelete()
  }

  if (!portalNode) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="monitor-delete-title"
        aria-describedby="monitor-delete-description"
        className="cs-card w-full max-w-[420px] p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-white/10"
      >
        <div className="cs-card-wash opacity-20 bg-gradient-to-br from-red-500/10 to-transparent" />

        <form onSubmit={handleSubmit} className="relative z-10 space-y-7">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h2 id="monitor-delete-title" className="text-xl font-bold text-white leading-tight">
                Remove monitor?
              </h2>
              <p id="monitor-delete-description" className="mt-2 text-sm text-zinc-400 leading-relaxed">
                This will permanently delete all logs, alerts, and performance data for this instance.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <ul className="flex flex-wrap gap-2">
              {['probes', 'logs', 'alerts', 'history'].map(item => (
                <li key={item} className="rounded-md bg-white/5 border border-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {item}
                </li>
              ))}
            </ul>

            <p className="text-sm font-bold text-red-400/90">
              This action cannot be undone.
            </p>
          </div>

          <div className="space-y-3">
            <label htmlFor="delete-confirm-input" className="cs-label block opacity-60">
              Type <span className="text-white font-black">DELETE</span> to confirm
            </label>
            <input
              id="delete-confirm-input"
              ref={confirmInputRef}
              value={confirmValue}
              onChange={(event) => setConfirmValue(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={6}
              placeholder="DELETE"
              className="w-full h-12 cs-input text-center text-sm font-black tracking-[0.2em] uppercase placeholder:opacity-10 focus:border-red-500/40 focus:ring-red-500/10"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-200">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="h-11 px-6 rounded-xl text-sm font-bold text-zinc-500 hover:text-white hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canDelete || isPending}
              className={`h-11 px-8 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${canDelete && !isPending
                  ? 'bg-red-500 text-white border-b-2 border-red-700 shadow-xl shadow-red-500/20 hover:bg-red-600 hover:-translate-y-0.5 active:translate-y-0 active:border-b-0'
                  : 'bg-white/5 text-zinc-600 border border-white/5 cursor-not-allowed'
                }`}
            >
              {isPending ? 'Deleting...' : 'Remove permanently'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    portalNode
  )
}
