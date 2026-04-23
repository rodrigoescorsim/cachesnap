'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CustomSelect } from '@/components/custom-select'
import { CsCheckbox } from '@/components/cs-checkbox'

export type TrendComparator = 'prev_hour' | 'same_hour_prev_day' | 'day_avg'

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
  alertThresholdMs: number
  alertSensitivity: number
  alertDownEnabled: boolean
  alertAnomalyEnabled: boolean
  alertAnycastEnabled: boolean
  alertZombieCacheEnabled: boolean
  alertCacheHitEnabled: boolean
  alertCacheHitThresholdPct: number
  // Trend alerts
  alertCacheHitTrendEnabled: boolean
  alertCacheHitTrendThresholdPct: number
  alertCacheHitTrendComparators: TrendComparator[]
  alertTtfbTrendEnabled: boolean
  alertTtfbTrendThresholdPct: number
  alertTtfbTrendComparators: TrendComparator[]
  alertTtfbTrendDirection: 'worsening' | 'both'
  alertTrendMinSamples: number
  alertTrendCooldownMinutes: number
  alertTrendRequireConsecutive: boolean
  alertTrendGlobalEnabled: boolean
  alertTrendGlobalThresholdFactor: number
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
  alertThresholdMs,
  alertSensitivity,
  alertDownEnabled,
  alertAnomalyEnabled,
  alertAnycastEnabled,
  alertZombieCacheEnabled,
  alertCacheHitEnabled,
  alertCacheHitThresholdPct,
  alertCacheHitTrendEnabled,
  alertCacheHitTrendThresholdPct,
  alertCacheHitTrendComparators,
  alertTtfbTrendEnabled,
  alertTtfbTrendThresholdPct,
  alertTtfbTrendComparators,
  alertTtfbTrendDirection,
  alertTrendMinSamples,
  alertTrendCooldownMinutes,
  alertTrendRequireConsecutive,
  alertTrendGlobalEnabled,
  alertTrendGlobalThresholdFactor,
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
    alert_threshold_ms: alertThresholdMs,
    alert_sensitivity: alertSensitivity,
    alert_down_enabled: alertDownEnabled,
    alert_anomaly_enabled: alertAnomalyEnabled,
    alert_anycast_enabled: alertAnycastEnabled,
    alert_zombie_cache_enabled: alertZombieCacheEnabled,
    alert_cache_hit_enabled: alertCacheHitEnabled,
    alert_cache_hit_threshold_pct: alertCacheHitThresholdPct,
    alert_cache_hit_trend_enabled: alertCacheHitTrendEnabled,
    alert_cache_hit_trend_threshold_pct: alertCacheHitTrendThresholdPct,
    alert_cache_hit_trend_comparators: alertCacheHitTrendComparators,
    alert_ttfb_trend_enabled: alertTtfbTrendEnabled,
    alert_ttfb_trend_threshold_pct: alertTtfbTrendThresholdPct,
    alert_ttfb_trend_comparators: alertTtfbTrendComparators,
    alert_ttfb_trend_direction: alertTtfbTrendDirection,
    alert_trend_min_samples: alertTrendMinSamples,
    alert_trend_cooldown_minutes: alertTrendCooldownMinutes,
    alert_trend_require_consecutive: alertTrendRequireConsecutive,
    alert_trend_global_enabled: alertTrendGlobalEnabled,
    alert_trend_global_threshold_factor: alertTrendGlobalThresholdFactor,
  })

  // TRACKING STATE
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const lastSavedValues = useRef(values)
  const isInitialMount = useRef(true)

  // VALIDATION
  const validate = useCallback((field: string, value: any, currentValues: typeof values) => {
    if (field === 'notify_email' && currentValues.notify_email_enabled) {
      if (!value) return 'Email is required'
      if (!value.includes('@')) return 'Invalid email address'
    }
    if (field === 'notify_slack_webhook' && currentValues.notify_slack_enabled) {
      if (!value) return 'Webhook URL is required'
      if (!value.startsWith('http')) return 'Invalid webhook URL'
    }
    if (field === 'alert_threshold_ms') {
      const n = Number(value)
      if (isNaN(n) || n < 100 || n > 30000) return 'Must be between 100 and 30 000 ms'
    }
    if (field === 'alert_sensitivity') {
      if (![1, 2, 3].includes(Number(value))) return 'Invalid sensitivity'
    }
    if (field === 'alert_cache_hit_threshold_pct') {
      const n = Number(value)
      if (isNaN(n) || n < 0 || n > 100) return 'Must be between 0 and 100%'
    }
    if (field === 'alert_cache_hit_trend_threshold_pct' || field === 'alert_ttfb_trend_threshold_pct') {
      const n = Number(value)
      if (isNaN(n) || n < 1 || n > 100) return 'Must be between 1 and 100%'
    }
    if (field === 'alert_trend_min_samples') {
      const n = Number(value)
      if (isNaN(n) || n < 1 || n > 60) return 'Must be between 1 and 60'
    }
    if (field === 'alert_trend_cooldown_minutes') {
      const n = Number(value)
      if (isNaN(n) || n < 15 || n > 1440) return 'Must be between 15 and 1440 min'
    }
    if (field === 'alert_trend_global_threshold_factor') {
      const n = Number(value)
      if (isNaN(n) || n < 1.0 || n > 5.0) return 'Must be between 1.0 and 5.0'
    }
    return null
  }, [])

  // SAVING LOGIC
  const triggerSave = useCallback(async (current: typeof values) => {
    const emailErr = validate('notify_email', current.notify_email, current)
    const slackErr = validate('notify_slack_webhook', current.notify_slack_webhook, current)
    const thresholdErr = validate('alert_threshold_ms', current.alert_threshold_ms, current)
    const cacheHitErr = validate('alert_cache_hit_threshold_pct', current.alert_cache_hit_threshold_pct, current)
    const cacheHitTrendErr = validate('alert_cache_hit_trend_threshold_pct', current.alert_cache_hit_trend_threshold_pct, current)
    const ttfbTrendErr = validate('alert_ttfb_trend_threshold_pct', current.alert_ttfb_trend_threshold_pct, current)
    const minSamplesErr = validate('alert_trend_min_samples', current.alert_trend_min_samples, current)
    const cooldownErr = validate('alert_trend_cooldown_minutes', current.alert_trend_cooldown_minutes, current)

    if (emailErr || slackErr || thresholdErr || cacheHitErr || cacheHitTrendErr || ttfbTrendErr || minSamplesErr || cooldownErr) {
      setErrors(prev => ({
        ...prev,
        notify_email: emailErr,
        notify_slack_webhook: slackErr,
        alert_threshold_ms: thresholdErr,
        alert_cache_hit_threshold_pct: cacheHitErr,
        alert_cache_hit_trend_threshold_pct: cacheHitTrendErr,
        alert_ttfb_trend_threshold_pct: ttfbTrendErr,
        alert_trend_min_samples: minSamplesErr,
        alert_trend_cooldown_minutes: cooldownErr,
      }))
      return
    }

    const hasChanged = (Object.keys(current) as Array<keyof typeof current>)
      .some(k => current[k] !== lastSavedValues.current[k])

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

    const hasChangedCheck = (Object.keys(values) as Array<keyof typeof values>)
      .some(k => values[k] !== lastSavedValues.current[k])

    if (!hasChangedCheck) return

    const isTyping =
      values.name !== lastSavedValues.current.name ||
      values.notify_email !== lastSavedValues.current.notify_email ||
      values.notify_slack_webhook !== lastSavedValues.current.notify_slack_webhook ||
      values.alert_threshold_ms !== lastSavedValues.current.alert_threshold_ms ||
      values.alert_cache_hit_threshold_pct !== lastSavedValues.current.alert_cache_hit_threshold_pct ||
      values.alert_cache_hit_trend_threshold_pct !== lastSavedValues.current.alert_cache_hit_trend_threshold_pct ||
      values.alert_ttfb_trend_threshold_pct !== lastSavedValues.current.alert_ttfb_trend_threshold_pct ||
      values.alert_trend_min_samples !== lastSavedValues.current.alert_trend_min_samples ||
      values.alert_trend_cooldown_minutes !== lastSavedValues.current.alert_trend_cooldown_minutes ||
      values.alert_trend_global_threshold_factor !== lastSavedValues.current.alert_trend_global_threshold_factor

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
          {status === 'saved' && <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] shadow-[0_0_8px_rgba(34,255,136,0.5)]" />}
          {status === 'error' && <div className="w-1.5 h-1.5 rounded-full bg-red-400" />}
          {status === 'saving' ? 'Saving changes...' : 
           status === 'saved' ? 'All changes saved ✓' : 
           status === 'error' ? 'Error updating settings' : ''}
        </div>
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

        {/* ALERTS SECTION */}
        <section className="cs-card cs-card-focus p-6 md:col-span-2">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">Alert triggers</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
            {/* THRESHOLD + SENSITIVITY */}
            <div className="space-y-5">
              <div>
                <label htmlFor={`${p}-alert-threshold`} className="cs-label">
                  TTFB threshold <span className="opacity-50 ml-1">— alert when above this value</span>
                </label>
                <div className="relative">
                  <input
                    id={`${p}-alert-threshold`}
                    type="number"
                    min={100}
                    max={30000}
                    step={100}
                    value={values.alert_threshold_ms}
                    onChange={(e) => handleInputChange('alert_threshold_ms', Number(e.target.value))}
                    className="w-full h-11 cs-input pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 pointer-events-none">ms</span>
                </div>
                {errors.alert_threshold_ms && <span className="cs-error-msg">{errors.alert_threshold_ms}</span>}
                <p className="mt-1.5 text-[11px] text-zinc-600 leading-relaxed">
                  Fires a <span className="text-zinc-400 font-semibold">Down</span> alert when TTFB exceeds this value. Anomaly detection uses a separate statistical baseline independent of this threshold.
                </p>
              </div>

              <div>
                <label className="cs-label">
                  Anomaly sensitivity <span className="opacity-50 ml-1">— how easily anomalies trigger</span>
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {([
                    { value: 1, label: 'Low', sub: '5σ — extreme outliers only' },
                    { value: 2, label: 'Medium', sub: '3σ — balanced (default)' },
                    { value: 3, label: 'High', sub: '2σ — catches small deviations' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleInputChange('alert_sensitivity', opt.value)}
                      className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-center transition-all ${
                        values.alert_sensitivity === opt.value
                          ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/8 text-white shadow-[0_0_12px_rgba(34,255,136,0.08)]'
                          : 'border-white/8 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className="text-[10px] opacity-60 leading-tight">{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ALERT TYPE TOGGLES */}
            <div className="space-y-3">
              <p className="cs-label">Active alert types</p>
              <div className="space-y-3">
                {([
                  {
                    field: 'alert_down_enabled' as const,
                    label: 'Down',
                    desc: 'HTTP 5xx errors, connection timeouts, or unreachable origin.',
                  },
                  {
                    field: 'alert_anomaly_enabled' as const,
                    label: 'Anomaly',
                    desc: 'TTFB deviates more than 3× from your 7-day regional baseline.',
                  },
                  {
                    field: 'alert_anycast_enabled' as const,
                    label: 'Anycast routing',
                    desc: 'Probe served from a different PoP than the expected region — routing leak.',
                  },
                  {
                    field: 'alert_zombie_cache_enabled' as const,
                    label: 'Zombie cache',
                    desc: 'Edge content older than 24 h without revalidation.',
                  },
                ] as const).map(({ field, label, desc }) => (
                  <div key={field} className="flex items-start gap-3">
                    <CsCheckbox
                      id={`${p}-${field}`}
                      align="start"
                      checked={values[field]}
                      onChange={(e) => handleInputChange(field, e.target.checked)}
                    />
                    <label htmlFor={`${p}-${field}`} className="cursor-pointer select-none">
                      <span className="text-xs font-bold text-zinc-300 block">{label}</span>
                      <span className="text-[11px] text-zinc-600 leading-relaxed">{desc}</span>
                    </label>
                  </div>
                ))}

                {/* CACHE HIT RATE — inline threshold */}
                <div className="flex items-start gap-3">
                  <CsCheckbox
                    id={`${p}-alert_cache_hit_enabled`}
                    align="start"
                    checked={values.alert_cache_hit_enabled}
                    onChange={(e) => handleInputChange('alert_cache_hit_enabled', e.target.checked)}
                  />
                  <label htmlFor={`${p}-alert_cache_hit_enabled`} className="cursor-pointer select-none flex-1">
                    <span className="text-xs font-bold text-zinc-300 block">Cache hit rate low</span>
                    <span className="text-[11px] text-zinc-600 leading-relaxed">
                      24 h rolling average drops below threshold. Requires min. 5 probes.
                    </span>
                    <div className={`mt-2 flex items-center gap-2 transition-opacity ${values.alert_cache_hit_enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                      <span className="text-[11px] text-zinc-500">Alert when below</span>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={values.alert_cache_hit_threshold_pct}
                          onChange={(e) => handleInputChange('alert_cache_hit_threshold_pct', Number(e.target.value))}
                          disabled={!values.alert_cache_hit_enabled}
                          className={`h-8 w-20 cs-input text-xs pr-6 text-center ${errors.alert_cache_hit_threshold_pct ? 'cs-input-error' : ''}`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 pointer-events-none">%</span>
                      </div>
                      {errors.alert_cache_hit_threshold_pct && (
                        <span className="cs-error-msg">{errors.alert_cache_hit_threshold_pct}</span>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TREND ALERTS SECTION */}
        <section className="cs-card cs-card-focus p-6 md:col-span-2">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">Trend alerts</h3>
          <p className="text-[11px] text-zinc-600 mb-5 relative z-10">
            Alerts based on hourly windows (1h). Compared to the previous hour, same time yesterday, or 24h average.
            Distinct from <span className="text-zinc-400 font-semibold">Anomaly</span> (statistical σ-based detection).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
            {/* CACHE HIT TREND */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CsCheckbox
                  id={`${p}-alert_cache_hit_trend_enabled`}
                  align="start"
                  checked={values.alert_cache_hit_trend_enabled}
                  onChange={(e) => handleInputChange('alert_cache_hit_trend_enabled', e.target.checked)}
                />
                <label htmlFor={`${p}-alert_cache_hit_trend_enabled`} className="cursor-pointer select-none flex-1">
                  <span className="text-xs font-bold text-zinc-300 block">Cache hit trend</span>
                  <span className="text-[11px] text-zinc-600 leading-relaxed">
                    Alert when cache hit rate drops more than threshold% vs reference window.
                  </span>

                  <div className={`mt-3 space-y-3 transition-opacity ${values.alert_cache_hit_trend_enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500">Alert when drops more than</span>
                      <div className="relative">
                        <input
                          type="number" min={1} max={100} step={1}
                          value={values.alert_cache_hit_trend_threshold_pct}
                          onChange={(e) => handleInputChange('alert_cache_hit_trend_threshold_pct', Number(e.target.value))}
                          disabled={!values.alert_cache_hit_trend_enabled}
                          className={`h-8 w-20 cs-input text-xs pr-6 text-center ${errors.alert_cache_hit_trend_threshold_pct ? 'cs-input-error' : ''}`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 pointer-events-none">%</span>
                      </div>
                    </div>
                    {errors.alert_cache_hit_trend_threshold_pct && (
                      <span className="cs-error-msg">{errors.alert_cache_hit_trend_threshold_pct}</span>
                    )}

                    <div>
                      <span className="text-[11px] text-zinc-500 block mb-1.5">Compare against</span>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          { value: 'prev_hour' as TrendComparator, label: 'Prev hour' },
                          { value: 'same_hour_prev_day' as TrendComparator, label: 'Same time yesterday' },
                          { value: 'day_avg' as TrendComparator, label: '24h average' },
                        ]).map(opt => {
                          const active = values.alert_cache_hit_trend_comparators.includes(opt.value)
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={!values.alert_cache_hit_trend_enabled}
                              onClick={() => {
                                const current = values.alert_cache_hit_trend_comparators
                                const next = active
                                  ? current.filter(c => c !== opt.value)
                                  : [...current, opt.value]
                                if (next.length > 0) handleInputChange('alert_cache_hit_trend_comparators', next)
                              }}
                              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all border ${
                                active
                                  ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/8 text-white'
                                  : 'border-white/8 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* TTFB TREND */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CsCheckbox
                  id={`${p}-alert_ttfb_trend_enabled`}
                  align="start"
                  checked={values.alert_ttfb_trend_enabled}
                  onChange={(e) => handleInputChange('alert_ttfb_trend_enabled', e.target.checked)}
                />
                <label htmlFor={`${p}-alert_ttfb_trend_enabled`} className="cursor-pointer select-none flex-1">
                  <span className="text-xs font-bold text-zinc-300 block">TTFB trend</span>
                  <span className="text-[11px] text-zinc-600 leading-relaxed">
                    Alert when TTFB changes more than threshold% vs reference window.
                  </span>

                  <div className={`mt-3 space-y-3 transition-opacity ${values.alert_ttfb_trend_enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500">Alert when changes more than</span>
                      <div className="relative">
                        <input
                          type="number" min={1} max={100} step={1}
                          value={values.alert_ttfb_trend_threshold_pct}
                          onChange={(e) => handleInputChange('alert_ttfb_trend_threshold_pct', Number(e.target.value))}
                          disabled={!values.alert_ttfb_trend_enabled}
                          className={`h-8 w-20 cs-input text-xs pr-6 text-center ${errors.alert_ttfb_trend_threshold_pct ? 'cs-input-error' : ''}`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 pointer-events-none">%</span>
                      </div>
                    </div>
                    {errors.alert_ttfb_trend_threshold_pct && (
                      <span className="cs-error-msg">{errors.alert_ttfb_trend_threshold_pct}</span>
                    )}

                    <div>
                      <span className="text-[11px] text-zinc-500 block mb-1.5">Direction</span>
                      <div className="flex gap-1.5">
                        {([
                          { value: 'worsening' as const, label: 'Degradation only' },
                          { value: 'both' as const, label: 'Both directions' },
                        ]).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={!values.alert_ttfb_trend_enabled}
                            onClick={() => handleInputChange('alert_ttfb_trend_direction', opt.value)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all border ${
                              values.alert_ttfb_trend_direction === opt.value
                                ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/8 text-white'
                                : 'border-white/8 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-zinc-500 block mb-1.5">Compare against</span>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          { value: 'prev_hour' as TrendComparator, label: 'Prev hour' },
                          { value: 'same_hour_prev_day' as TrendComparator, label: 'Same time yesterday' },
                          { value: 'day_avg' as TrendComparator, label: '24h average' },
                        ]).map(opt => {
                          const active = values.alert_ttfb_trend_comparators.includes(opt.value)
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={!values.alert_ttfb_trend_enabled}
                              onClick={() => {
                                const current = values.alert_ttfb_trend_comparators
                                const next = active
                                  ? current.filter(c => c !== opt.value)
                                  : [...current, opt.value]
                                if (next.length > 0) handleInputChange('alert_ttfb_trend_comparators', next)
                              }}
                              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all border ${
                                active
                                  ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/8 text-white'
                                  : 'border-white/8 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* ADVANCED SETTINGS — shared between both metrics */}
          {(values.alert_cache_hit_trend_enabled || values.alert_ttfb_trend_enabled) && (
            <div className="mt-6 pt-5 border-t border-white/6 relative z-10">
              <p className="cs-label mb-3">Advanced noise control</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label htmlFor={`${p}-trend-min-samples`} className="text-[11px] text-zinc-500 block mb-1">Min samples / hour</label>
                  <input
                    id={`${p}-trend-min-samples`}
                    type="number" min={1} max={60} step={1}
                    value={values.alert_trend_min_samples}
                    onChange={(e) => handleInputChange('alert_trend_min_samples', Number(e.target.value))}
                    className={`h-8 w-full cs-input text-xs text-center ${errors.alert_trend_min_samples ? 'cs-input-error' : ''}`}
                  />
                  {errors.alert_trend_min_samples && <span className="cs-error-msg">{errors.alert_trend_min_samples}</span>}
                </div>
                <div>
                  <label htmlFor={`${p}-trend-cooldown`} className="text-[11px] text-zinc-500 block mb-1">Cooldown (min)</label>
                  <input
                    id={`${p}-trend-cooldown`}
                    type="number" min={15} max={1440} step={15}
                    value={values.alert_trend_cooldown_minutes}
                    onChange={(e) => handleInputChange('alert_trend_cooldown_minutes', Number(e.target.value))}
                    className={`h-8 w-full cs-input text-xs text-center ${errors.alert_trend_cooldown_minutes ? 'cs-input-error' : ''}`}
                  />
                  {errors.alert_trend_cooldown_minutes && <span className="cs-error-msg">{errors.alert_trend_cooldown_minutes}</span>}
                </div>
                <div className="flex flex-col justify-end">
                  <div className="flex items-center gap-2 h-8">
                    <CsCheckbox
                      id={`${p}-trend-require-consecutive`}
                      checked={values.alert_trend_require_consecutive}
                      onChange={(e) => handleInputChange('alert_trend_require_consecutive', e.target.checked)}
                    />
                    <label htmlFor={`${p}-trend-require-consecutive`} className="text-[11px] text-zinc-400 cursor-pointer select-none leading-tight">
                      Require 2 consecutive windows
                    </label>
                  </div>
                </div>
                <div className="flex flex-col justify-end">
                  <div className="flex items-center gap-2 h-8">
                    <CsCheckbox
                      id={`${p}-trend-global-enabled`}
                      checked={values.alert_trend_global_enabled}
                      onChange={(e) => handleInputChange('alert_trend_global_enabled', e.target.checked)}
                    />
                    <label htmlFor={`${p}-trend-global-enabled`} className="text-[11px] text-zinc-400 cursor-pointer select-none leading-tight">
                      Global aggregate alert
                    </label>
                  </div>
                </div>
              </div>

              {values.alert_trend_global_enabled && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500">Global threshold multiplier</span>
                  <input
                    type="number" min={1.0} max={5.0} step={0.1}
                    value={values.alert_trend_global_threshold_factor}
                    onChange={(e) => handleInputChange('alert_trend_global_threshold_factor', Number(e.target.value))}
                    className={`h-8 w-20 cs-input text-xs text-center ${errors.alert_trend_global_threshold_factor ? 'cs-input-error' : ''}`}
                  />
                  <span className="text-[10px] text-zinc-600">× base threshold (higher = less sensitive)</span>
                  {errors.alert_trend_global_threshold_factor && (
                    <span className="cs-error-msg">{errors.alert_trend_global_threshold_factor}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* NOTIFICATIONS SECTION */}
        <section className="cs-card cs-card-focus p-6 md:col-span-2">
          <div className="cs-card-wash" />
          <h3 className="cs-section-header">Notifications</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CsCheckbox
                  id={`${p}-notify-email-toggle`}
                  checked={values.notify_email_enabled}
                  onChange={(e) => handleInputChange('notify_email_enabled', e.target.checked)}
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
                <CsCheckbox
                  id={`${p}-notify-slack-toggle`}
                  checked={values.notify_slack_enabled}
                  onChange={(e) => handleInputChange('notify_slack_enabled', e.target.checked)}
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

