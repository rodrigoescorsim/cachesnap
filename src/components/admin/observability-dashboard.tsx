'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  Server,
  Zap,
  Activity,
  Package,
  Users,
  AlertTriangle,
  BarChart2,
  Layers,
  Database,
  HardDrive,
  Cpu,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = 'healthy' | 'warning' | 'critical' | 'unknown'
type TimeWindow = '15m' | '1h' | '24h' | '7d'

interface ServiceEntry {
  name: string
  status: Status
  latency_ms?: number
  last_seen?: string
  detail?: string
}

interface ProviderEntry {
  name: string
  status: Status
  detail?: string
  error_count_15m: number | null
}

interface SloEntry {
  name: string
  key: string
  value: number | null
  target: number
  unit: string
  status: Status
  note: string | null
}

interface RegionIngest {
  region: string
  total: number
  success: number
  failed: number
}

interface RegionProbe {
  region: string
  probe_count: number
  avg_ttfb_ms: number | null
  p95_ttfb_ms: number | null
  last_seen: string | null
}

interface RegionFleet {
  region: string
  version: string | null
  is_canonical: boolean
  last_seen: string | null
}

interface AlertByType {
  alert_type: string
  total: number
  delivered: number
  failed: number
}

interface TenantEntry {
  tenant_id: string
  probe_count?: number
  monitor_count?: number
}

interface OverviewData {
  regions: string[]
  data: {
    status: Status
    active_monitors: number
    recent_probes_5m: number
    regions_active: number
    regions_silent: string[]
    last_updated: string
  }
}

interface ServicesData {
  regions: string[]
  data: { services: ServiceEntry[] }
}

interface ProvidersData {
  regions: string[]
  data: { has_critical: boolean; providers: ProviderEntry[] }
}

interface SloData {
  data: {
    window: string
    slos: SloEntry[]
    total_probes: number
    slo_breach_count: number
  }
}

interface IngestData {
  regions: string[]
  data: {
    window: string
    total: number
    success: number
    failed: number
    success_rate: number | null
    by_region: RegionIngest[]
  }
}

interface ProbesData {
  regions: string[]
  data: {
    window: string
    by_region: RegionProbe[]
    silent_regions: string[]
  }
}

interface FleetData {
  regions: string[]
  data: {
    canonical_version: string | null
    drift_count: number
    by_region: RegionFleet[]
  }
}

interface DeliveryData {
  data: {
    window: string
    total_alerts: number
    by_type: AlertByType[]
    delivery_rate: number | null
    failed_deliveries: number | null
    mean_delivery_latency_ms: number | null
  }
}

interface TenantsData {
  data: {
    active_tenants_24h: number
    inactive_tenants_24h: number
    total_monitors_active: number
    monitors_orphaned_count: number
    monitors_with_alerts_24h: number
    top_consumers: TenantEntry[]
    inactive_tenants: TenantEntry[]
  }
}

interface DbConnectionData {
  total: number
  active: number
  idle: number
  waiting: number
  max: number
  pool_usage_pct: number | null
  status: Status
}

interface DbSizeData {
  bytes: number | null
  pretty: string
  growth_bytes_24h: number | null
  estimated_days_to_capacity: number | null
}

interface DbTableEntry {
  table_name: string
  total_size: string
  row_estimate: number
}

interface DbSummaryData {
  data: {
    connections: DbConnectionData
    query_latency: {
      p50_ms: number | null
      p95_ms: number | null
      tracked_queries: number
      available: boolean
    }
    size: DbSizeData
    top_tables: DbTableEntry[]
  }
}

interface DbLocksData {
  data: {
    status: Status
    summary: {
      long_running_count: number
      blocked_count: number
      idle_in_transaction_count: number
    }
    long_running_queries: { pid: number; duration_s: number; state: string; query_preview: string }[]
    blocked_locks: { pid: number; blocking_pid: number; relation: string; lock_type: string; duration_s: number }[]
  }
}

interface MemoryData {
  usage_pct: null
  db_cache_hit_ratio: number | null
  db_cache_status: Status
  blks_hit: number | null
  blks_read: number | null
  source: string
}

interface DiskTablespace {
  tablespace: string
  size_bytes: number
  size_pretty: string
}

interface SystemResourcesData {
  data: {
    cpu: { usage_pct: null; source: string }
    memory: MemoryData
    disk: { tablespaces: DiskTablespace[]; free_pct: null; source: string }
    io: {
      buffers_clean: number | null
      buffers_checkpoint: number | null
      buffers_backend: number | null
      maxwritten_clean: number | null
      pressure_signal: boolean | null
      source: string
    }
    network: { rx_bytes_per_sec: null; tx_bytes_per_sec: null; source: string }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DOT_CLASS: Record<Status, string> = {
  healthy: 'bg-emerald-400',
  warning: 'bg-amber-400 animate-pulse',
  critical: 'bg-rose-500 animate-pulse',
  unknown: 'bg-zinc-600',
}

const TEXT_CLASS: Record<Status, string> = {
  healthy: 'text-emerald-400',
  warning: 'text-amber-400',
  critical: 'text-rose-500',
  unknown: 'text-zinc-500',
}

const BADGE_CLASS: Record<Status, string> = {
  healthy: 'cs-badge cs-badge-success',
  warning: 'cs-badge cs-badge-warning',
  critical: 'cs-badge cs-badge-error',
  unknown: 'cs-badge cs-badge-muted',
}

function formatAge(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  return `${Math.floor(sec / 3600)}h ago`
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: Status }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[status]}`}
      aria-label={status}
    />
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`cs-skeleton rounded-xl ${className || 'h-20 w-full'}`} />
}

function SectionTitle({
  icon: Icon,
  title,
  badge,
}: {
  icon: React.ElementType
  title: string
  badge?: string
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <div className="rounded-md border border-white/5 bg-white/[0.04] p-1.5 text-zinc-500">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </div>
      <h2 className="text-[11px] font-black uppercase tracking-widest text-zinc-500">{title}</h2>
      {badge && <span className="cs-badge cs-badge-muted text-[9px]">{badge}</span>}
    </div>
  )
}

// ─── Service Health ───────────────────────────────────────────────────────────

function ServiceHealthSection({
  data,
  loading,
}: {
  data: ServicesData | null
  loading: boolean
}) {
  if (loading) {
    return (
      <section>
        <SectionTitle icon={Server} title="Service Health" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </section>
    )
  }
  if (!data) {
    return (
      <section>
        <SectionTitle icon={Server} title="Service Health" />
        <p className="py-4 text-[12px] text-zinc-600">Data unavailable — auto-retry in 30s.</p>
      </section>
    )
  }

  const core = data.data.services.filter(s => !s.name.startsWith('Worker'))
  const workers = data.data.services.filter(s => s.name.startsWith('Worker'))
  const healthyCount = data.data.services.filter(s => s.status === 'healthy').length

  return (
    <section>
      <SectionTitle
        icon={Server}
        title="Service Health"
        badge={`${healthyCount}/${data.data.services.length}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-3">
        {core.map(svc => (
          <div key={svc.name} className="cs-card px-4 py-3">
            <div className="cs-card-wash" />
            <div className="relative z-10 flex items-center justify-between gap-2 mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 leading-none">
                {svc.name}
              </p>
              <StatusDot status={svc.status} />
            </div>
            <div className="relative z-10">
              {svc.latency_ms !== undefined ? (
                <p className="text-[22px] font-black tabular-nums leading-none text-zinc-100">
                  {svc.latency_ms}
                  <span className="text-[12px] font-medium text-zinc-500">ms</span>
                </p>
              ) : (
                <p className={`text-[13px] font-semibold ${TEXT_CLASS[svc.status]}`}>
                  {svc.status}
                </p>
              )}
              {svc.detail && (
                <p className="mt-0.5 text-[11px] text-zinc-600">{svc.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {workers.length > 0 && (
        <div className="cs-card px-4 py-3">
          <div className="cs-card-wash" />
          <p className="relative z-10 mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Workers by Region
          </p>
          <div className="relative z-10 space-y-2">
            {workers.map(w => (
              <div key={w.name} className="flex items-center gap-2.5">
                <StatusDot status={w.status} />
                <span className="min-w-[100px] text-[12px] font-semibold text-zinc-300">
                  {w.name.replace('Worker ', '')}
                </span>
                <span className="text-[11px] text-zinc-500">{w.detail ?? w.status}</span>
                {w.last_seen && (
                  <span className="ml-auto text-[10px] text-zinc-700">
                    {formatAge(new Date(w.last_seen))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ─── External Providers ───────────────────────────────────────────────────────

function ProvidersSection({
  data,
  loading,
}: {
  data: ProvidersData | null
  loading: boolean
}) {
  if (loading) {
    return (
      <section>
        <SectionTitle icon={Zap} title="External Providers" />
        <Skeleton />
      </section>
    )
  }
  if (!data) {
    return (
      <section>
        <SectionTitle icon={Zap} title="External Providers" />
        <p className="py-4 text-[12px] text-zinc-600">Data unavailable — auto-retry in 30s.</p>
      </section>
    )
  }

  return (
    <section>
      <SectionTitle icon={Zap} title="External Providers" />
      <div className="cs-card overflow-hidden">
        <div className="cs-card-wash" />
        <div className="relative z-10 divide-y divide-border/60">
          {data.data.providers.map(p => (
            <div key={p.name} className="flex items-center gap-3 px-4 py-3">
              <StatusDot status={p.status} />
              <span className="min-w-[140px] text-[13px] font-semibold text-zinc-300">
                {p.name}
              </span>
              <span className={BADGE_CLASS[p.status]}>{p.status}</span>
              <span className="ml-auto text-[11px] text-zinc-500">{p.detail ?? ''}</span>
              {p.error_count_15m !== null && p.error_count_15m > 0 && (
                <span className="cs-badge cs-badge-error text-[9px]">
                  {p.error_count_15m} err
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Platform SLO ────────────────────────────────────────────────────────────

function SloSection({ data, loading }: { data: SloData | null; loading: boolean }) {
  if (loading) {
    return (
      <section>
        <SectionTitle icon={Activity} title="Platform SLO" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </section>
    )
  }
  if (!data) {
    return (
      <section>
        <SectionTitle icon={Activity} title="Platform SLO" />
        <p className="py-4 text-[12px] text-zinc-600">Data unavailable — auto-retry in 30s.</p>
      </section>
    )
  }

  return (
    <section>
      <SectionTitle
        icon={Activity}
        title="Platform SLO"
        badge={`${data.data.total_probes.toLocaleString()} probes · ${data.data.window}`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.data.slos.map(s => (
          <div key={s.key} className="cs-card px-4 py-4">
            <div className="cs-card-wash" />
            <div className="relative z-10 mb-2 flex items-start justify-between gap-2">
              <p className="text-[9px] font-black uppercase leading-tight tracking-widest text-zinc-500">
                {s.name}
              </p>
              <StatusDot status={s.status} />
            </div>
            <div className="relative z-10">
              {s.value !== null ? (
                <p
                  className={`text-[26px] font-black tabular-nums leading-none ${TEXT_CLASS[s.status]}`}
                >
                  {Number(s.value).toFixed(1)}
                  <span className="text-[14px] font-medium text-zinc-500">{s.unit}</span>
                </p>
              ) : (
                <p className="text-[20px] font-black leading-none text-zinc-700">N/A</p>
              )}
              <p className="mt-1 text-[10px] text-zinc-600">
                target: {s.target}
                {s.unit}
              </p>
              {s.note && (
                <p className="mt-0.5 text-[9px] leading-tight text-zinc-700">{s.note}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

function PipelineSection({
  ingest,
  probes,
  loading,
}: {
  ingest: IngestData | null
  probes: ProbesData | null
  loading: boolean
}) {
  if (loading) {
    return (
      <section>
        <SectionTitle icon={BarChart2} title="Pipeline & Ingest" />
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </section>
    )
  }
  if (!ingest && !probes) {
    return (
      <section>
        <SectionTitle icon={BarChart2} title="Pipeline & Ingest" />
        <p className="py-4 text-[12px] text-zinc-600">Data unavailable — auto-retry in 30s.</p>
      </section>
    )
  }

  return (
    <section>
      <SectionTitle icon={BarChart2} title="Pipeline & Ingest" />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="cs-card px-4 py-4">
          <div className="cs-card-wash" />
          <p className="relative z-10 mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Ingest Overview
          </p>
          {ingest ? (
            <div className="relative z-10 space-y-2">
              {[
                ['Total probes', ingest.data.total.toLocaleString(), 'text-zinc-100'],
                ['Success', ingest.data.success.toLocaleString(), 'text-emerald-400'],
                [
                  'Errors',
                  ingest.data.failed.toLocaleString(),
                  ingest.data.failed > 0 ? 'text-rose-400' : 'text-zinc-600',
                ],
              ].map(([label, val, cls]) => (
                <div key={label} className="flex justify-between text-[13px]">
                  <span className="text-zinc-400">{label}</span>
                  <span className={`font-bold tabular-nums ${cls}`}>{val}</span>
                </div>
              ))}
              {ingest.data.success_rate !== null && (
                <div className="flex justify-between border-t border-border/60 pt-2 text-[13px]">
                  <span className="text-zinc-400">Success rate</span>
                  <span
                    className={`font-bold tabular-nums ${
                      ingest.data.success_rate >= 99
                        ? 'text-emerald-400'
                        : ingest.data.success_rate >= 95
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {Number(ingest.data.success_rate).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="relative z-10 text-[12px] text-zinc-600">No data</p>
          )}
        </div>

        <div className="cs-card px-4 py-4">
          <div className="cs-card-wash" />
          <p className="relative z-10 mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Volume by Region
          </p>
          {probes ? (
            <div className="relative z-10 space-y-2">
              {probes.data.by_region.map(r => (
                <div key={r.region} className="flex items-center gap-2">
                  <span className="min-w-[80px] text-[11px] font-semibold text-zinc-400">
                    {r.region}
                  </span>
                  <span className="text-[12px] font-bold tabular-nums text-zinc-200">
                    {r.probe_count}
                  </span>
                  {r.avg_ttfb_ms !== null && (
                    <span className="text-[10px] text-zinc-600">
                      avg {r.avg_ttfb_ms}ms
                    </span>
                  )}
                  {probes.data.silent_regions.includes(r.region) && (
                    <span className="cs-badge cs-badge-warning ml-auto text-[9px]">silent</span>
                  )}
                </div>
              ))}
              {probes.data.silent_regions
                .filter(r => !probes.data.by_region.find(b => b.region === r))
                .map(r => (
                  <div key={r} className="flex items-center gap-2">
                    <span className="min-w-[80px] text-[11px] font-semibold text-zinc-600">
                      {r}
                    </span>
                    <span className="cs-badge cs-badge-warning text-[9px]">silent</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="relative z-10 text-[12px] text-zinc-600">No data</p>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Fleet Health ─────────────────────────────────────────────────────────────

function FleetSection({ data, loading }: { data: FleetData | null; loading: boolean }) {
  if (loading) {
    return (
      <section>
        <SectionTitle icon={Package} title="Lambda Fleet" />
        <Skeleton className="h-40 w-full" />
      </section>
    )
  }
  if (!data) {
    return (
      <section>
        <SectionTitle icon={Package} title="Lambda Fleet" />
        <p className="py-4 text-[12px] text-zinc-600">Data unavailable — auto-retry in 30s.</p>
      </section>
    )
  }

  const { canonical_version, drift_count, by_region } = data.data

  return (
    <section>
      <SectionTitle
        icon={Package}
        title="Lambda Fleet"
        badge={drift_count > 0 ? `${drift_count} drift` : undefined}
      />
      <div className="cs-card overflow-hidden">
        <div className="cs-card-wash" />
        <div className="relative z-10 flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <span className="text-[10px] text-zinc-500">Canonical:</span>
          <span className="font-mono text-[12px] font-bold text-zinc-100">
            {canonical_version ?? 'unknown'}
          </span>
          {drift_count > 0 && (
            <span className="cs-badge cs-badge-warning text-[9px]">
              {drift_count} region{drift_count !== 1 ? 's' : ''} drifted
            </span>
          )}
        </div>
        <div className="relative z-10 divide-y divide-border/40">
          {by_region.map(r => {
            const regionStatus: Status =
              r.version === null ? 'unknown' : r.is_canonical ? 'healthy' : 'warning'
            return (
              <div key={r.region} className="flex items-center gap-3 px-4 py-2.5">
                <StatusDot status={regionStatus} />
                <span className="min-w-[100px] text-[12px] font-semibold text-zinc-300">
                  {r.region}
                </span>
                <span
                  className={`font-mono text-[12px] ${
                    r.is_canonical ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {r.version ?? '—'}
                </span>
                {!r.is_canonical && r.version && (
                  <span className="cs-badge cs-badge-warning text-[9px]">outdated</span>
                )}
                {r.last_seen && (
                  <span className="ml-auto text-[10px] text-zinc-700">
                    {formatAge(new Date(r.last_seen))}
                  </span>
                )}
              </div>
            )
          })}
          {/* Regions with no recent data */}
          {data.regions
            .filter(id => !by_region.find(r => r.region === id))
            .map(id => (
              <div key={id} className="flex items-center gap-3 px-4 py-2.5">
                <StatusDot status="unknown" />
                <span className="min-w-[100px] text-[12px] font-semibold text-zinc-600">{id}</span>
                <span className="text-[12px] text-zinc-700">no recent data</span>
                <span className="cs-badge cs-badge-muted ml-2 text-[9px]">legacy</span>
              </div>
            ))}
        </div>
      </div>
    </section>
  )
}

// ─── Alerting Delivery ────────────────────────────────────────────────────────

function DeliverySection({ data, loading }: { data: DeliveryData | null; loading: boolean }) {
  if (loading) {
    return (
      <section>
        <SectionTitle icon={Layers} title="Alerting Delivery" />
        <Skeleton className="h-28 w-full" />
      </section>
    )
  }
  if (!data) {
    return (
      <section>
        <SectionTitle icon={Layers} title="Alerting Delivery" />
        <p className="py-4 text-[12px] text-zinc-600">Data unavailable — auto-retry in 30s.</p>
      </section>
    )
  }

  const rate = data.data.delivery_rate
  const total = data.data.total_alerts
  const failed = data.data.failed_deliveries ?? data.data.by_type.reduce((sum, t) => sum + t.failed, 0)
  const delivered = Math.max(0, total - failed)
  const latency = data.data.mean_delivery_latency_ms

  return (
    <section>
      <SectionTitle icon={Layers} title="Alerting Delivery" />
      <div className="cs-card px-4 py-4">
        <div className="cs-card-wash" />
        <div className="relative z-10 mb-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div>
            <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
              Attempts
            </p>
            <p className="text-[22px] font-black tabular-nums text-zinc-100">
              {total}
            </p>
          </div>
          <div>
            <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
              Delivered
            </p>
            <p className="text-[22px] font-black tabular-nums text-emerald-400">
              {delivered}
            </p>
          </div>
          <div>
            <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
              Failed
            </p>
            <p className={`text-[22px] font-black tabular-nums ${failed > 0 ? 'text-rose-400' : 'text-zinc-600'}`}>
              {failed}
            </p>
          </div>
          <div>
            <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
              Delivery
            </p>
            {rate !== null ? (
              <p
                className={`text-[22px] font-black tabular-nums ${
                  rate >= 99 ? 'text-emerald-400' : rate >= 95 ? 'text-amber-400' : 'text-rose-400'
                }`}
              >
                {rate.toFixed(1)}%
              </p>
            ) : (
              <p className="text-[22px] font-black text-zinc-700">N/A</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
              Avg Latency
            </p>
            {latency !== null ? (
              <p className="text-[22px] font-black tabular-nums text-zinc-300">
                {latency}
                <span className="text-[12px] font-medium text-zinc-500">ms</span>
              </p>
            ) : (
              <p className="text-[22px] font-black text-zinc-700">N/A</p>
            )}
          </div>
        </div>
        <p className="relative z-10 mb-3 border-t border-border/60 pt-3 text-[10px] text-zinc-600">
          Window: {data.data.window}
        </p>
        {data.data.by_type.length > 0 && (
          <div className="relative z-10 space-y-1.5">
            {data.data.by_type.map(t => (
              <div key={t.alert_type} className="flex items-center gap-3 text-[11px]">
                <span className="min-w-[80px] capitalize text-zinc-500">{t.alert_type}</span>
                <span className="font-bold tabular-nums text-zinc-300">{t.total}</span>
                <span className="tabular-nums text-emerald-400/80">{t.delivered} delivered</span>
                {t.failed > 0 && (
                  <span className="tabular-nums text-rose-400">{t.failed} failed</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Tenant Activity ──────────────────────────────────────────────────────────

function TenantsSection({ data, loading }: { data: TenantsData | null; loading: boolean }) {
  if (loading) {
    return (
      <section>
        <SectionTitle icon={Users} title="Tenant Activity" />
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </section>
    )
  }
  if (!data) {
    return (
      <section>
        <SectionTitle icon={Users} title="Tenant Activity" />
        <p className="py-4 text-[12px] text-zinc-600">Data unavailable — auto-retry in 30s.</p>
      </section>
    )
  }

  const { data: d } = data

  return (
    <section>
      <SectionTitle icon={Users} title="Tenant Activity" />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="cs-card px-4 py-4">
          <div className="cs-card-wash" />
          <p className="relative z-10 mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Overview (24h)
          </p>
          <div className="relative z-10 space-y-2">
            {[
              ['Active tenants', d.active_tenants_24h, 'text-emerald-400'],
              [
                'Inactive tenants',
                d.inactive_tenants_24h,
                d.inactive_tenants_24h > 0 ? 'text-amber-400' : 'text-zinc-600',
              ],
              ['Active monitors', d.total_monitors_active, 'text-zinc-300'],
              ['Orphaned monitors', d.monitors_orphaned_count, d.monitors_orphaned_count > 0 ? 'text-amber-400' : 'text-zinc-600'],
              [
                'Monitors with alerts',
                d.monitors_with_alerts_24h,
                d.monitors_with_alerts_24h > 0 ? 'text-rose-400' : 'text-zinc-600',
              ],
            ].map(([label, val, cls]) => (
              <div key={label as string} className="flex justify-between text-[13px]">
                <span className="text-zinc-400">{label}</span>
                <span className={`font-bold tabular-nums ${cls}`}>{val as number}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="cs-card px-4 py-4">
          <div className="cs-card-wash" />
          <div className="relative z-10 mb-3 flex items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Inactive Tenants
            </p>
            {d.inactive_tenants.length > 0 && (
              <span className="cs-badge cs-badge-warning text-[9px]">
                {d.inactive_tenants.length}
              </span>
            )}
          </div>
          {d.inactive_tenants.length === 0 ? (
            <p className="relative z-10 text-[12px] text-emerald-400/80">All tenants active</p>
          ) : (
            <div className="relative z-10 space-y-1.5">
              {d.inactive_tenants.slice(0, 6).map(t => (
                <div key={t.tenant_id} className="flex items-center gap-2">
                  <span className="truncate font-mono text-[10px] text-zinc-500">
                    {t.tenant_id.slice(0, 8)}…
                  </span>
                  <span className="ml-auto text-[10px] text-zinc-600">
                    {t.monitor_count} monitor{t.monitor_count !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
              {d.inactive_tenants.length > 6 && (
                <p className="text-[10px] text-zinc-700">
                  +{d.inactive_tenants.length - 6} more
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── DB Essentials ───────────────────────────────────────────────────────────

function DbSection({
  summary,
  locks,
  loading,
}: {
  summary: DbSummaryData | null
  locks: DbLocksData | null
  loading: boolean
}) {
  if (loading) {
    return (
      <section>
        <SectionTitle icon={Database} title="Database Essentials" />
        <div className="grid gap-3 lg:grid-cols-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </section>
    )
  }
  if (!summary) {
    return (
      <section>
        <SectionTitle icon={Database} title="Database Essentials" />
        <p className="py-4 text-[12px] text-zinc-600">Data unavailable — auto-retry in 30s.</p>
      </section>
    )
  }

  const { connections, query_latency, size } = summary.data
  const lockSummary = locks?.data.summary
  const lockStatus = locks?.data.status ?? 'unknown'

  const daysToCapacity = size.estimated_days_to_capacity
  const capacityStatus =
    daysToCapacity === null ? 'unknown'
    : daysToCapacity > 30 ? 'healthy'
    : daysToCapacity > 7 ? 'warning'
    : 'critical'

  return (
    <section>
      <SectionTitle
        icon={Database}
        title="Database Essentials"
        badge={lockStatus !== 'healthy' && lockStatus !== 'unknown' ? lockStatus : undefined}
      />
      <div className="grid gap-3 lg:grid-cols-3">

        {/* Connection Pool */}
        <div className="cs-card px-4 py-4">
          <div className="cs-card-wash" />
          <div className="relative z-10 mb-3 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Connection Pool</p>
            <StatusDot status={connections.status} />
          </div>
          <div className="relative z-10 space-y-2">
            {[
              ['Active', connections.active, 'text-zinc-100'],
              ['Idle', connections.idle, 'text-zinc-500'],
              ['Waiting', connections.waiting, connections.waiting > 0 ? 'text-amber-400' : 'text-zinc-600'],
              ['Max', connections.max, 'text-zinc-600'],
            ].map(([label, val, cls]) => (
              <div key={label as string} className="flex justify-between text-[13px]">
                <span className="text-zinc-400">{label}</span>
                <span className={`font-bold tabular-nums ${cls}`}>{val as number}</span>
              </div>
            ))}
            {connections.pool_usage_pct !== null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full transition-all ${
                    connections.pool_usage_pct < 70 ? 'bg-emerald-500'
                    : connections.pool_usage_pct < 90 ? 'bg-amber-400'
                    : 'bg-rose-500'
                  }`}
                  style={{ width: `${connections.pool_usage_pct}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Query Latency */}
        <div className="cs-card px-4 py-4">
          <div className="cs-card-wash" />
          <p className="relative z-10 mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Query Latency
          </p>
          <div className="relative z-10 space-y-3">
            {query_latency.available ? (
              <>
                <div>
                  <p className="mb-0.5 text-[9px] text-zinc-600">P50</p>
                  <p className="text-[22px] font-black tabular-nums leading-none text-zinc-100">
                    {query_latency.p50_ms ?? '—'}
                    <span className="text-[12px] font-medium text-zinc-500">ms</span>
                  </p>
                </div>
                <div>
                  <p className="mb-0.5 text-[9px] text-zinc-600">P95</p>
                  <p className={`text-[22px] font-black tabular-nums leading-none ${
                    query_latency.p95_ms === null ? 'text-zinc-600'
                    : query_latency.p95_ms < 100 ? 'text-emerald-400'
                    : query_latency.p95_ms < 500 ? 'text-amber-400'
                    : 'text-rose-400'
                  }`}>
                    {query_latency.p95_ms ?? '—'}
                    <span className="text-[12px] font-medium text-zinc-500">ms</span>
                  </p>
                </div>
                <p className="text-[10px] text-zinc-700">{query_latency.tracked_queries} tracked queries</p>
              </>
            ) : (
              <p className="text-[12px] text-zinc-600">N/A — pg_stat_statements not enabled</p>
            )}
          </div>
        </div>

        {/* Size & Capacity */}
        <div className="cs-card px-4 py-4">
          <div className="cs-card-wash" />
          <p className="relative z-10 mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Size & Capacity
          </p>
          <div className="relative z-10 space-y-2">
            <div>
              <p className="mb-0.5 text-[9px] text-zinc-600">Current size</p>
              <p className="text-[22px] font-black tabular-nums leading-none text-zinc-100">
                {size.pretty}
              </p>
            </div>
            {size.growth_bytes_24h !== null && (
              <div className="flex justify-between text-[13px]">
                <span className="text-zinc-400">Growth 24h</span>
                <span className="font-bold tabular-nums text-zinc-300">
                  {(size.growth_bytes_24h / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
            )}
            {daysToCapacity !== null && (
              <div className="flex justify-between text-[13px]">
                <span className="text-zinc-400">Est. days to limit</span>
                <span className={`font-bold tabular-nums ${TEXT_CLASS[capacityStatus]}`}>
                  {daysToCapacity}d
                </span>
              </div>
            )}
            {lockSummary && (
              <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                {lockSummary.blocked_count > 0 && (
                  <p className="text-[11px] text-rose-400">⚠ {lockSummary.blocked_count} blocked lock{lockSummary.blocked_count !== 1 ? 's' : ''}</p>
                )}
                {lockSummary.long_running_count > 0 && (
                  <p className="text-[11px] text-amber-400">{lockSummary.long_running_count} long-running query{lockSummary.long_running_count !== 1 ? 'ies' : ''}</p>
                )}
                {lockSummary.idle_in_transaction_count > 0 && (
                  <p className="text-[11px] text-amber-400">{lockSummary.idle_in_transaction_count} idle-in-transaction</p>
                )}
                {lockSummary.blocked_count === 0 && lockSummary.long_running_count === 0 && lockSummary.idle_in_transaction_count === 0 && (
                  <p className="text-[11px] text-emerald-400/80">No lock contention</p>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </section>
  )
}

// ─── System Resources ─────────────────────────────────────────────────────────

function SystemSection({
  data,
  loading,
}: {
  data: SystemResourcesData | null
  loading: boolean
}) {
  if (loading) {
    return (
      <section>
        <SectionTitle icon={HardDrive} title="System Resources" />
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </section>
    )
  }
  if (!data) {
    return (
      <section>
        <SectionTitle icon={HardDrive} title="System Resources" />
        <p className="py-4 text-[12px] text-zinc-600">Data unavailable — auto-retry in 30s.</p>
      </section>
    )
  }

  const { memory, disk, io } = data.data

  return (
    <section>
      <SectionTitle icon={HardDrive} title="System Resources" />
      <div className="grid gap-3 lg:grid-cols-2">

        {/* Memory / Buffer cache */}
        <div className="cs-card px-4 py-4">
          <div className="cs-card-wash" />
          <div className="relative z-10 mb-3 flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-zinc-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Memory (DB Cache)
            </p>
          </div>
          <div className="relative z-10">
            {memory.db_cache_hit_ratio !== null ? (
              <>
                <p className={`text-[26px] font-black tabular-nums leading-none ${TEXT_CLASS[memory.db_cache_status]}`}>
                  {Number(memory.db_cache_hit_ratio).toFixed(1)}
                  <span className="text-[14px] font-medium text-zinc-500">%</span>
                </p>
                <p className="mt-1 text-[10px] text-zinc-600">Buffer cache hit ratio</p>
                {memory.blks_hit !== null && memory.blks_read !== null && (
                  <p className="mt-0.5 text-[10px] text-zinc-700">
                    {memory.blks_hit.toLocaleString()} hits · {memory.blks_read.toLocaleString()} reads
                  </p>
                )}
              </>
            ) : (
              <p className="text-[20px] font-black leading-none text-zinc-700">N/A</p>
            )}
            <p className="mt-2 text-[9px] leading-relaxed text-zinc-700">{memory.source}</p>
          </div>
        </div>

        {/* Disk & I/O */}
        <div className="cs-card px-4 py-4">
          <div className="cs-card-wash" />
          <p className="relative z-10 mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Disk & I/O
          </p>
          <div className="relative z-10 space-y-2">
            {disk.tablespaces.length > 0 ? (
              disk.tablespaces.map((ts) => (
                <div key={ts.tablespace} className="flex justify-between text-[13px]">
                  <span className="text-zinc-400 font-mono">{ts.tablespace}</span>
                  <span className="font-bold tabular-nums text-zinc-300">{ts.size_pretty}</span>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-zinc-600">N/A</p>
            )}
            {io.pressure_signal !== null && (
              <div className="mt-2 border-t border-border/60 pt-2">
                <p className={`text-[11px] ${io.pressure_signal ? 'text-amber-400' : 'text-emerald-400/80'}`}>
                  {io.pressure_signal ? '⚠ BG writer pressure detected' : 'No I/O pressure'}
                </p>
              </div>
            )}
            {io.buffers_checkpoint !== null && (
              <p className="text-[10px] text-zinc-700">
                {io.buffers_checkpoint?.toLocaleString()} checkpoint buffers
              </p>
            )}
          </div>
        </div>

      </div>
    </section>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ObservabilityDashboard() {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('15m')

  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [services, setServices] = useState<ServicesData | null>(null)
  const [providers, setProviders] = useState<ProvidersData | null>(null)
  const [slo, setSlo] = useState<SloData | null>(null)
  const [ingest, setIngest] = useState<IngestData | null>(null)
  const [probes, setProbes] = useState<ProbesData | null>(null)
  const [fleet, setFleet] = useState<FleetData | null>(null)
  const [delivery, setDelivery] = useState<DeliveryData | null>(null)
  const [tenants, setTenants] = useState<TenantsData | null>(null)
  const [dbSummary, setDbSummary] = useState<DbSummaryData | null>(null)
  const [dbLocks, setDbLocks] = useState<DbLocksData | null>(null)
  const [system, setSystem] = useState<SystemResourcesData | null>(null)

  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  const fetchAll = useCallback(async () => {
    const safeFetch = async (url: string) => {
      const res = await fetch(url)
      if (res.status === 401) {
        setSessionExpired(true)
        throw new Error('401')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    const q = `?window=${timeWindow}`

    const [ovR, svcR, provR, sloR, ingR, prR, flR, delR, tenR, dbSumR, dbLockR, sysR] =
      await Promise.allSettled([
        safeFetch('/api/admin/health/overview'),
        safeFetch('/api/admin/health/services'),
        safeFetch('/api/admin/health/providers'),
        safeFetch(`/api/admin/slo/summary${q}`),
        safeFetch(`/api/admin/pipeline/ingest${q}`),
        safeFetch(`/api/admin/pipeline/probes${q}`),
        safeFetch('/api/admin/fleet/status'),
        safeFetch(`/api/admin/alerts/delivery${q}`),
        safeFetch('/api/admin/tenants/activity'),
        safeFetch('/api/admin/db/summary'),
        safeFetch('/api/admin/db/locks'),
        safeFetch('/api/admin/system/resources'),
      ])

    if (ovR.status === 'fulfilled') setOverview(ovR.value)
    if (svcR.status === 'fulfilled') setServices(svcR.value)
    if (provR.status === 'fulfilled') setProviders(provR.value)
    if (sloR.status === 'fulfilled') setSlo(sloR.value)
    if (ingR.status === 'fulfilled') setIngest(ingR.value)
    if (prR.status === 'fulfilled') setProbes(prR.value)
    if (flR.status === 'fulfilled') setFleet(flR.value)
    if (delR.status === 'fulfilled') setDelivery(delR.value)
    if (tenR.status === 'fulfilled') setTenants(tenR.value)
    if (dbSumR.status === 'fulfilled') setDbSummary(dbSumR.value)
    if (dbLockR.status === 'fulfilled') setDbLocks(dbLockR.value)
    if (sysR.status === 'fulfilled') setSystem(sysR.value)

    setLastUpdated(new Date())
    setInitialLoading(false)
    setRefreshing(false)
  }, [timeWindow])

  useEffect(() => {
    Promise.resolve().then(() => {
      setInitialLoading(true)
      fetchAll()
    })
    const timer = setInterval(fetchAll, 30_000)
    return () => clearInterval(timer)
  }, [fetchAll])


  if (sessionExpired) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="mb-4 text-zinc-400">Session expired. Please sign in again.</p>
        <a href="/login" className="cs-btn-primary px-6">
          Sign in
        </a>
      </div>
    )
  }

  const globalStatus = overview?.data.status ?? 'unknown'

  return (
    <div className="space-y-10">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2.5">
            <StatusDot status={globalStatus} />
            <h1 className="text-xl font-black tracking-tight text-zinc-100">
              Platform Observability
            </h1>
            <span className={BADGE_CLASS[globalStatus]}>{globalStatus}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-600">
            {overview && (
              <>
                <span>{overview.data.active_monitors} monitors</span>
                <span>·</span>
                <span>{overview.regions.length} regions</span>
                {overview.data.regions_silent.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-amber-500/80">
                      {overview.data.regions_silent.length} silent
                    </span>
                  </>
                )}
                <span>·</span>
              </>
            )}
            <span>
              {lastUpdated
                ? `updated ${lastUpdated.toLocaleTimeString()}`
                : 'loading…'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(['15m', '1h', '24h', '7d'] as TimeWindow[]).map(w => (
              <button
                key={w}
                onClick={() => setTimeWindow(w)}
                className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  timeWindow === w
                    ? 'bg-white/10 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setRefreshing(true)
              fetchAll()
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Critical provider banner ── */}
      {providers?.data.has_critical && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
          <p className="text-[13px] font-semibold text-rose-400">
            External provider critical — check External Providers section below.
          </p>
        </div>
      )}

      {/* ── Sections ── */}
      <ServiceHealthSection data={services} loading={initialLoading} />
      <ProvidersSection data={providers} loading={initialLoading} />
      <SloSection data={slo} loading={initialLoading} />
      <PipelineSection ingest={ingest} probes={probes} loading={initialLoading} />
      <FleetSection data={fleet} loading={initialLoading} />
      <DeliverySection data={delivery} loading={initialLoading} />
      <TenantsSection data={tenants} loading={initialLoading} />
      <DbSection summary={dbSummary} locks={dbLocks} loading={initialLoading} />
      <SystemSection data={system} loading={initialLoading} />
    </div>
  )
}
