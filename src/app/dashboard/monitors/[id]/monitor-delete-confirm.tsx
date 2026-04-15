'use client'

import { FormEvent, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'

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
    <>
      <style>{`
        @keyframes monitorDeleteModalIn {
          from { opacity: 0; transform: translateY(2px) scale(0.985); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
        style={{ backdropFilter: 'blur(4px)' }}
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
          className="mx-auto rounded-xl border border-white/[0.06] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
          style={{
            width: 'min(420px, calc(100vw - 32px))',
            maxWidth: '420px',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            animation: 'monitorDeleteModalIn 0.16s ease-out forwards',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[rgba(255,60,60,0.08)] text-[#ff4d4f]">
                <svg viewBox="0 0 16 16" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M8 5v3M8 11h.01M1 14l7-12 7 12H1z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h2 id="monitor-delete-title" className="text-lg font-semibold text-white">
                  Remove monitor?
                </h2>
                <p id="monitor-delete-description" className="mt-1.5 text-sm text-zinc-300/90">
                  This will permanently delete all monitor data.
                </p>
              </div>
            </div>

            <ul className="flex flex-wrap gap-2 text-[12px] text-white/80">
              <li className="rounded-md bg-white/5 px-2 py-1 leading-none">probes</li>
              <li className="rounded-md bg-white/5 px-2 py-1 leading-none">logs</li>
              <li className="rounded-md bg-white/5 px-2 py-1 leading-none">alerts</li>
              <li className="rounded-md bg-white/5 px-2 py-1 leading-none">history</li>
            </ul>

            <p className="text-sm font-medium" style={{ color: 'rgba(255,100,100,0.8)' }}>
              This action cannot be undone.
            </p>

            <div className="space-y-2">
              <label htmlFor="delete-confirm-input" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">
                Type DELETE to confirm
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
                className="h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-sm uppercase tracking-[0.05em] text-white outline-none transition focus:border-emerald-400/45 focus:ring-1 focus:ring-emerald-400/20 focus:outline-none"
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="h-10 rounded-lg border-2 border-white/10 bg-transparent px-5 text-sm font-medium text-white/60 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canDelete || isPending}
                className={`h-10 rounded-lg border-2 px-5 text-sm font-medium transition ${
                  canDelete && !isPending
                    ? 'cursor-pointer border-[#ff8a8a]/60 bg-[#ff3b3b] text-white shadow-[0_6px_20px_rgba(255,59,59,0.25)] hover:-translate-y-px hover:border-[#ffb0b0]/70 hover:bg-[#ff6464] hover:shadow-[0_10px_24px_rgba(255,59,59,0.35)] active:translate-y-0'
                    : 'cursor-not-allowed border-white/10 bg-transparent text-white/45 shadow-none'
                }`}
              >
                {isPending ? 'Deleting...' : 'Delete monitor'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    portalNode
  )
}
