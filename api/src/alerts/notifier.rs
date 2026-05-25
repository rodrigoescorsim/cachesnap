use crate::{
    alerts::severity::{
        alert_severity, alert_type_display, format_duration, format_duration_short,
        is_cache_hit_trend_drop_alert, is_cache_metric, metric_unit, AlertSeverity,
    },
    AppState,
};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde_json::json;
use sha2::Sha256;
use std::collections::HashMap;
use tracing::{error, info, warn};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum NotificationType {
    FirstFire,
    Digest,
    Recovery,
}

impl NotificationType {
    pub fn as_str(self) -> &'static str {
        match self {
            NotificationType::FirstFire => "first_fire",
            NotificationType::Digest => "digest",
            NotificationType::Recovery => "recovery",
        }
    }
}

pub struct IncidentNotification {
    pub incident_id: Uuid,
    pub alert_record_id: Uuid,
    pub monitor_id: Uuid,
    pub alert_type: String,
    pub affected_regions: Vec<String>,
    pub notification_type: NotificationType,
    /// When this incident was first opened (UTC), for absolute time in emails.
    pub opened_at: DateTime<Utc>,
    pub actual: Option<f64>,
    pub threshold: Option<f64>,
    pub duration: chrono::Duration,
    pub notification_count: i32,
    // Trend-specific context (None for non-trend alerts)
    pub delta_pct: Option<f64>,
    pub comparator: Option<String>,
    #[allow(dead_code)]
    pub deviation_factor: Option<f64>,
    pub diagnosis: Option<String>,
    pub action: Option<String>,
}

pub struct RecoveryNotification {
    pub monitor_id: Uuid,
    pub alert_type: String,
    pub affected_regions: Vec<String>,
    pub duration: chrono::Duration,
    pub notification_count: i32,
    pub actual: Option<f64>,
    pub threshold: Option<f64>,
}

struct MonitorNotifConfig {
    url: String,
    name: Option<String>,
    notify_email: Option<String>,
    notify_email_enabled: bool,
    notify_slack_webhook: Option<String>,
    notify_slack_enabled: bool,
}

async fn fetch_monitor_config(state: &AppState, monitor_id: Uuid) -> Option<MonitorNotifConfig> {
    let row = sqlx::query!(
        "SELECT url, name, notify_email, notify_email_enabled, notify_slack_webhook, notify_slack_enabled
         FROM monitors WHERE id = $1",
        monitor_id
    )
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(m)) => Some(MonitorNotifConfig {
            url: m.url,
            name: m.name,
            notify_email: m.notify_email,
            notify_email_enabled: m.notify_email_enabled,
            notify_slack_webhook: m.notify_slack_webhook,
            notify_slack_enabled: m.notify_slack_enabled,
        }),
        Ok(None) => None,
        Err(e) => {
            error!("notifier: failed to fetch monitor {}: {}", monitor_id, e);
            None
        }
    }
}

async fn fetch_region_labels(state: &AppState, regions: &[String]) -> HashMap<String, String> {
    if regions.is_empty() {
        return HashMap::new();
    }
    sqlx::query_as::<_, (String, String)>("SELECT id, label FROM regions WHERE id = ANY($1)")
        .bind(regions)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .collect()
}

fn format_region_summary(regions: &[String], labels: &HashMap<String, String>) -> String {
    if regions.is_empty() {
        return "unknown".to_string();
    }
    let names: Vec<String> = regions
        .iter()
        .map(|r| labels.get(r).cloned().unwrap_or_else(|| r.clone()))
        .collect();
    if names.len() == 1 {
        return names.into_iter().next().unwrap();
    }
    if names.len() <= 4 {
        format!("{} regions: {}", names.len(), names.join(", "))
    } else {
        format!(
            "{} regions: {} +{} more",
            names.len(),
            names[..3].join(", "),
            names.len() - 3
        )
    }
}

fn replace_region_ids(text: &str, labels: &HashMap<String, String>) -> String {
    labels
        .iter()
        .fold(text.to_string(), |acc, (id, label)| acc.replace(id, label))
}

/// Same rules as dashboard `normalizeLegacyTrendDiagnosisCopy` — older `alerts.diagnosis` rows
/// used `· all regions ·` in the middle of global trend lines before `trend/detector.rs` copy refresh.
fn normalize_legacy_trend_diagnosis_copy(diagnosis: &str) -> String {
    let needs_scan = diagnosis.contains("all regions")
        || diagnosis.contains("All regions")
        || diagnosis.contains("__global__");
    if !needs_scan {
        return diagnosis.to_string();
    }

    let mut s = diagnosis.to_string();
    let mut replaced = false;
    for pat in [
        " · all regions · ",
        " · All regions · ",
        " · __global__ · ",
    ] {
        if s.contains(pat) {
            s = s.replace(pat, " — ");
            replaced = true;
        }
    }
    if !replaced {
        return diagnosis.to_string();
    }

    if s.starts_with("TTFB ") && !s.starts_with("Global aggregate TTFB ") {
        s = format!("Global aggregate {}", s);
    } else if s.starts_with("Cache hit fell") && !s.starts_with("Global cache hit rate fell") {
        s = s.replacen("Cache hit fell", "Global cache hit rate fell", 1);
    }

    s
}

fn replace_region_ids_and_normalize_legacy_trend(
    text: &str,
    labels: &HashMap<String, String>,
) -> String {
    let raw = replace_region_ids(text, labels);
    let normalized = normalize_legacy_trend_diagnosis_copy(&raw);
    normalized
        .replace("Zombie cache", "Cache Age Alert")
        .replace("zombie cache", "cache age alert")
        .replace("Zombie Cache", "Cache Age Alert")
}

fn severity_context(alert_type: &str) -> (&'static str, &'static str) {
    match alert_severity(alert_type) {
        crate::alerts::severity::AlertSeverity::Critical => {
            ("Critical impact", "Service is unavailable or failing.")
        }
        crate::alerts::severity::AlertSeverity::High => (
            "High impact",
            "Users may see a noticeable performance issue.",
        ),
        crate::alerts::severity::AlertSeverity::Medium => (
            "Medium impact",
            "Needs attention, but the monitor is still reachable.",
        ),
        crate::alerts::severity::AlertSeverity::Low => {
            ("Low impact", "Worth tracking, but not urgent.")
        }
    }
}

pub async fn notify_incident(state: AppState, notif: IncidentNotification) {
    let monitor = match fetch_monitor_config(&state, notif.monitor_id).await {
        Some(m) => m,
        None => return,
    };

    let monitor_label = monitor
        .name
        .as_deref()
        .unwrap_or(monitor.url.as_str())
        .to_string();
    let region_labels = fetch_region_labels(&state, &notif.affected_regions).await;
    let region_label = format_region_summary(&notif.affected_regions, &region_labels);

    let type_label = alert_type_display(&notif.alert_type);
    let subject = build_incident_subject(&notif, type_label, &monitor_label);
    let snooze_url = build_snooze_url(&state, notif.monitor_id, notif.incident_id);

    let mut notified_email = false;
    let mut notified_slack = false;

    if monitor.notify_email_enabled {
        if let Some(to_email) = &monitor.notify_email {
            if let Some(api_key) = &state.config.resend_api_key {
                let html = build_incident_email_html(
                    &notif,
                    &monitor_label,
                    &monitor.url,
                    &region_label,
                    &region_labels,
                    &snooze_url,
                    &state.config.app_url,
                );
                let t0 = std::time::Instant::now();
                match send_email(
                    api_key,
                    &state.config.alert_from_email,
                    to_email,
                    &subject,
                    &html,
                )
                .await
                {
                    Ok(()) => {
                        notified_email = true;
                        let latency_ms = t0.elapsed().as_millis() as f64;
                        info!("notifier: email sent for incident {}", notif.incident_id);
                        record_delivery(
                            &state,
                            "email",
                            "resend",
                            true,
                            latency_ms,
                            notif.notification_type.as_str(),
                            None,
                        )
                        .await;
                    }
                    Err(e) => {
                        let latency_ms = t0.elapsed().as_millis() as f64;
                        error!(
                            "notifier: email failed for incident {}: {}",
                            notif.incident_id, e
                        );
                        record_delivery(
                            &state,
                            "email",
                            "resend",
                            false,
                            latency_ms,
                            notif.notification_type.as_str(),
                            Some(e),
                        )
                        .await;
                    }
                }
            } else {
                warn!(
                    "notifier: RESEND_API_KEY not set — skipping email for incident {}",
                    notif.incident_id
                );
            }
        }
    }

    if monitor.notify_slack_enabled {
        if let Some(webhook_url) = &monitor.notify_slack_webhook {
            let slack_text = build_slack_incident_text(
                &notif,
                &monitor_label,
                &region_label,
                &region_labels,
                &snooze_url,
                &monitor.url,
                &state.config.app_url,
            );
            let t0 = std::time::Instant::now();
            match send_slack(webhook_url, &slack_text).await {
                Ok(()) => {
                    notified_slack = true;
                    let latency_ms = t0.elapsed().as_millis() as f64;
                    info!("notifier: slack sent for incident {}", notif.incident_id);
                    record_delivery(
                        &state,
                        "slack",
                        "webhook",
                        true,
                        latency_ms,
                        notif.notification_type.as_str(),
                        None,
                    )
                    .await;
                }
                Err(e) => {
                    let latency_ms = t0.elapsed().as_millis() as f64;
                    error!(
                        "notifier: slack failed for incident {}: {}",
                        notif.incident_id, e
                    );
                    record_delivery(
                        &state,
                        "slack",
                        "webhook",
                        false,
                        latency_ms,
                        notif.notification_type.as_str(),
                        Some(e),
                    )
                    .await;
                }
            }
        }
    }

    if notified_email || notified_slack {
        let _ = sqlx::query!(
            "UPDATE alerts SET notified_email = $1, notified_slack = $2 WHERE id = $3",
            notified_email,
            notified_slack,
            notif.alert_record_id
        )
        .execute(&state.db)
        .await;
    }
}

pub async fn notify_recovery(state: AppState, notif: RecoveryNotification) {
    let severity = alert_severity(&notif.alert_type);
    if !severity.sends_recovery() || notif.notification_count == 0 {
        return;
    }

    let monitor = match fetch_monitor_config(&state, notif.monitor_id).await {
        Some(m) => m,
        None => return,
    };

    let monitor_label = monitor
        .name
        .as_deref()
        .unwrap_or(monitor.url.as_str())
        .to_string();
    let type_label = alert_type_display(&notif.alert_type);
    let region_labels = fetch_region_labels(&state, &notif.affected_regions).await;
    let subject = format!("[CacheSnap] Resolved: {} · {}", type_label, monitor_label);

    if monitor.notify_email_enabled {
        if let Some(to_email) = &monitor.notify_email {
            if let Some(api_key) = &state.config.resend_api_key {
                let html = build_recovery_email_html(&notif, &monitor_label, type_label);
                let t0 = std::time::Instant::now();
                match send_email(
                    api_key,
                    &state.config.alert_from_email,
                    to_email,
                    &subject,
                    &html,
                )
                .await
                {
                    Ok(()) => {
                        let latency_ms = t0.elapsed().as_millis() as f64;
                        info!("notifier: recovery email sent for {}", notif.alert_type);
                        record_delivery(
                            &state, "email", "resend", true, latency_ms, "recovery", None,
                        )
                        .await;
                    }
                    Err(e) => {
                        let latency_ms = t0.elapsed().as_millis() as f64;
                        error!("notifier: recovery email failed: {}", e);
                        record_delivery(
                            &state,
                            "email",
                            "resend",
                            false,
                            latency_ms,
                            "recovery",
                            Some(e),
                        )
                        .await;
                    }
                }
            }
        }
    }

    if monitor.notify_slack_enabled {
        if let Some(webhook_url) = &monitor.notify_slack_webhook {
            let text = build_slack_recovery_text(
                &notif,
                &monitor_label,
                type_label,
                &region_labels,
                &state.config.app_url,
            );
            if let Ok(()) = send_slack(webhook_url, &text).await {
                info!("notifier: recovery slack sent for {}", notif.alert_type);
            }
        }
    }
}

// --- Subject builders ---

fn build_incident_subject(
    n: &IncidentNotification,
    type_label: &str,
    monitor_label: &str,
) -> String {
    let severity = alert_severity(&n.alert_type);
    match n.notification_type {
        NotificationType::FirstFire => {
            if matches!(
                severity,
                crate::alerts::severity::AlertSeverity::Critical
                    | crate::alerts::severity::AlertSeverity::High
            ) {
                format!(
                    "[CacheSnap] {}: {} · {}",
                    severity.as_str().to_uppercase(),
                    type_label,
                    monitor_label
                )
            } else {
                format!("[CacheSnap] {} · {}", type_label, monitor_label)
            }
        }
        NotificationType::Digest => {
            let dur = format_duration_short(&n.duration);
            format!(
                "[CacheSnap] Still ongoing: {} · {} · {}",
                type_label, dur, monitor_label
            )
        }
        NotificationType::Recovery => {
            format!("[CacheSnap] Resolved: {} · {}", type_label, monitor_label)
        }
    }
}

// --- HMAC snooze token ---

pub fn build_snooze_url(state: &AppState, monitor_id: Uuid, incident_id: Uuid) -> String {
    let expires = chrono::Utc::now().timestamp() + 7 * 24 * 3600;
    let token = sign_snooze_token(&state.config.alert_snooze_secret, incident_id, expires);
    format!(
        "{}/api/monitors/{}/incidents/{}/snooze?token={}&expires={}",
        state.config.api_url, monitor_id, incident_id, token, expires
    )
}

pub fn sign_snooze_token(secret: &str, incident_id: Uuid, expires: i64) -> String {
    type HmacSha256 = Hmac<Sha256>;
    let message = format!("snooze:{}:{}", incident_id, expires);
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key size");
    mac.update(message.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

fn format_incident_timestamp_utc(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M UTC").to_string()
}

pub fn verify_snooze_token(secret: &str, incident_id: Uuid, expires: i64, token: &str) -> bool {
    let expected = sign_snooze_token(secret, incident_id, expires);
    // Constant-time comparison via HMAC verify
    type HmacSha256 = Hmac<Sha256>;
    let message = format!("snooze:{}:{}", incident_id, expires);
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key size");
    mac.update(message.as_bytes());
    mac.verify_slice(&hex::decode(token).unwrap_or_default())
        .is_ok()
        && expected == token // belt-and-suspenders: also ensure hex round-trip matches
}

// --- Email HTML builders ---

fn build_incident_email_html(
    n: &IncidentNotification,
    monitor_label: &str,
    monitor_url: &str,
    region_label: &str,
    region_labels: &HashMap<String, String>,
    snooze_url: &str,
    app_url: &str,
) -> String {
    let severity = alert_severity(&n.alert_type);
    let type_label = alert_type_display(&n.alert_type);
    let unit = metric_unit(&n.alert_type);

    let (header_bg, header_label) = match n.notification_type {
        NotificationType::FirstFire => (severity.color(), "New Alert"),
        NotificationType::Digest => ("#6b7280", "Still Ongoing"),
        NotificationType::Recovery => ("#16a34a", "Resolved"),
    };

    let (severity_label, severity_note) = severity_context(&n.alert_type);
    let severity_html = format!(
        "<p style='margin:0 0 12px;font-size:14px;color:#4b5563'><strong>{}</strong>: {}</p>",
        html_escape(severity_label),
        html_escape(severity_note)
    );

    let opened_display = format_incident_timestamp_utc(n.opened_at);
    let opened_esc = html_escape(&opened_display);
    let duration_esc = html_escape(&format_duration(&n.duration));

    let context_html = match n.notification_type {
        NotificationType::FirstFire => severity_html,
        NotificationType::Digest => format!(
            "{}<p style='margin:0 0 12px;font-size:13px;color:#6b7280'>Since <strong style=\"color:#374151\">{}</strong> &middot; <strong>{}</strong> &middot; {} notification{} sent</p>",
            severity_html,
            opened_esc,
            duration_esc,
            n.notification_count,
            if n.notification_count == 1 { "" } else { "s" }
        ),
        NotificationType::Recovery => format!(
            "<p style='margin:0 0 12px;font-size:14px;color:#16a34a'>Resolved after <strong>{}</strong></p>",
            format_duration(&n.duration)
        ),
    };

    let metrics_html = build_metrics_html(n, unit, severity.color());
    let diagnosis = n
        .diagnosis
        .as_deref()
        .map(|text| replace_region_ids_and_normalize_legacy_trend(text, region_labels))
        .unwrap_or_default();
    let action = n
        .action
        .as_deref()
        .map(|text| replace_region_ids_and_normalize_legacy_trend(text, region_labels))
        .unwrap_or_default();
    let dashboard_url = format!("{}/dashboard", app_url);

    let incident_time_html = match n.notification_type {
        NotificationType::FirstFire => format!(
            "<p style='margin:0 0 12px;font-size:13px;color:#9ca3af'>First detected at <strong style=\"color:#6b7280\">{}</strong></p>",
            opened_esc
        ),
        NotificationType::Digest | NotificationType::Recovery => String::new(),
    };

    format!(
        r#"<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <tr>
    <td style="background:{header_bg};padding:14px 24px">
      <span style="color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px">{header_label}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:24px">
      <h2 style="margin:0 0 4px;font-size:20px;color:#111;font-weight:700">{type_label}</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280">{monitor_label_escaped} &middot; {region_label_escaped}</p>
      {incident_time_html}
      {context_html}
      {metrics_html}
      {diag_html}
      {action_html}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb">
        <tr>
          <td style="font-size:13px;color:#9ca3af">
            <a href="{snooze_url}" style="color:#9ca3af;text-decoration:underline">Snooze 24h</a>
            &nbsp;&middot;&nbsp;
            <a href="{monitor_url}" style="color:#2563eb;text-decoration:none">View monitor</a>
            &nbsp;&middot;&nbsp;
            <a href="{dashboard_url}" style="color:#6b7280;text-decoration:none">Dashboard</a>
            &nbsp;&middot;&nbsp;
            <a href="mailto:hello@cachesnap.com" style="color:#9ca3af;text-decoration:underline">Support</a>
          </td>
          <td align="right" style="font-size:11px;color:#d1d5db">CacheSnap</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>"#,
        header_bg = header_bg,
        header_label = header_label,
        type_label = html_escape(type_label),
        monitor_label_escaped = html_escape(monitor_label),
        region_label_escaped = html_escape(region_label),
        incident_time_html = incident_time_html,
        context_html = context_html,
        metrics_html = metrics_html,
        diag_html = if !diagnosis.is_empty() {
            format!(
                "<p style='margin:0 0 8px;font-size:14px;color:#374151'>{}</p>",
                html_escape(&diagnosis)
            )
        } else {
            String::new()
        },
        action_html = if !action.is_empty() {
            format!(
                "<p style='margin:0 0 16px;font-size:14px;color:#1d4ed8'><strong>Action:</strong> {}</p>",
                html_escape(&action)
            )
        } else {
            String::new()
        },
        snooze_url = snooze_url,
        monitor_url = monitor_url,
        dashboard_url = dashboard_url,
    )
}

fn build_metrics_html(n: &IncidentNotification, unit: &str, severity_color: &str) -> String {
    // Prefer 3-column layout when a delta exists (trend: current vs reference + change).
    if let (Some(actual), Some(delta), Some(baseline)) = (n.actual, n.delta_pct, n.threshold) {
        let cmp = n
            .comparator
            .as_deref()
            .map(comparator_display)
            .unwrap_or("reference");
        let delta_color = if is_cache_metric(&n.alert_type) {
            if delta < 0.0 {
                "#dc2626"
            } else {
                "#16a34a"
            }
        } else {
            if delta > 0.0 {
                "#dc2626"
            } else {
                "#16a34a"
            }
        };
        let delta_cell = if is_cache_hit_trend_drop_alert(&n.alert_type) {
            format!(
                r#"<div style="font-size:26px;font-weight:700;color:{delta_color}">{delta:.1} pp</div>"#,
                delta_color = delta_color,
                delta = delta,
            )
        } else {
            let sign = if delta > 0.0 { "+" } else { "" };
            format!(
                r#"<div style="font-size:26px;font-weight:700;color:{delta_color}">{sign}{delta_abs:.1}%</div>"#,
                delta_color = delta_color,
                sign = sign,
                delta_abs = delta.abs(),
            )
        };
        format!(
            r#"<table cellpadding="12" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:16px;width:100%">
  <tr>
    <td>
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Current</div>
      <div style="font-size:26px;font-weight:700;color:{severity_color}">{actual:.1}{unit}</div>
    </td>
    <td>
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">vs {cmp}</div>
      {delta_cell}
    </td>
    <td>
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Reference</div>
      <div style="font-size:26px;font-weight:700;color:#6b7280">{baseline:.1}{unit}</div>
    </td>
  </tr>
</table>"#,
            severity_color = severity_color,
            actual = actual,
            unit = unit,
            cmp = cmp,
            delta_cell = delta_cell,
            baseline = baseline,
        )
    } else if let (Some(actual), Some(threshold)) = (n.actual, n.threshold) {
        format!(
            r#"<table cellpadding="12" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:16px;width:100%">
  <tr>
    <td>
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Current</div>
      <div style="font-size:26px;font-weight:700;color:{severity_color}">{actual:.1}{unit}</div>
    </td>
    <td>
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Threshold</div>
      <div style="font-size:26px;font-weight:700;color:#374151">{threshold:.1}{unit}</div>
    </td>
  </tr>
</table>"#,
            severity_color = severity_color,
            actual = actual,
            unit = unit,
            threshold = threshold,
        )
    } else {
        String::new()
    }
}

fn build_recovery_email_html(
    n: &RecoveryNotification,
    monitor_label: &str,
    type_label: &str,
) -> String {
    let duration_text = format_duration(&n.duration);
    let unit = metric_unit(&n.alert_type);

    let metric_html = if let (Some(actual), Some(threshold)) = (n.actual, n.threshold) {
        format!(
            "<p style='margin:0 0 12px;font-size:14px;color:#374151'>Final reading: <strong>{:.1}{}</strong> (threshold: {:.1}{})</p>",
            actual, unit, threshold, unit
        )
    } else {
        String::new()
    };

    format!(
        r#"<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <tr>
    <td style="background:#16a34a;padding:14px 24px">
      <span style="color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Resolved</span>
    </td>
  </tr>
  <tr>
    <td style="padding:24px">
      <h2 style="margin:0 0 4px;font-size:20px;color:#111;font-weight:700">{type_label}</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280">{monitor_label_escaped}</p>
      <p style="margin:0 0 12px;font-size:14px;color:#16a34a">Issue resolved after <strong>{duration_text}</strong>.</p>
      {metric_html}
      <p style="margin:0;font-size:13px;color:#9ca3af">{notification_count} notification{s} sent during this incident.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px">
      <p style="margin:0;font-size:11px;color:#d1d5db">CacheSnap &mdash; Edge performance monitoring &middot; <a href="mailto:hello@cachesnap.com" style="color:#9ca3af;text-decoration:underline">Support</a></p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>"#,
        type_label = html_escape(type_label),
        monitor_label_escaped = html_escape(monitor_label),
        duration_text = duration_text,
        metric_html = metric_html,
        notification_count = n.notification_count,
        s = if n.notification_count == 1 { "" } else { "s" },
    )
}

// --- Slack message builders ---

fn build_slack_incident_text(
    n: &IncidentNotification,
    monitor_label: &str,
    region_label: &str,
    region_labels: &HashMap<String, String>,
    snooze_url: &str,
    site_url: &str,
    app_url: &str,
) -> String {
    let severity = alert_severity(&n.alert_type);
    let type_label = alert_type_display(&n.alert_type);
    let unit = metric_unit(&n.alert_type);

    let emoji = match severity {
        AlertSeverity::Critical => "🚨",
        AlertSeverity::High => "⚠️",
        AlertSeverity::Medium => "⚡",
        AlertSeverity::Low => "ℹ️",
    };

    let title = match n.notification_type {
        NotificationType::FirstFire => format!(
            "{} *[{}]* {}",
            emoji,
            severity.as_str().to_uppercase(),
            type_label
        ),
        NotificationType::Digest => format!(
            "⏳ *[ONGOING - {}]* {}",
            format_duration_short(&n.duration),
            type_label
        ),
        NotificationType::Recovery => format!("✅ *[RESOLVED]* {}", type_label),
    };

    let (sev_label, sev_note) = severity_context(&n.alert_type);
    let monitor_domain = site_url.split("://").nth(1).unwrap_or(site_url);

    let mut parts = vec![
        title,
        String::new(),
        format!("*Severity:* *{}* — {}", sev_label, sev_note),
        String::new(),
        "*Incident Details:*".to_string(),
        format!("• *Monitor:* {} (<{}|{}>)", monitor_label, site_url, monitor_domain),
        format!("• *Affected Region:* {}", region_label),
    ];

    match n.notification_type {
        NotificationType::FirstFire => {
            parts.push(format!(
                "• *First detected at:* `{}`",
                format_incident_timestamp_utc(n.opened_at)
            ));
        }
        NotificationType::Digest => {
            parts.push(format!(
                "• Since `{}` · `{}` · `{} notification{}` sent",
                format_incident_timestamp_utc(n.opened_at),
                format_duration(&n.duration),
                n.notification_count,
                if n.notification_count == 1 { "" } else { "s" }
            ));
        }
        NotificationType::Recovery => {}
    }

    parts.push(String::new()); // blank line

    // Metrics formatting
    if let (Some(actual), Some(delta), Some(reference)) = (n.actual, n.delta_pct, n.threshold) {
        let cmp = n
            .comparator
            .as_deref()
            .map(comparator_display)
            .unwrap_or("reference");
        
        parts.push("*Metrics Breakdown:*".to_string());
        parts.push(format!("• *Current Reading:* `{:.1}{}`", actual, unit));
        
        if is_cache_hit_trend_drop_alert(&n.alert_type) {
            parts.push(format!("• *Difference:* `{:.1} pp` vs `{}`", delta, cmp));
        } else {
            let sign = if delta > 0.0 { "+" } else { "" };
            parts.push(format!("• *Difference:* `{}{:.1}%` vs `{}`", sign, delta.abs(), cmp));
        }
        parts.push(format!("• *Reference Baseline:* `{:.1}{}`", reference, unit));
        parts.push(String::new());
    } else if let (Some(actual), Some(threshold)) = (n.actual, n.threshold) {
        parts.push("*Metrics:*".to_string());
        parts.push(format!("• *Current Reading:* `{:.1}{}`", actual, unit));
        parts.push(format!("• *Configured Threshold:* `{:.1}{}`", threshold, unit));
        parts.push(String::new());
    }

    if let Some(d) = &n.diagnosis {
        let normalized = replace_region_ids_and_normalize_legacy_trend(d, region_labels);
        parts.push("*Incident Diagnosis:*".to_string());
        parts.push(format!("> {}", normalized));
        parts.push(String::new());
    }

    if let Some(act) = &n.action {
        let normalized = replace_region_ids_and_normalize_legacy_trend(act, region_labels);
        parts.push("*Recommended Action:*".to_string());
        parts.push(format!("> {}", normalized));
        parts.push(String::new());
    }

    let monitor_dashboard_url = format!("{}/dashboard/monitors/{}", app_url, n.monitor_id);
    parts.push(format!(
        "⚙️ <{}|Snooze 24h>  ·  🖥️ <{}|View Website>  ·  📊 <{}|Open Dashboard>",
        snooze_url, site_url, monitor_dashboard_url
    ));

    parts.join("\n")
}

fn build_slack_recovery_text(
    n: &RecoveryNotification,
    monitor_label: &str,
    type_label: &str,
    region_labels: &HashMap<String, String>,
    app_url: &str,
) -> String {
    let regions = if n.affected_regions.is_empty() {
        "Global".to_string()
    } else {
        format_region_summary(&n.affected_regions, region_labels)
    };
    
    let duration_text = format_duration(&n.duration);
    let unit = metric_unit(&n.alert_type);

    let mut parts = vec![
        format!("✅ *[RESOLVED]* {}", type_label),
        String::new(),
        "*Recovery Details:*".to_string(),
        format!("• *Monitor:* {}", monitor_label),
        format!("• *Affected Region:* {}", regions),
        format!("• *Resolved after:* `{}`", duration_text),
    ];

    if let (Some(actual), Some(threshold)) = (n.actual, n.threshold) {
        parts.push(format!("• *Final Reading:* `{:.1}{}` (threshold: {:.1}{})", actual, unit, threshold, unit));
    }

    parts.push(format!("• *Notifications Sent:* `{} sent during this incident`", n.notification_count));
    parts.push(String::new());

    let monitor_dashboard_url = format!("{}/dashboard/monitors/{}", app_url, n.monitor_id);
    parts.push(format!(
        "📊 <{}|Open Dashboard>",
        monitor_dashboard_url
    ));

    parts.join("\n")
}

// --- HTTP senders ---

async fn send_email(
    api_key: &str,
    from: &str,
    to: &str,
    subject: &str,
    html: &str,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://api.resend.com/emails")
        .bearer_auth(api_key)
        .json(&json!({
            "from": from,
            "to": [to],
            "subject": subject,
            "html": html,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        Err(format!("Resend {}: {}", status, body))
    }
}

fn format_webhook_url(webhook_url: &str) -> String {
    let mut url = webhook_url.to_string();
    if (url.contains("discord.com/api/webhooks") || url.contains("discordapp.com/api/webhooks"))
        && !url.ends_with("/slack")
    {
        if url.ends_with('/') {
            url.pop();
        }
        url.push_str("/slack");
    }
    url
}

async fn send_slack(webhook_url: &str, text: &str) -> Result<(), String> {
    let formatted_url = format_webhook_url(webhook_url);
    let client = reqwest::Client::new();
    let res = client
        .post(&formatted_url)
        .json(&json!({ "text": text }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        Err(format!("Slack webhook {}: {}", status, body))
    }
}

// --- Delivery stats ---

async fn record_delivery(
    state: &AppState,
    channel: &'static str,
    provider: &'static str,
    success: bool,
    latency_ms: f64,
    notification_type: &str,
    error_message: Option<String>,
) {
    let (success_c, fail_c): (i32, i32) = if success { (1, 0) } else { (0, 1) };
    let db = state.db.clone();
    let notif_type = notification_type.to_string();
    let error_message = error_message.map(|message| {
        let compact = message.split_whitespace().collect::<Vec<_>>().join(" ");
        compact.chars().take(500).collect::<String>()
    });
    tokio::spawn(async move {
        let _ = sqlx::query(
            "INSERT INTO ops_alert_delivery_stats \
             (time, channel, provider, success_count, fail_count, avg_latency_ms, notification_type, error_message) \
             VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(channel)
        .bind(provider)
        .bind(success_c)
        .bind(fail_c)
        .bind(latency_ms)
        .bind(notif_type)
        .bind(error_message)
        .execute(&db)
        .await;
    });
}

// --- Helpers ---

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn comparator_display(c: &str) -> &str {
    match c {
        "prev_hour" => "previous hour",
        "same_hour_prev_day" => "same time yesterday",
        "day_avg" => "24h average",
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notification_type_str() {
        assert_eq!(NotificationType::FirstFire.as_str(), "first_fire");
        assert_eq!(NotificationType::Digest.as_str(), "digest");
        assert_eq!(NotificationType::Recovery.as_str(), "recovery");
    }

    #[test]
    fn test_format_webhook_url() {
        assert_eq!(
            format_webhook_url("https://hooks.slack.com/services/T123/B456/XYZ"),
            "https://hooks.slack.com/services/T123/B456/XYZ"
        );
        assert_eq!(
            format_webhook_url("https://discord.com/api/webhooks/123456/abcdef"),
            "https://discord.com/api/webhooks/123456/abcdef/slack"
        );
        assert_eq!(
            format_webhook_url("https://discord.com/api/webhooks/123456/abcdef/"),
            "https://discord.com/api/webhooks/123456/abcdef/slack"
        );
        assert_eq!(
            format_webhook_url("https://discordapp.com/api/webhooks/123456/abcdef"),
            "https://discordapp.com/api/webhooks/123456/abcdef/slack"
        );
        assert_eq!(
            format_webhook_url("https://discord.com/api/webhooks/123456/abcdef/slack"),
            "https://discord.com/api/webhooks/123456/abcdef/slack"
        );
    }

    #[test]
    fn test_html_escape() {
        assert_eq!(
            html_escape("Cache <hit> & \"rate\""),
            "Cache &lt;hit&gt; &amp; &quot;rate&quot;"
        );
        assert_eq!(html_escape("plain text"), "plain text");
    }

    #[test]
    fn test_comparator_display() {
        assert_eq!(comparator_display("prev_hour"), "previous hour");
        assert_eq!(
            comparator_display("same_hour_prev_day"),
            "same time yesterday"
        );
        assert_eq!(comparator_display("day_avg"), "24h average");
        assert_eq!(comparator_display("custom_cmp"), "custom_cmp");
    }

    #[test]
    fn test_snooze_token_is_deterministic() {
        let secret = "test-secret-key";
        let incident_id = Uuid::nil();
        let expires = 9_999_999_999i64;
        let t1 = sign_snooze_token(secret, incident_id, expires);
        let t2 = sign_snooze_token(secret, incident_id, expires);
        assert_eq!(t1, t2);
        assert_eq!(t1.len(), 64); // SHA-256 = 32 bytes = 64 hex chars
    }

    #[test]
    fn test_snooze_token_verify() {
        let secret = "test-secret-key";
        let incident_id = Uuid::from_u128(42);
        let expires = 9_999_999_999i64;
        let token = sign_snooze_token(secret, incident_id, expires);
        assert!(verify_snooze_token(secret, incident_id, expires, &token));
    }

    #[test]
    fn test_snooze_token_wrong_secret() {
        let incident_id = Uuid::from_u128(42);
        let expires = 9_999_999_999i64;
        let token = sign_snooze_token("correct-secret", incident_id, expires);
        assert!(!verify_snooze_token(
            "wrong-secret",
            incident_id,
            expires,
            &token
        ));
    }

    #[test]
    fn test_snooze_token_different_incidents() {
        let secret = "test-secret";
        let expires = 9_999_999_999i64;
        let t1 = sign_snooze_token(secret, Uuid::from_u128(1), expires);
        let t2 = sign_snooze_token(secret, Uuid::from_u128(2), expires);
        assert_ne!(t1, t2);
    }

    #[test]
    fn test_snooze_token_tampered() {
        let secret = "test-secret";
        let incident_id = Uuid::from_u128(1);
        let expires = 9_999_999_999i64;
        let token = sign_snooze_token(secret, incident_id, expires);
        let tampered = format!("{}x", &token[..token.len() - 1]);
        assert!(!verify_snooze_token(
            secret,
            incident_id,
            expires,
            &tampered
        ));
    }

    // --- build_incident_subject ---

    fn make_incident(
        notification_type: NotificationType,
        alert_type: &str,
    ) -> IncidentNotification {
        IncidentNotification {
            incident_id: Uuid::nil(),
            alert_record_id: Uuid::nil(),
            monitor_id: Uuid::nil(),
            alert_type: alert_type.to_string(),
            affected_regions: vec!["us-east-1".to_string()],
            notification_type,
            opened_at: chrono::DateTime::parse_from_rfc3339("2026-01-15T12:00:00Z")
                .unwrap()
                .with_timezone(&chrono::Utc),
            actual: Some(45.0),
            threshold: Some(80.0),
            duration: chrono::Duration::hours(2),
            notification_count: 1,
            delta_pct: None,
            comparator: None,
            deviation_factor: None,
            diagnosis: None,
            action: None,
        }
    }

    fn make_recovery(alert_type: &str, notification_count: i32) -> RecoveryNotification {
        RecoveryNotification {
            monitor_id: Uuid::nil(),
            alert_type: alert_type.to_string(),
            affected_regions: vec!["us-east-1".to_string()],
            duration: chrono::Duration::hours(3),
            notification_count,
            actual: Some(95.0),
            threshold: Some(80.0),
        }
    }

    fn region_labels() -> HashMap<String, String> {
        HashMap::new()
    }

    #[test]
    fn test_subject_first_fire_no_snake_case() {
        let n = make_incident(NotificationType::FirstFire, "cache_hit_low");
        let subject =
            build_incident_subject(&n, alert_type_display("cache_hit_low"), "example.com");
        assert!(
            !subject.contains('_'),
            "subject must not contain snake_case: {subject}"
        );
        assert!(
            !subject.contains("MEDIUM"),
            "medium severity stays out of subject: {subject}"
        );
        assert!(subject.contains("Low Cache Hit Rate"));
        assert!(subject.contains("example.com"));
    }

    #[test]
    fn test_subject_first_fire_critical() {
        let n = make_incident(NotificationType::FirstFire, "down");
        let subject = build_incident_subject(&n, alert_type_display("down"), "my-monitor");
        assert!(
            subject.starts_with("[CacheSnap] CRITICAL:"),
            "got: {subject}"
        );
        assert!(subject.contains("Monitor Down"));
    }

    #[test]
    fn test_subject_digest_includes_duration() {
        let n = make_incident(NotificationType::Digest, "ttfb_limit");
        let subject = build_incident_subject(&n, alert_type_display("ttfb_limit"), "site.com");
        assert!(subject.contains("Still ongoing"), "got: {subject}");
        assert!(
            subject.contains("2h"),
            "duration short-form must appear: got {subject}"
        );
        assert!(subject.contains("TTFB Above Limit"));
    }

    #[test]
    fn test_subject_recovery_format() {
        let n = make_incident(NotificationType::Recovery, "ttfb_anomaly");
        let subject = build_incident_subject(&n, alert_type_display("ttfb_anomaly"), "api.example.com");
        assert!(
            subject.starts_with("[CacheSnap] Resolved:"),
            "got: {subject}"
        );
        assert!(subject.contains("TTFB Anomaly"));
        assert!(subject.contains("api.example.com"));
        assert!(
            !subject.contains('_'),
            "no snake_case in recovery subject: {subject}"
        );
    }

    // --- build_incident_email_html ---

    #[test]
    fn test_email_html_no_panic_notification_count_1() {
        let n = make_incident(NotificationType::FirstFire, "cache_hit_low");
        let html = build_incident_email_html(
            &n,
            "My Monitor",
            "https://example.com",
            "us-east-1",
            &region_labels(),
            "https://snooze.url",
            "https://app.cachesnap.com",
        );
        assert!(html.contains("Low Cache Hit Rate"), "type label missing");
        assert!(html.contains("My Monitor"));
        assert!(html.contains("Medium impact"));
        assert!(
            html.contains("First detected at") && html.contains("2026-01-15 12:00 UTC"),
            "email should include incident opened_at (UTC)"
        );
    }

    #[test]
    fn test_email_html_none_diagnosis_action() {
        let mut n = make_incident(NotificationType::FirstFire, "ttfb_limit");
        n.diagnosis = None;
        n.action = None;
        let html = build_incident_email_html(
            &n,
            "mon",
            "https://example.com",
            "eu-west-1",
            &region_labels(),
            "https://snooze",
            "https://app",
        );
        assert!(
            !html.contains("<strong>Action:</strong>"),
            "empty action must not render"
        );
        assert!(html.contains("TTFB Above Limit"));
    }

    #[test]
    fn test_email_html_with_diagnosis_and_action() {
        let mut n = make_incident(NotificationType::Digest, "ttfb_limit");
        n.diagnosis = Some("CDN congestion detected".to_string());
        n.action = Some("Check origin latency".to_string());
        let html = build_incident_email_html(
            &n,
            "mon",
            "https://example.com",
            "eu-west-1",
            &region_labels(),
            "https://snooze",
            "https://app",
        );
        assert!(html.contains("CDN congestion detected"));
        assert!(html.contains("Check origin latency"));
        assert!(html.contains("Action:"));
    }

    #[test]
    fn test_email_html_rewrites_legacy_global_ttfb_trend_diagnosis() {
        let mut n = make_incident(NotificationType::Digest, "ttfb_trend_up_global");
        n.diagnosis = Some(
            "TTFB increased 31.6% vs previous hour · all regions · 359ms now vs 273ms reference"
                .to_string(),
        );
        let html = build_incident_email_html(
            &n,
            "mon",
            "https://example.com",
            "aggregate",
            &region_labels(),
            "https://snooze",
            "https://app",
        );
        assert!(html.contains("Global aggregate TTFB increased"));
        assert!(!html.contains("· all regions ·"));
    }

    #[test]
    fn test_slack_rewrites_legacy_global_cache_trend_diagnosis() {
        let mut n = make_incident(NotificationType::Digest, "cache_hit_trend_drop_global");
        n.diagnosis = Some(
            "Cache hit fell 11.1 pp vs previous hour (14.2% relative) · all regions · 67.2% now vs 78.3% reference"
                .to_string(),
        );
        let text = build_slack_incident_text(
            &n,
            "mon",
            "aggregate",
            &region_labels(),
            "https://snooze",
            "https://site.com",
            "https://app",
        );
        assert!(text.contains("Global cache hit rate fell"));
        assert!(!text.contains("· all regions ·"));
    }

    #[test]
    fn test_email_html_digest_shows_ongoing() {
        let n = make_incident(NotificationType::Digest, "down");
        let html = build_incident_email_html(
            &n,
            "mon",
            "https://example.com",
            "global",
            &region_labels(),
            "https://snooze",
            "https://app",
        );
        assert!(
            html.contains("Still Ongoing"),
            "digest header should mark ongoing state"
        );
        assert!(
            html.contains("Since <strong")
                && html.contains("2026-01-15 12:00 UTC")
                && html.contains("2 hours")
                && html.contains("1 notification sent"),
            "digest email should show start time, duration, and notification count on one line"
        );
    }

    // --- build_slack_incident_text ---

    #[test]
    fn test_slack_first_fire_has_warning_emoji() {
        let n = make_incident(NotificationType::FirstFire, "down");
        let text = build_slack_incident_text(
            &n,
            "My Site",
            "global",
            &region_labels(),
            "https://snooze",
            "https://site.com",
            "https://app",
        );
        assert!(
            text.contains("🚨"),
            "FirstFire must use 🚨 emoji for down"
        );
        assert!(text.contains("CRITICAL"));
        assert!(text.contains("Monitor Down"));
        assert!(
            text.contains("First detected at") && text.contains("2026-01-15 12:00 UTC"),
            "slack should include opened_at"
        );
    }

    #[test]
    fn test_slack_digest_has_hourglass_emoji() {
        let n = make_incident(NotificationType::Digest, "cache_hit_low");
        let text = build_slack_incident_text(
            &n,
            "My Site",
            "us-east-1",
            &region_labels(),
            "https://snooze",
            "https://site.com",
            "https://app",
        );
        assert!(
            text.contains("⏳"),
            "Digest must use hourglass emoji"
        );
        assert!(text.contains("ONGOING"));
        assert!(
            text.contains("Since ")
                && text.contains("2026-01-15 12:00 UTC")
                && text.contains("2 hours")
                && text.contains("1 notification"),
            "slack digest should include opened_at, duration, and count"
        );
    }

    #[test]
    fn test_slack_recovery_has_checkmark_emoji() {
        let n = make_incident(NotificationType::Recovery, "ttfb_limit");
        let text = build_slack_incident_text(
            &n,
            "My Site",
            "ap-southeast-1",
            &region_labels(),
            "https://snooze",
            "https://site.com",
            "https://app",
        );
        assert!(
            text.contains("✅"),
            "Recovery must use checkmark emoji"
        );
        assert!(text.contains("RESOLVED"));
    }

    #[test]
    fn test_slack_incident_includes_metric_values() {
        let n = make_incident(NotificationType::FirstFire, "cache_hit_low");
        let text = build_slack_incident_text(
            &n,
            "my-monitor",
            "eu-west-1",
            &region_labels(),
            "https://snooze",
            "https://site.com",
            "https://app",
        );
        assert!(text.contains("45.0%"), "actual must appear with % unit");
        assert!(text.contains("80.0%"), "threshold must appear");
    }

    // --- build_slack_recovery_text ---

    #[test]
    fn test_slack_recovery_text_single_region() {
        let n = make_recovery("cache_hit_low", 3);
        let text = build_slack_recovery_text(
            &n,
            "my-monitor",
            "Low Cache Hit Rate",
            &region_labels(),
            "https://app",
        );
        assert!(text.contains("✅"));
        assert!(text.contains("RESOLVED"));
        assert!(text.contains("my-monitor"));
        assert!(text.contains("3 hours"), "duration must appear");
        assert!(
            text.contains("us-east-1"),
            "region must appear for single-region incident"
        );
    }

    #[test]
    fn test_slack_recovery_text_multi_region() {
        let mut n = make_recovery("down", 5);
        n.affected_regions = vec![
            "us-east-1".to_string(),
            "eu-west-1".to_string(),
            "ap-southeast-1".to_string(),
        ];
        let text = build_slack_recovery_text(
            &n,
            "cdn-monitor",
            "Monitor Down",
            &region_labels(),
            "https://app",
        );
        assert!(
            text.contains("3 regions"),
            "multi-region must say N regions"
        );
    }

    #[test]
    fn test_slack_recovery_text_no_snake_case() {
        let n = make_recovery("cache_hit_trend_drop_global", 2);
        let text = build_slack_recovery_text(
            &n,
            "monitor",
            "Cache Hit Trend Drop (Global)",
            &region_labels(),
            "https://app",
        );
        assert!(
            !text.contains("cache_hit_trend_drop_global"),
            "alert_type slug must not appear raw"
        );
    }

    // --- build_recovery_email_html ---

    #[test]
    fn test_recovery_email_html_renders_without_panic() {
        let n = make_recovery("down", 4);
        let html = build_recovery_email_html(&n, "my-monitor", "Monitor Down");
        assert!(html.contains("Monitor Down"));
        assert!(html.contains("my-monitor"));
        assert!(
            html.contains("3 hours"),
            "duration must appear in recovery email"
        );
        assert!(
            html.contains("4 notification"),
            "notification count must appear"
        );
    }

    #[test]
    fn test_recovery_email_html_metric_values() {
        let n = make_recovery("cache_hit_low", 2);
        let html = build_recovery_email_html(&n, "mon", "Low Cache Hit Rate");
        assert!(html.contains("95.0%"), "actual must appear with unit");
        assert!(html.contains("80.0%"), "threshold must appear");
    }

    #[test]
    fn test_recovery_email_html_no_metrics_when_none() {
        let mut n = make_recovery("down", 1);
        n.actual = None;
        n.threshold = None;
        let html = build_recovery_email_html(&n, "mon", "Monitor Down");
        assert!(
            !html.contains("Final reading"),
            "no metric row when values are None"
        );
        assert!(html.contains("1 notification"), "singular form");
    }
}
