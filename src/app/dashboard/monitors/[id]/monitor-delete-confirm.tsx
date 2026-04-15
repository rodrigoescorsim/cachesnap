'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'

export function MonitorDeleteConfirm({
  monitorId,
  onCancel,
}: {
  monitorId: string
  onCancel: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  // Prevent scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = 'unset' }
  }, [])

  function handleDelete() {
    if (confirmText !== 'DELETE') return
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

  const isLocked = confirmText !== 'DELETE' || isPending

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center p-4">
      {/* OVERLAY */}
      <div 
        className="fixed inset-0 bg-[#070b14]/80 backdrop-blur-md transition-opacity"
        onClick={onCancel}
      />

      {/* MODAL CONTAINER */}
      <div className="relative w-full max-w-[440px] bg-[#0f1c2e] border border-red-500/20 rounded-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] p-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* DANGER ACCENT */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />

        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-500 shadow-inner">
            <AlertTriangle size={28} strokeWidth={2.5} />
          </div>

          <h3 className="text-xl font-bold text-white mb-2">Remove monitor?</h3>
          
          <div className="text-sm text-zinc-400 space-y-4 mb-8">
            <p>This action is <span className="text-red-400 font-bold uppercase tracking-wider">irreversible</span>. You will permanently lose:</p>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-tight">
              <div className="bg-black/20 px-3 py-2 rounded-lg border border-white/5 text-zinc-500">Probe History</div>
              <div className="bg-black/20 px-3 py-2 rounded-lg border border-white/5 text-zinc-500">Audit Logs</div>
              <div className="bg-black/20 px-3 py-2 rounded-lg border border-white/5 text-zinc-500">Alert History</div>
              <div className="bg-black/20 px-3 py-2 rounded-lg border border-white/5 text-zinc-500">Timing Data</div>
            </div>
          </div>

          {error && (
            <div className="w-full mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-bold">
              {error}
            </div>
          )}

          <div className="w-full mb-8">
            <label className="block text-[10px] uppercase font-black tracking-widest text-zinc-500 mb-3 text-left">
              Type <span className="text-white">DELETE</span> to confirm
            </label>
            <input 
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full h-12 px-4 bg-black/40 border border-white/10 rounded-xl text-white text-base font-bold text-center tracking-widest focus:outline-none focus:border-red-500/50 transition-colors placeholder:text-zinc-800"
              autoFocus
            />
          </div>

          <div className="flex w-full gap-4">
            <button
              onClick={onCancel}
              className="flex-1 h-12 rounded-xl bg-white/5 border border-white/5 text-sm font-bold text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isLocked}
              className={`flex-1 h-12 rounded-xl text-sm font-black text-white transition-all ${
                isLocked 
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed hidden' 
                  : 'bg-[#ff3b3b] hover:bg-[#ff5252] shadow-xl shadow-red-500/20 active:scale-[0.98]'
              }`}
            >
              {isPending ? 'Erasing...' : 'Delete monitor'}
            </button>
            {isLocked && (
               <button disabled className="flex-1 h-12 rounded-xl bg-zinc-800 text-zinc-600 text-sm font-black cursor-not-allowed">
                Locked
               </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
