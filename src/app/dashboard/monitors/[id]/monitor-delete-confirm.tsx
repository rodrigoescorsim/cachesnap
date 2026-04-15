'use client'

import { useState, useTransition, useEffect } from 'react'
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
  const [confirmText, setConfirmText] = useState('')

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

  // HANDLE KEYDOWN (ESC)
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeydown)
    document.body.style.overflow = 'hidden' // Lock scroll
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      document.body.style.overflow = 'unset' // Unlock scroll
    }
  }, [onCancel])

  const isConfirmed = confirmText === 'DELETE'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* OVERLAY */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-[4px] animate-in fade-in duration-200"
        onClick={onCancel}
      />

      {/* MODAL CONTAINER */}
      <div className={`
        relative w-full max-w-[420px] bg-[#0f1b2d] border border-white/10 rounded-xl p-6 
        shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-10
        animate-in fade-in zoom-in-95 duration-200
        ${className}
      `}>
        {/* HEADER */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Remove monitor?</h2>
          <p className="text-sm text-zinc-400">This will permanently delete all associated data.</p>
        </div>

        {/* IMPACT LIST */}
        <div className="grid grid-cols-2 gap-2 mb-6 text-[10px] font-black uppercase tracking-widest">
          <div className="bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-zinc-500 flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-red-500/40" /> probes
          </div>
          <div className="bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-zinc-500 flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-red-500/40" /> logs
          </div>
          <div className="bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-zinc-500 flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-red-500/40" /> alerts
          </div>
          <div className="bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-zinc-500 flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-red-500/40" /> history
          </div>
        </div>

        <div className="text-center mb-6">
          <p className="text-xs font-bold text-red-500/80">This action cannot be undone.</p>
        </div>

        {/* CONFIRMATION INPUT */}
        <div className="space-y-3 mb-8">
          <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 text-center">
            Type <span className="text-white">DELETE</span> to confirm
          </label>
          <input
            autoFocus
            type="text"
            placeholder="DELETE"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && isConfirmed && !isPending && handleDelete()}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-center text-white font-bold tracking-[0.2em] placeholder:text-zinc-800 placeholder:tracking-normal focus:outline-none focus:border-red-500/50 transition-colors"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-2">
            <p className="text-[10px] font-bold text-red-400 text-center">{error}</p>
          </div>
        )}

        {/* ACTIONS */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={!isConfirmed || isPending}
            className="w-full h-11 rounded-lg bg-[#ff3b3b] text-sm font-black text-white hover:bg-[#ff5252] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {isPending ? 'Deleting...' : 'Delete monitor'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="w-full h-11 rounded-lg bg-transparent text-sm font-bold text-zinc-500 hover:text-white transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
