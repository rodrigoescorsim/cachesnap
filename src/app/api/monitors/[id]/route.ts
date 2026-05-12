import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

const VALID_COMPARATORS = ['prev_hour', 'same_hour_prev_day', 'day_avg'] as const

const updateSchema = z.object({
  name: z.string().max(100).optional(),
  check_interval_seconds: z.number().int().min(1).optional(),
  audit_interval_seconds: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  notify_email: z.string().email().max(254).nullable().optional(),
  notify_email_enabled: z.boolean().optional(),
  notify_slack_webhook: z.string().url().max(500).nullable().optional(),
  notify_slack_enabled: z.boolean().optional(),
  alert_threshold_ms: z.number().int().min(100).max(30000).optional(),
  alert_threshold_hit_ms: z.number().int().min(50).max(30000).optional(),
  alert_sensitivity: z.number().int().min(1).max(3).optional(),
  alert_down_enabled: z.boolean().optional(),
  alert_ttfb_enabled: z.boolean().optional(),
  alert_ttfb_anomaly_enabled: z.boolean().optional(),
  alert_anycast_enabled: z.boolean().optional(),
  alert_cache_age_enabled: z.boolean().optional(),
  alert_cache_age_threshold_hours: z.number().int().min(1).max(8760).optional(),
  alert_cache_hit_enabled: z.boolean().optional(),
  alert_cache_hit_threshold_pct: z.number().min(0).max(100).optional(),
  cache_hit_critical_pct: z.number().min(0).max(100).optional(),
  // Trend alerts
  alert_cache_hit_trend_enabled: z.boolean().optional(),
  alert_cache_hit_trend_threshold_pp: z.number().min(0.5).max(100).optional(),
  alert_cache_hit_trend_comparators: z.array(z.enum(VALID_COMPARATORS)).min(1).optional(),
  alert_ttfb_trend_enabled: z.boolean().optional(),
  alert_ttfb_trend_threshold_pct: z.number().min(1).max(100).optional(),
  alert_ttfb_trend_comparators: z.array(z.enum(VALID_COMPARATORS)).min(1).optional(),
  alert_ttfb_trend_direction: z.enum(['worsening', 'both']).optional(),
  alert_trend_min_samples: z.number().int().min(1).max(60).optional(),
  alert_trend_cooldown_minutes: z.number().int().min(15).max(1440).optional(),
  alert_trend_require_consecutive: z.boolean().optional(),
  alert_trend_global_enabled: z.boolean().optional(),
  alert_trend_global_threshold_factor: z.number().min(1.0).max(5.0).optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return unauthorized()

  const { id } = await params
  const [monitor] = await sql`
    SELECT id, url, name, check_interval_seconds, audit_interval_seconds, is_active,
           notify_email, notify_email_enabled, notify_slack_webhook, notify_slack_enabled,
           alert_threshold_ms, alert_threshold_hit_ms, alert_sensitivity, alert_down_enabled, alert_ttfb_enabled, alert_ttfb_anomaly_enabled,
           alert_anycast_enabled, alert_cache_age_enabled, alert_cache_age_threshold_hours,
           alert_cache_hit_enabled, alert_cache_hit_threshold_pct, cache_hit_critical_pct,
           alert_cache_hit_trend_enabled, alert_cache_hit_trend_threshold_pp, alert_cache_hit_trend_comparators,
           alert_ttfb_trend_enabled, alert_ttfb_trend_threshold_pct, alert_ttfb_trend_comparators,
           alert_ttfb_trend_direction, alert_trend_min_samples, alert_trend_cooldown_minutes,
           alert_trend_require_consecutive, alert_trend_global_enabled, alert_trend_global_threshold_factor,
           created_at
    FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
  `

  if (!monitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(monitor)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return unauthorized()

  const { id } = await params
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const {
    name, check_interval_seconds, audit_interval_seconds, is_active,
    notify_email, notify_email_enabled,
    notify_slack_webhook, notify_slack_enabled,
    alert_threshold_ms, alert_threshold_hit_ms, alert_sensitivity,
    alert_down_enabled, alert_ttfb_enabled, alert_ttfb_anomaly_enabled,
    alert_anycast_enabled, alert_cache_age_enabled, alert_cache_age_threshold_hours,
    alert_cache_hit_enabled, alert_cache_hit_threshold_pct, cache_hit_critical_pct,
    alert_cache_hit_trend_enabled, alert_cache_hit_trend_threshold_pp, alert_cache_hit_trend_comparators,
    alert_ttfb_trend_enabled, alert_ttfb_trend_threshold_pct, alert_ttfb_trend_comparators,
    alert_ttfb_trend_direction, alert_trend_min_samples, alert_trend_cooldown_minutes,
    alert_trend_require_consecutive, alert_trend_global_enabled, alert_trend_global_threshold_factor,
  } = parsed.data

  const allUndefined = [
    name, check_interval_seconds, audit_interval_seconds, is_active,
    notify_email, notify_email_enabled, notify_slack_webhook, notify_slack_enabled,
    alert_threshold_ms, alert_threshold_hit_ms, alert_sensitivity, alert_down_enabled, alert_ttfb_enabled, alert_ttfb_anomaly_enabled,
    alert_anycast_enabled, alert_cache_age_enabled, alert_cache_age_threshold_hours,
    alert_cache_hit_enabled, alert_cache_hit_threshold_pct, cache_hit_critical_pct,
    alert_cache_hit_trend_enabled, alert_cache_hit_trend_threshold_pp, alert_cache_hit_trend_comparators,
    alert_ttfb_trend_enabled, alert_ttfb_trend_threshold_pct, alert_ttfb_trend_comparators,
    alert_ttfb_trend_direction, alert_trend_min_samples, alert_trend_cooldown_minutes,
    alert_trend_require_consecutive, alert_trend_global_enabled, alert_trend_global_threshold_factor,
  ].every(v => v === undefined)

  if (allUndefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const [monitor] = await sql`
    UPDATE monitors
    SET
      name                        = COALESCE(${name ?? null}, name),
      check_interval_seconds      = COALESCE(${check_interval_seconds ?? null}, check_interval_seconds),
      audit_interval_seconds      = COALESCE(${audit_interval_seconds ?? null}, audit_interval_seconds),
      is_active                   = COALESCE(${is_active ?? null}, is_active),
      notify_email                = CASE WHEN ${notify_email !== undefined} THEN ${notify_email ?? null} ELSE notify_email END,
      notify_email_enabled        = COALESCE(${notify_email_enabled ?? null}, notify_email_enabled),
      notify_slack_webhook        = CASE WHEN ${notify_slack_webhook !== undefined} THEN ${notify_slack_webhook ?? null} ELSE notify_slack_webhook END,
      notify_slack_enabled        = COALESCE(${notify_slack_enabled ?? null}, notify_slack_enabled),
      alert_threshold_ms          = COALESCE(${alert_threshold_ms ?? null}, alert_threshold_ms),
      alert_threshold_hit_ms      = COALESCE(${alert_threshold_hit_ms ?? null}, alert_threshold_hit_ms),
      alert_sensitivity           = COALESCE(${alert_sensitivity ?? null}, alert_sensitivity),
      alert_down_enabled          = COALESCE(${alert_down_enabled ?? null}, alert_down_enabled),
      alert_ttfb_enabled          = COALESCE(${alert_ttfb_enabled ?? null}, alert_ttfb_enabled),
      alert_ttfb_anomaly_enabled       = COALESCE(${alert_ttfb_anomaly_enabled ?? null}, alert_ttfb_anomaly_enabled),
      alert_anycast_enabled       = COALESCE(${alert_anycast_enabled ?? null}, alert_anycast_enabled),
      alert_cache_age_enabled       = COALESCE(${alert_cache_age_enabled ?? null}, alert_cache_age_enabled),
      alert_cache_age_threshold_hours  = COALESCE(${alert_cache_age_threshold_hours ?? null}, alert_cache_age_threshold_hours),
      alert_cache_hit_enabled          = COALESCE(${alert_cache_hit_enabled ?? null}, alert_cache_hit_enabled),
      alert_cache_hit_threshold_pct    = COALESCE(${alert_cache_hit_threshold_pct ?? null}, alert_cache_hit_threshold_pct),
      cache_hit_critical_pct           = COALESCE(${cache_hit_critical_pct ?? null}, cache_hit_critical_pct),
      alert_cache_hit_trend_enabled        = COALESCE(${alert_cache_hit_trend_enabled ?? null}, alert_cache_hit_trend_enabled),
      alert_cache_hit_trend_threshold_pp  = COALESCE(${alert_cache_hit_trend_threshold_pp ?? null}, alert_cache_hit_trend_threshold_pp),
      alert_cache_hit_trend_comparators    = COALESCE(${alert_cache_hit_trend_comparators ?? null}, alert_cache_hit_trend_comparators),
      alert_ttfb_trend_enabled             = COALESCE(${alert_ttfb_trend_enabled ?? null}, alert_ttfb_trend_enabled),
      alert_ttfb_trend_threshold_pct       = COALESCE(${alert_ttfb_trend_threshold_pct ?? null}, alert_ttfb_trend_threshold_pct),
      alert_ttfb_trend_comparators         = COALESCE(${alert_ttfb_trend_comparators ?? null}, alert_ttfb_trend_comparators),
      alert_ttfb_trend_direction           = COALESCE(${alert_ttfb_trend_direction ?? null}, alert_ttfb_trend_direction),
      alert_trend_min_samples              = COALESCE(${alert_trend_min_samples ?? null}, alert_trend_min_samples),
      alert_trend_cooldown_minutes         = COALESCE(${alert_trend_cooldown_minutes ?? null}, alert_trend_cooldown_minutes),
      alert_trend_require_consecutive      = COALESCE(${alert_trend_require_consecutive ?? null}, alert_trend_require_consecutive),
      alert_trend_global_enabled           = COALESCE(${alert_trend_global_enabled ?? null}, alert_trend_global_enabled),
      alert_trend_global_threshold_factor  = COALESCE(${alert_trend_global_threshold_factor ?? null}, alert_trend_global_threshold_factor)
    WHERE id = ${id} AND user_id = ${user.id}
    RETURNING id, url, name, check_interval_seconds, audit_interval_seconds, is_active,
              notify_email, notify_email_enabled, notify_slack_webhook, notify_slack_enabled,
              alert_threshold_ms, alert_threshold_hit_ms, alert_sensitivity,
              alert_down_enabled, alert_ttfb_enabled, alert_ttfb_anomaly_enabled,
              alert_anycast_enabled, alert_cache_age_enabled, alert_cache_age_threshold_hours,
              alert_cache_hit_enabled, alert_cache_hit_threshold_pct, cache_hit_critical_pct,
              alert_cache_hit_trend_enabled, alert_cache_hit_trend_threshold_pp, alert_cache_hit_trend_comparators,
              alert_ttfb_trend_enabled, alert_ttfb_trend_threshold_pct, alert_ttfb_trend_comparators,
              alert_ttfb_trend_direction, alert_trend_min_samples, alert_trend_cooldown_minutes,
              alert_trend_require_consecutive, alert_trend_global_enabled, alert_trend_global_threshold_factor,
              created_at
  `

  if (!monitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(monitor)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return unauthorized()

  const { id } = await params
  const result = await sql`
    DELETE FROM monitors WHERE id = ${id} AND user_id = ${user.id} RETURNING id
  `

  if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
