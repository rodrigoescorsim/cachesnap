'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

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
  const p = idPrefix

  // FORM STATE
  const [values, setValues] = useState({
    name: name ?? (() => {
      try { return new URL(url).hostname } catch { return url }
    })(),
    check_interval_seconds: checkIntervalSeconds,
    audit_interval_seconds: auditIntervalSeconds,
    notify_email: notifyEmail ?? '',
    notify_email_enabled: notifyEmailEnabled,
    notify_slack_webhook: notifySlackWebhook ?? '',
    notify_slack_enabled: notifySlackEnabled,
  })

  // TRACKING STATE
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const lastSavedValues = useRef(values)
  const isInitialMount = useRef(true)

  // VALIDATION
  const validate = useCallback((field: string, value: any) => {
    if (field === 'notify_email' && values.notify_email_enabled && value && !value.includes('@')) {
      return 'Please enter a valid email'
    }
    if (field === 'notify_slack_webhook' && values.notify_slack_enabled && value && !value.startsWith('http')) {
      return 'Invalid webhook URL'
    }
    return null
  }, [values.notify_email_enabled, values.notify_slack_enabled])

  // SAVING LOGIC
  const triggerSave = useCallback(async (currentValues: typeof values) => {
    // Basic validation check before saving
    const emailErr = validate('notify_email', currentValues.notify_email)
    const slackErr = validate('notify_slack_webhook', currentValues.notify_slack_webhook)
    
    if (emailErr || slackErr) {
      setErrors(prev => ({ ...prev, notify_email: emailErr, notify_slack_webhook: slackErr }))
      setStatus('error')
      return
    }

    setStatus('saving')
    try {
      const res = await fetch(`/api/monitors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentValues),
      })
      
      if (res.ok) {
        setStatus('saved')
        lastSavedValues.current = currentValues
        setTimeout(() => setStatus(curr => curr === 'saved' ? 'idle' : curr), 2000)
        router.refresh()
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }, [id, router, validate])

  // EFFECT: Auto-save logic
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    // Check if anything actually changed from last saved state
    const hasChanged = JSON.stringify(values) !== JSON.stringify(lastSavedValues.current)
    if (!hasChanged) return

    // Debounce duration: fast for toggles/selects, slower for typing
    const isTyping = 
      values.name !== lastSavedValues.current.name || 
      values.notify_email !== lastSavedValues.current.notify_email ||
      values.notify_slack_webhook !== lastSavedValues.current.notify_slack_webhook

    const delay = isTyping ? 800 : 0
    const timeout = setTimeout(() => triggerSave(values), delay)

    return () => clearTimeout(timeout)
  }, [values, triggerSave])

  const handleInputChange = (field: keyof typeof values, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }))
    // Clear error while typing if valid now
    const err = validate(field, value)
    setErrors(prev => ({ ...prev, [field]: err }))
  }

  return (
    <div className="space-y-6">
      <style>{`
        .cs-form-card {
          background: #0f1c2e !important;
          border: 1px solid rgba(255, 255, 255, 0.03) !important;
          border-radius: 12px !important;
          padding: 24px !important;
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
        .cs-input-error {
          border-color: rgba(255, 80, 80, 0.4) !important;
          box-shadow: 0 0 0 4px rgba(255, 80, 80, 0.05) !important;
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
        .cs-error-msg {
          color: #ff6b6b !important;
          font-size: 10px !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
          margin-top: 6px !important;
          display: block !important;
        }
        .status-badge {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          transition: all 0.3s ease;
        }
      `}</style>

      <div className="flex items-start justify-between">
        <header className="mb-2">
          <h2 id={`${p}-edit-heading`} className="text-lg font-bold text-white mb-1">
            Monitor configuration
          </h2>
          <p className="text-xs text-zinc-500">Changes are saved automatically as you work.</p>
        </header>

        <div className="pt-2">
          <span className={`status-badge ${
            status === 'saving' ? 'text-zinc-500 animate-pulse' :
            status === 'saved' ? 'text-emerald-400' :
            status === 'error' ? 'text-red-500' : 'opacity-0'
          }`}>
            {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved \u2713' : 'Error saving'}
          </span>
        </div>
      </div>

      <div className="space-y-6 max-w-md">
        {/* GENERAL SECTION */}
        <section className="cs-form-card">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">General</h3>
          <div className="relative z-10">
            <label htmlFor={`${p}-edit-name`} className="cs-label">
              Display Name <span className="opacity-50 ml-1">— internal identification</span>
            </label>
            <input
              id={`${p}-edit-name`}
              type="text"
              value={values.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g. Production API"
              className={`w-full h-11 rounded-lg px-4 text-sm cs-input ${status === 'saving' ? 'opacity-80' : ''}`}
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
                value={values.check_interval_seconds}
                onChange={(e) => handleInputChange('check_interval_seconds', Number(e.target.value))}
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
                value={values.audit_interval_seconds}
                onChange={(e) => handleInputChange('audit_interval_seconds', Number(e.target.value))}
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
                  checked={values.notify_email_enabled}
                  onChange={(e) => handleInputChange('notify_email_enabled', e.target.checked)}
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
                type="email"
                value={values.notify_email}
                onChange={(e) => handleInputChange('notify_email', e.target.value)}
                disabled={!values.notify_email_enabled}
                placeholder="alerts@company.com"
                className={`w-full h-10 rounded-lg px-4 text-sm cs-input ${!values.notify_email_enabled ? 'opacity-20 pointer-events-none' : ''} ${errors.notify_email ? 'cs-input-error' : ''}`}
              />
              {errors.notify_email && <span className="cs-error-msg">{errors.notify_email}</span>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <input
                  id={`${p}-notify-slack-toggle`}
                  type="checkbox"
                  checked={values.notify_slack_enabled}
                  onChange={(e) => handleInputChange('notify_slack_enabled', e.target.checked)}
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
                type="url"
                value={values.notify_slack_webhook}
                onChange={(e) => handleInputChange('notify_slack_webhook', e.target.value)}
                disabled={!values.notify_slack_enabled}
                placeholder="https://hooks.slack.com/services/..."
                className={`w-full h-10 rounded-lg px-4 text-sm cs-input ${!values.notify_slack_enabled ? 'opacity-20 pointer-events-none' : ''} ${errors.notify_slack_webhook ? 'cs-input-error' : ''}`}
              />
              {errors.notify_slack_webhook && <span className="cs-error-msg">{errors.notify_slack_webhook}</span>}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

