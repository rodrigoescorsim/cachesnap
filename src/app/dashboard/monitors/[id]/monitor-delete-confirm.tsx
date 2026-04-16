'use client'

import { FormEvent, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'

export function MonitorDeleteConfirm({
  monitorId,
  onClose,
}: {
  monitorId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmValue, setConfirmValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null)
  const confirmInputRef = useRef<HTMLInputElement>(null)
  const normalizedConfirm = confirmValue.trim().toUpperCase()
  const canDelete = normalizedConfirm === 'DELETE'

  useEffect(() => {
    setPortalNode(document.body)
  }, [])

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
          onClose()
          router.push('/dashboard')
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
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
        className="cs-card w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="cs-card-wash opacity-40 bg-gradient-to-br from-red-500/10 to-transparent" />
        
        <form onSubmit={handleSubmit} className="relative z-10 space-y-6">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h2 id="monitor-delete-title" className="text-lg font-bold text-white leading-tight">
                Remove monitor?
              </h2>
              <p id="monitor-delete-description" className="mt-1 text-sm text-zinc-400 leading-relaxed">
                This will permanently delete all logs, alerts, and performance data. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="delete-confirm-input" className="cs-label block">
              Type <span className="text-red-400 font-black">DELETE</span> to confirm
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
              className="w-full h-11 cs-input text-center text-sm font-black tracking-widest uppercase placeholder:opacity-20 focus:border-red-500/40 focus:ring-red-500/10"
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
              className="cs-btn bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canDelete || isPending}
              className={`cs-btn px-6 font-black uppercase tracking-widest ${
                canDelete && !isPending
                  ? 'bg-red-500 text-white border-red-600 shadow-lg shadow-red-500/20 hover:bg-red-600'
                  : 'bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed'
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
