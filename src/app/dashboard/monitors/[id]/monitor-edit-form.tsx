'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

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
  const latestValues = useRef(values)
  const lastSavedValues = useRef(values)
  const isInitialMount = useRef(true)

  // VALIDATION
  const validate = useCallback((field: string, value: any, currentValues: typeof values) => {
    if (field === 'notify_email' && currentValues.notify_email_enabled && value && !value.includes('@')) {
      return 'Please enter a valid email'
    }
    if (field === 'notify_slack_webhook' && currentValues.notify_slack_enabled && value && !value.startsWith('http')) {
      return 'Invalid webhook URL'
    }
    return null
  }, [])

  // SAVING LOGIC
  const triggerSave = useCallback(async () => {
    const current = latestValues.current
    
    // Check if anything actually changed from last saved state
    // We compare with a direct check to avoid any stringify issues with numbers vs strings
    const hasChanged = 
      current.name !== lastSavedValues.current.name ||
      current.check_interval_seconds !== lastSavedValues.current.check_interval_seconds ||
      current.audit_interval_seconds !== lastSavedValues.current.audit_interval_seconds ||
      current.notify_email !== lastSavedValues.current.notify_email ||
      current.notify_email_enabled !== lastSavedValues.current.notify_email_enabled ||
      current.notify_slack_webhook !== lastSavedValues.current.notify_slack_webhook ||
      current.notify_slack_enabled !== lastSavedValues.current.notify_slack_enabled

    if (!hasChanged) return

    // Basic validation check before saving
    const emailErr = validate('notify_email', current.notify_email, current)
    const slackErr = validate('notify_slack_webhook', current.notify_slack_webhook, current)
    
    if (emailErr || slackErr) {
      setErrors({ notify_email: emailErr, notify_slack_webhook: slackErr })
      setStatus('error')
      return
    }

    setStatus('saving')
    try {
      const payload = {
        ...current,
        notify_email: current.notify_email.trim() || null,
        notify_slack_webhook: current.notify_slack_webhook.trim() || null,
      }

      const res = await fetch(`/api/monitors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      
      if (res.ok) {
        setStatus('saved')
        lastSavedValues.current = current
        setTimeout(() => setStatus(curr => curr === 'saved' ? 'idle' : curr), 1500)
        router.refresh()
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }, [id, router, validate])

  // EFFECT: Auto-save entry point
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    // Determine if we should debounce
    const isTyping = 
      values.name !== lastSavedValues.current.name || 
      values.notify_email !== lastSavedValues.current.notify_email ||
      values.notify_slack_webhook !== lastSavedValues.current.notify_slack_webhook

    const delay = isTyping ? 800 : 0
    const timeout = setTimeout(triggerSave, delay)

    return () => clearTimeout(timeout)
  }, [values, triggerSave])

  const handleInputChange = (field: keyof typeof values, value: any) => {
    setValues(prev => {
      const next = { ...prev, [field]: value }
      latestValues.current = next // Sync ref immediately
      
      // Clear error while typing if valid now
      const err = validate(field, value, next)
      setErrors(errs => ({ ...errs, [field]: err }))
      return next
    })
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
          transition: all 0.2s ease !important;
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
        }
        .cs-form-card:hover {
          background: #132238 !important;
        }
        .cs-form-card:focus-within {
          z-index: 60 !important;
        }
        .cs-card-wash {
          pointer-events: none !important;
          position: absolute !important;
          inset: 0 !important;
          border-radius: 12px !important;
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
        select.cs-input option {
          background-color: #14263f !important;
          color: white !important;
          padding: 12px !important;
        }
        .cs-custom-select {
          position: relative !important;
          z-index: 50 !important;
        }
        .cs-select-trigger {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          cursor: pointer !important;
          user-select: none !important;
        }
        .cs-select-dropdown {
          position: fixed !important;
          background: #14263f !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 12px !important;
          backdrop-filter: blur(12px) !important;
          box-shadow: 
            0 16px 48px rgba(0, 0, 0, 0.5),
            0 4px 12px rgba(0, 0, 0, 0.3) !important;
          overflow: hidden !important;
          z-index: 99999 !important;
          animation: cs-fade-in 0.2s ease-out !important;
        }
        @keyframes cs-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cs-select-option {
          padding: 10px 14px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          color: rgba(255, 255, 255, 0.7) !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
        }
        .cs-select-option:hover {
          background: rgba(255, 255, 255, 0.05) !important;
          color: white !important;
        }
        .cs-select-option.active {
          color: #00ffa0 !important;
          background: rgba(0, 255, 160, 0.03) !important;
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
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          padding: 10px 20px;
          border-radius: 99px;
          background: rgba(15, 28, 46, 0.9);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 
            0 8px 24px rgba(0, 0, 0, 0.4),
            0 2px 6px rgba(0, 0, 0, 0.2);
          transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1);
        }
        .status-badge.status-error {
          border-color: rgba(239, 68, 68, 0.4);
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);
        }

        .cs-settings-grid {
          display: grid !important;
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 28px !important;
        }
        .cs-full-width {
          grid-column: span 2 !important;
          padding: 32px !important;
        }
      `}</style>

      <div className="flex items-start justify-between">
        <header className="mb-2">
          <h2 id={`${p}-edit-heading`} className="text-lg font-bold text-white mb-1">
            Monitor configuration
          </h2>
          <p className="text-xs text-zinc-500">Changes are saved automatically as you work.</p>
        </header>

        <div className={`status-badge ${
          status === 'saving' ? 'text-zinc-500 animate-pulse' :
          status === 'saved' ? 'text-emerald-400' :
          status === 'error' ? 'text-red-500 status-error' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
        }`}>
          <div className="flex items-center gap-2">
            {status === 'saving' && <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" />}
            {status === 'saved' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
            {status === 'error' && <div className="w-1.5 h-1.5 rounded-full bg-red-500" />}
            {status === 'saving' ? 'Saving changes...' : status === 'saved' ? 'All changes saved ✓' : 'Error updating settings'}
          </div>
        </div>
      </div>

      <div className="cs-settings-grid max-w-5xl">
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
              <label className="cs-label">Check Interval</label>
              <CustomSelect
                value={values.check_interval_seconds}
                options={[
                  { value: 60, label: '1 minute' },
                  { value: 180, label: '3 minutes' },
                  { value: 300, label: '5 minutes' },
                ]}
                onChange={(val) => handleInputChange('check_interval_seconds', val)}
              />
            </div>

            <div>
              <label className="cs-label">Bypass Audit</label>
              <CustomSelect
                value={values.audit_interval_seconds}
                options={[
                  { value: 900, label: '15 minutes' },
                  { value: 1800, label: '30 minutes' },
                  { value: 3600, label: '60 minutes' },
                ]}
                onChange={(val) => handleInputChange('audit_interval_seconds', val)}
              />
            </div>
          </div>
        </section>

        {/* NOTIFICATIONS SECTION */}
        <section className="cs-form-card cs-full-width">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">Notifications</h3>

          <div className="grid grid-cols-2 gap-x-16 gap-y-6 relative z-10">
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

function CustomSelect({ 
  value, 
  options, 
  onChange 
}: { 
  value: number, 
  options: { value: number, label: string }[], 
  onChange: (val: number) => void 
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeLabel = options.find(o => o.value === value)?.label || ''

  const updateCoords = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setCoords({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width
      })
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      updateCoords()
      window.addEventListener('scroll', updateCoords, true)
      window.addEventListener('resize', updateCoords)
    }
    return () => {
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
  }, [isOpen, updateCoords])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isInsideTrigger = containerRef.current?.contains(e.target as Node)
      const isInsideDropdown = dropdownRef.current?.contains(e.target as Node)
      
      if (!isInsideTrigger && !isInsideDropdown) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const dropdownContent = isOpen && (
    <div 
      ref={dropdownRef}
      className="cs-select-dropdown"
      style={{
        top: coords.top,
        left: coords.left,
        width: coords.width,
        position: 'fixed'
      }}
    >
      {options.map(opt => (
        <div
          key={opt.value}
          className={`cs-select-option ${opt.value === value ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onChange(opt.value)
            setIsOpen(false)
          }}
        >
          {opt.label}
        </div>
      ))}
    </div>
  )

  return (
    <div className="cs-custom-select" ref={containerRef}>
      <div 
        className="w-full h-10 rounded-lg px-4 text-sm cs-input cs-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold text-zinc-100">{activeLabel}</span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  )
}

