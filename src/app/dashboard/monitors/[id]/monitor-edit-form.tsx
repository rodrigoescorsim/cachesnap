'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export interface MonitorEditFormProps {
  id: string
  url: string
  name: string | null
  checkIntervalSeconds: number
  auditIntervalSeconds: number
  notifyEmail: string | null
  notifyEmailEnabled: boolean
  notifySlackWebhook: string | null
  notifySlackEnabled: boolean
  /** Prefix for input ids when multiple forms could exist */
  idPrefix?: string
}

export function MonitorEditForm({
  id,
  url,
  name,
  checkIntervalSeconds,
  auditIntervalSeconds,
  notifyEmail,
  notifyEmailEnabled,
  notifySlackWebhook,
  notifySlackEnabled,
  idPrefix = 'settings',
}: MonitorEditFormProps) {
  const router = useRouter()
  const [showSaved, setShowSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [emailOn, setEmailOn] = useState(notifyEmailEnabled)
  const [slackOn, setSlackOn] = useState(notifySlackEnabled)
  const p = idPrefix

  function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setShowSaved(false)
    const formData = new FormData(e.currentTarget)
    const newName = (formData.get('name') as string).trim()
    const check_interval_seconds = Number(formData.get('check_interval_seconds'))
    const audit_interval_seconds = Number(formData.get('audit_interval_seconds'))
    const emailVal = (formData.get('notify_email') as string).trim()
    const slackVal = (formData.get('notify_slack_webhook') as string).trim()

    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newName || undefined,
            check_interval_seconds,
            audit_interval_seconds,
            notify_email: emailVal || null,
            notify_email_enabled: emailOn,
            notify_slack_webhook: slackVal || null,
            notify_slack_enabled: slackOn,
          }),
        })
        if (res.ok) {
          setShowSaved(true)
          setTimeout(() => setShowSaved(false), 2000)
          router.refresh()
        } else {
          const json = await res.json().catch(() => ({}))
          setError((json as { error?: string }).error ?? 'Failed to update monitor')
        }
      } catch {
        setError('Failed to update monitor')
      }
    })
  }

  return (
    <div className="space-y-6">
      <style>{`
        .cs-form-card {
          background: #0f1c2e !important;
          border: 1px solid rgba(255, 255, 255, 0.03) !important;
          border-radius: 12px !important;
          padding: 20px !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
          position: relative !important;
          overflow: hidden !important;
          transition: background 0.2s ease !important;
        }
        .cs-form-card:hover {
          background: #132238 !important;
        }
        .cs-card-wash {
          pointer-events: none !important;
          position: absolute !important;
          inset: 0 !important;
          background: linear-gradient(225deg, rgba(76, 201, 255, 0.028), transparent, rgba(0, 136, 255, 0.035)) !important;
        }
        .cs-section-header {
          font-size: 11px !important;
          font-weight: 900 !important;
          color: rgba(255, 255, 255, 0.5) !important;
          text-transform: uppercase !important;
          letter-spacing: 0.12em !important;
          border-left: 3px solid rgba(0, 255, 160, 0.4) !important;
          padding-left: 10px !important;
          line-height: 1 !important;
          margin-bottom: 22px !important;
          position: relative !important;
          z-index: 1 !important;
        }
        .cs-input {
          background: rgba(255, 255, 255, 0.04) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          color: white !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          position: relative !important;
          z-index: 1 !important;
        }
        .cs-input:focus {
          border-color: rgba(0, 255, 150, 0.4) !important;
          box-shadow: 0 0 0 4px rgba(0, 255, 160, 0.08) !important;
          outline: none !important;
          background: rgba(255, 255, 255, 0.05) !important;
        }
        .cs-btn-primary {
          background: linear-gradient(135deg, #1E3A8A, #0E7490) !important;
          color: white !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.08em !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
        }
        .cs-btn-primary:hover {
          background: linear-gradient(135deg, #1E40AF, #0891B2) !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }
        .cs-btn-primary:active {
          transform: translateY(0) !important;
        }
        .cs-label {
          font-size: 11px !important;
          font-weight: 700 !important;
          color: rgba(255, 255, 255, 0.45) !important;
          margin-bottom: 10px !important;
          display: block !important;
          position: relative !important;
          z-index: 1 !important;
        }
      `}</style>

      <header className="mb-2">
        <h2 id={`${p}-edit-heading`} className="text-lg font-bold text-white mb-1">
          Monitor configuration
        </h2>
        <p className="text-xs text-zinc-500">Manage your monitoring intervals and notification preferences.</p>
      </header>

      <form onSubmit={handleEdit} className="space-y-[28px] max-w-md">
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <p className="text-xs font-medium text-red-500">{error}</p>
          </div>
        )}

        {/* GENERAL SECTION */}
        <section className="cs-form-card">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">General</h3>
          <div className="relative z-10">
            <label htmlFor={`${p}-edit-name`} className="cs-label">
              Display Name <span className="opacity-50 ml-1">— for internal identification</span>
            </label>
            <input
              id={`${p}-edit-name`}
              name="name"
              type="text"
              defaultValue={name ?? (() => {
                try {
                  return new URL(url).hostname
                } catch {
                  return url
                }
              })()}
              placeholder="e.g. Production API"
              className="w-full h-11 rounded-lg px-4 text-sm cs-input"
            />
          </div>
        </section>

        {/* MONITORING SECTION */}
        <section className="cs-form-card">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">Monitoring</h3>
          <div className="grid grid-cols-2 gap-4 relative z-10">
            <div>
              <label htmlFor={`${p}-edit-check`} className="cs-label">Check Interval</label>
              <select
                id={`${p}-edit-check`}
                name="check_interval_seconds"
                defaultValue={checkIntervalSeconds}
                className="w-full h-10 rounded-lg px-3 text-sm cs-input appearance-none cursor-pointer"
              >
                <option value={60}>1 minute</option>
                <option value={180}>3 minutes</option>
                <option value={300}>5 minutes</option>
              </select>
            </div>

            <div>
              <label htmlFor={`${p}-edit-audit`} className="cs-label">Bypass Audit</label>
              <select
                id={`${p}-edit-audit`}
                name="audit_interval_seconds"
                defaultValue={auditIntervalSeconds}
                className="w-full h-10 rounded-lg px-3 text-sm cs-input appearance-none cursor-pointer"
              >
                <option value={900}>15 minutes</option>
                <option value={1800}>30 minutes</option>
                <option value={3600}>60 minutes</option>
              </select>
            </div>
          </div>
        </section>

        {/* NOTIFICATIONS SECTION */}
        <section className="cs-form-card">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">Notifications</h3>

          <div className="space-y-4 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <input
                  id={`${p}-notify-email-toggle`}
                  type="checkbox"
                  checked={emailOn}
                  onChange={(e) => setEmailOn(e.target.checked)}
                  className="h-[18px] w-[18px] rounded border-white/10 bg-white/[0.03] cursor-pointer appearance-none border transition-all checked:bg-[#00ffa0] checked:border-[#00ffa0] checked:shadow-[0_0_10px_rgba(0,255,160,0.3)]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 16 16' fill='black' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3E%3C/svg%3E")`,
                    backgroundSize: '100% 100%',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }}
                />
                <label htmlFor={`${p}-notify-email-toggle`} className="text-xs font-bold text-zinc-300 cursor-pointer select-none">
                  Email alerts
                </label>
              </div>
              <input
                name="notify_email"
                type="email"
                defaultValue={notifyEmail ?? ''}
                disabled={!emailOn}
                placeholder="alerts@company.com"
                className={`w-full h-10 rounded-lg px-4 text-sm cs-input ${!emailOn ? 'opacity-20 pointer-events-none' : ''}`}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <input
                  id={`${p}-notify-slack-toggle`}
                  type="checkbox"
                  checked={slackOn}
                  onChange={(e) => setSlackOn(e.target.checked)}
                  className="h-[18px] w-[18px] rounded border-white/10 bg-white/[0.03] cursor-pointer appearance-none border transition-all checked:bg-[#00ffa0] checked:border-[#00ffa0] checked:shadow-[0_0_10px_rgba(0,255,160,0.3)]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 16 16' fill='black' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3E%3C/svg%3E")`,
                    backgroundSize: '100% 100%',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }}
                />
                <label htmlFor={`${p}-notify-slack-toggle`} className="text-xs font-bold text-zinc-300 cursor-pointer select-none">
                  Slack / Discord Webhook
                </label>
              </div>
              <input
                name="notify_slack_webhook"
                type="url"
                defaultValue={notifySlackWebhook ?? ''}
                disabled={!slackOn}
                placeholder="https://hooks.slack.com/services/..."
                className={`w-full h-10 rounded-lg px-4 text-sm cs-input ${!slackOn ? 'opacity-20 pointer-events-none' : ''}`}
              />
            </div>
          </div>
        </section>

        <footer className="pt-2 flex items-center gap-4">
          <button
            type="submit"
            disabled={isPending}
            className={`
              relative flex items-center justify-center h-10 px-8 rounded-lg text-xs font-black transition-all active:scale-[0.98] disabled:opacity-50
              ${showSaved ? 'bg-emerald-500 text-white' : 'cs-btn-primary'}
            `}
          >
            {isPending ? 'Saving...' : showSaved ? 'Saved \u2713' : 'Save changes'}
          </button>
          
          {showSaved && (
            <span className="text-[10px] font-bold text-emerald-500 animate-in fade-in slide-in-from-left-2 duration-300">
              SETTINGS UPDATED
            </span>
          )}
        </footer>
      </form>
    </div>
  )
}

