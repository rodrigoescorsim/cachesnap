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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* OVERLAY */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-[4px] transition-opacity duration-300"
        onClick={onCancel}
      />

      {/* MODAL CONTAINER */}
      <div className="relative w-full max-w-[420px] bg-[#0f1b2d] border border-white/10 rounded-xl shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* CLOSE BUTTON */}
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 text-zinc-500 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
            <AlertTriangle size={24} strokeWidth={2.5} />
          </div>

          <h3 className="text-lg font-bold text-white mb-2">Remove monitor?</h3>
          
          <div className="text-sm text-zinc-400 space-y-3 mb-6">
            <p>This will permanently delete:</p>
            <ul className="text-xs font-mono bg-black/20 p-3 rounded-lg border border-white/5 text-left space-y-1">
              <li>• All probe history</li>
              <li>• Diagnostic logs</li>
              <li>• Regional alerts</li>
              <li>• Performance metrics</li>
            </ul>
            <p className="text-red-400/80 font-medium">This action cannot be undone.</p>
          </div>

          {error && (
            <div className="w-full mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-bold">
              {error}
            </div>
          )}

          <div className="w-full mb-6">
            <label className="block text-[10px] uppercase font-black tracking-widest text-zinc-500 mb-2 text-left">
              Type <span className="text-white">DELETE</span> to confirm
            </label>
            <input 
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full h-10 px-4 bg-black/40 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 transition-colors"
              autoFocus
            />
          </div>

          <div className="flex w-full gap-3">
            <button
              onClick={onCancel}
              className="flex-1 h-10 rounded-lg bg-white/5 border border-white/5 text-sm font-bold text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isLocked}
              className={`flex-1 h-10 rounded-lg text-sm font-black text-white transition-all ${
                isLocked 
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-transparent' 
                  : 'bg-[#ff3b3b] hover:bg-[#ff5252] shadow-lg shadow-red-500/10 active:scale-[0.98]'
              }`}
            >
              {isPending ? 'Erasing...' : 'Delete monitor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
