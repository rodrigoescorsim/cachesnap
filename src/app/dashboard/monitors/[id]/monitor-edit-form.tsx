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
  const lastSavedValues = useRef(values)
  const isInitialMount = useRef(true)

  // VALIDATION
  const validate = useCallback((field: string, value: any, currentValues: typeof values) => {
    // Basic required check if enabled
    if (field === 'notify_email' && currentValues.notify_email_enabled) {
      if (!value) return 'Email is required'
      if (!value.includes('@')) return 'Invalid email address'
    }
    if (field === 'notify_slack_webhook' && currentValues.notify_slack_enabled) {
      if (!value) return 'Webhook URL is required'
      if (!value.startsWith('http')) return 'Invalid webhook URL'
    }
    return null
  }, [])

  // SAVING LOGIC
  const triggerSave = useCallback(async (current: typeof values) => {
    const emailErr = validate('notify_email', current.notify_email, current)
    const slackErr = validate('notify_slack_webhook', current.notify_slack_webhook, current)
    
    if (emailErr || slackErr) {
      setErrors({ notify_email: emailErr, notify_slack_webhook: slackErr })
      return
    }

    const hasChanged = 
      current.name !== lastSavedValues.current.name ||
      current.check_interval_seconds !== lastSavedValues.current.check_interval_seconds ||
      current.audit_interval_seconds !== lastSavedValues.current.audit_interval_seconds ||
      current.notify_email !== lastSavedValues.current.notify_email ||
      current.notify_email_enabled !== lastSavedValues.current.notify_email_enabled ||
      current.notify_slack_webhook !== lastSavedValues.current.notify_slack_webhook ||
      current.notify_slack_enabled !== lastSavedValues.current.notify_slack_enabled

    if (!hasChanged) return

    setStatus('saving')
    try {
      const payload = {
        ...current,
        name: current.name.trim(),
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
        setTimeout(() => setStatus(curr => curr === 'saved' ? 'idle' : curr), 3000)
        router.refresh()
      } else {
        setStatus('error')
        setTimeout(() => setStatus(curr => curr === 'error' ? 'idle' : curr), 3000)
      }
    } catch {
      setStatus('error')
      setTimeout(() => setStatus(curr => curr === 'error' ? 'idle' : curr), 3000)
    }
  }, [id, router, validate])

  // EFFECT: Auto-save entry point
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    const hasChangedCheck = 
      values.name !== lastSavedValues.current.name ||
      values.check_interval_seconds !== lastSavedValues.current.check_interval_seconds ||
      values.audit_interval_seconds !== lastSavedValues.current.audit_interval_seconds ||
      values.notify_email !== lastSavedValues.current.notify_email ||
      values.notify_email_enabled !== lastSavedValues.current.notify_email_enabled ||
      values.notify_slack_webhook !== lastSavedValues.current.notify_slack_webhook ||
      values.notify_slack_enabled !== lastSavedValues.current.notify_slack_enabled

    if (!hasChangedCheck) return

    const isTyping = 
      values.name !== lastSavedValues.current.name || 
      values.notify_email !== lastSavedValues.current.notify_email ||
      values.notify_slack_webhook !== lastSavedValues.current.notify_slack_webhook

    const delay = isTyping ? 800 : 0
    const timeout = setTimeout(() => triggerSave(values), delay)

    return () => clearTimeout(timeout)
  }, [values, triggerSave])

  const handleInputChange = (field: keyof typeof values, value: any) => {
    setValues(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'notify_email_enabled' && !value) {
        setErrors(errs => ({ ...errs, notify_email: null }))
      }
      if (field === 'notify_slack_enabled' && !value) {
        setErrors(errs => ({ ...errs, notify_slack_webhook: null }))
      }
      const err = validate(field, value, next)
      setErrors(errs => ({ ...errs, [field]: err }))
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* STATUS BADGE */}
      <div className={`cs-status-pill ${status !== 'idle' ? 'visible' : ''} ${status}`}>
        <div className="flex items-center gap-2">
          {status === 'saving' && <div className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />}
          {status === 'saved' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />}
          {status === 'error' && <div className="w-1.5 h-1.5 rounded-full bg-red-400" />}
          {status === 'saving' ? 'Saving changes...' : 
           status === 'saved' ? 'All changes saved ✓' : 
           status === 'error' ? 'Error updating settings' : ''}
        </div>
      </div>

      <div className="flex items-start justify-between">
        <header className="mb-2">
          <h2 id={`${p}-edit-heading`} className="text-lg font-bold text-white mb-1">
            Monitor configuration
          </h2>
          <p className="text-xs text-zinc-500">Changes are saved automatically as you work.</p>
        </header>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl">
        {/* GENERAL SECTION */}
        <section className="cs-card cs-card-focus p-6 flex flex-col h-full">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">General</h3>
          <div className="relative z-10 flex-1">
            <label htmlFor={`${p}-edit-name`} className="cs-label">
              Display Name <span className="opacity-50 ml-1">— internal identification</span>
            </label>
            <input
              id={`${p}-edit-name`}
              type="text"
              value={values.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g. Production API"
              className={`w-full h-11 cs-input ${status === 'saving' ? 'opacity-80' : ''}`}
            />
          </div>
        </section>

        {/* MONITORING SECTION */}
        <section className="cs-card cs-card-focus p-6 flex flex-col h-full">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">Monitoring</h3>
          <div className="grid grid-cols-2 gap-4 relative z-10 flex-1">
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
        <section className="cs-card cs-card-focus p-6 md:col-span-2">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">Notifications</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  id={`${p}-notify-email-toggle`}
                  type="checkbox"
                  checked={values.notify_email_enabled}
                  onChange={(e) => handleInputChange('notify_email_enabled', e.target.checked)}
                  className="h-[18px] w-[18px] rounded border-white/10 bg-white/[0.03] cursor-pointer appearance-none border transition-all checked:bg-emerald-500 checked:border-emerald-500 checked:shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 16 16' fill='black' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3E%3C/svg%3E")`,
                    backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
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
                className={`w-full h-11 cs-input ${errors.notify_email ? 'cs-input-error' : ''}`}
              />
              {errors.notify_email && <span className="cs-error-msg">{errors.notify_email}</span>}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  id={`${p}-notify-slack-toggle`}
                  type="checkbox"
                  checked={values.notify_slack_enabled}
                  onChange={(e) => handleInputChange('notify_slack_enabled', e.target.checked)}
                  className="h-[18px] w-[18px] rounded border-white/10 bg-white/[0.03] cursor-pointer appearance-none border transition-all checked:bg-emerald-500 checked:border-emerald-500 checked:shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 16 16' fill='black' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3E%3C/svg%3E")`,
                    backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
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
                className={`w-full h-11 cs-input ${errors.notify_slack_webhook ? 'cs-input-error' : ''}`}
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
      if (!isInsideTrigger && !isInsideDropdown) setIsOpen(false)
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
    <div className="relative" ref={containerRef}>
      <div 
        className="w-full h-11 cs-input flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold text-zinc-100">{activeLabel}</span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  )
}
