use crate::AppState;
use serde_json::json;
use tracing::{error, info, warn};
use uuid::Uuid;

pub struct AlertNotification {
    pub alert_id: Uuid,
    pub monitor_id: Uuid,
    pub alert_type: String,
    pub region: String,
    pub diagnosis: Option<String>,
    pub action: Option<String>,
    pub actual_ms: Option<f64>,
    pub baseline_ms: Option<f64>,
    pub deviation_factor: Option<f64>,
    // Trend alert context (None for non-trend alerts)
    pub delta_pct: Option<f64>,
    pub comparator: Option<String>,
}

pub async fn notify(state: AppState, notif: AlertNotification) {
    // Fetch monitor notification settings + url/name
    let monitor = sqlx::query!(
        r#"
        SELECT url, name,
               notify_email, notify_email_enabled,
               notify_slack_webhook, notify_slack_enabled
        FROM monitors WHERE id = $1
        "#,
        notif.monitor_id
    )
    .fetch_optional(&state.db)
    .await;

    let monitor = match monitor {
        Ok(Some(m)) => m,
        Ok(None) => return,
        Err(e) => {
            error!("notifier: failed to fetch monitor {}: {}", notif.monitor_id, e);
            return;
        }
    };

    let monitor_label = monitor.name.as_deref()
        .unwrap_or_else(|| monitor.url.as_str())
        .to_string();

    let subject = format!(
        "[CacheSnap] {} alert · {} · {}",
        capitalize(&notif.alert_type), notif.region, monitor_label
    );
    let body_text = build_body_text(&notif, &monitor_label);

    let mut notified_email = false;
    let mut notified_slack = false;

    // --- Email via Resend ---
    if monitor.notify_email_enabled {
        if let Some(to_email) = &monitor.notify_email {
            if let Some(api_key) = &state.config.resend_api_key {
                let html = build_email_html(&notif, &monitor_label, &monitor.url);
                match send_email(api_key, to_email, &subject, &html).await {
                    Ok(()) => {
                        notified_email = true;
                        info!("notifier: email sent to {} for alert {}", to_email, notif.alert_id);
                    }
                    Err(e) => error!("notifier: email failed for alert {}: {}", notif.alert_id, e),
                }
            } else {
                warn!("notifier: RESEND_API_KEY not set — skipping email for alert {}", notif.alert_id);
            }
        }
    }

    // --- Slack / Discord webhook ---
    if monitor.notify_slack_enabled {
        if let Some(webhook_url) = &monitor.notify_slack_webhook {
            match send_slack(webhook_url, &body_text).await {
                Ok(()) => {
                    notified_slack = true;
                    info!("notifier: slack sent for alert {}", notif.alert_id);
                }
                Err(e) => error!("notifier: slack failed for alert {}: {}", notif.alert_id, e),
            }
        }
    }

    // Update notified flags on the alert row
    if notified_email || notified_slack {
        let _ = sqlx::query!(
            r#"
            UPDATE alerts
            SET notified_email = $1, notified_slack = $2
            WHERE id = $3
            "#,
            notified_email,
            notified_slack,
            notif.alert_id
        )
        .execute(&state.db)
        .await;
    }
}

async fn send_email(api_key: &str, to: &str, subject: &str, html: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://api.resend.com/emails")
        .bearer_auth(api_key)
        .json(&json!({
            "from": "CacheSnap <alerts@CacheSnap.app>",
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

async fn send_slack(webhook_url: &str, text: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let res = client
        .post(webhook_url)
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

fn build_body_text(n: &AlertNotification, monitor_label: &str) -> String {
    let mut lines = vec![
        format!("*[CacheSnap]* {} alert for *{}* ({})", capitalize(&n.alert_type), monitor_label, n.region),
    ];
    if let Some(d) = &n.diagnosis {
        lines.push(d.clone());
    }
    if let Some(a) = &n.action {
        lines.push(format!("Action: {}", a));
    }
    // Trend alert: show delta % and absolute values
    if let (Some(delta), Some(actual), Some(baseline)) = (n.delta_pct, n.actual_ms, n.baseline_ms) {
        let cmp_label = n.comparator.as_deref().map(comparator_display).unwrap_or("reference");
        let sign = if delta > 0.0 { "+" } else { "" };
        if n.alert_type.contains("ttfb") {
            lines.push(format!("TTFB: {:.0}ms now vs {:.0}ms {} ({}{:.1}%)", actual, baseline, cmp_label, sign, delta));
        } else {
            lines.push(format!("Cache hit: {:.1}% now vs {:.1}% {} ({}{:.1}%)", actual, baseline, cmp_label, sign, delta));
        }
    } else if let (Some(actual), Some(baseline), Some(factor)) = (n.actual_ms, n.baseline_ms, n.deviation_factor) {
        lines.push(format!("{:.0}ms vs {:.0}ms baseline ({:.1}x slower)", actual, baseline, factor));
    }
    lines.join("\n")
}

fn build_email_html(n: &AlertNotification, monitor_label: &str, monitor_url: &str) -> String {
    let diagnosis = n.diagnosis.as_deref().unwrap_or("");
    let action = n.action.as_deref().unwrap_or("");
    let perf_line = if let (Some(delta), Some(actual), Some(baseline)) = (n.delta_pct, n.actual_ms, n.baseline_ms) {
        let cmp_label = n.comparator.as_deref().map(comparator_display).unwrap_or("reference");
        let sign = if delta > 0.0 { "+" } else { "" };
        if n.alert_type.contains("ttfb") {
            format!("<p style='color:#666'>TTFB: {:.0}ms now vs {:.0}ms {} ({}{:.1}%)</p>", actual, baseline, cmp_label, sign, delta)
        } else {
            format!("<p style='color:#666'>Cache hit: {:.1}% now vs {:.1}% {} ({}{:.1}%)</p>", actual, baseline, cmp_label, sign, delta)
        }
    } else if let (Some(actual), Some(baseline), Some(factor)) = (n.actual_ms, n.baseline_ms, n.deviation_factor) {
        format!("<p style='color:#666'>{:.0}ms vs {:.0}ms baseline ({:.1}x slower)</p>", actual, baseline, factor)
    } else { String::new() };

    format!(
        r#"<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
  <h2 style="color:#111">{type_label} alert &middot; {region}</h2>
  <p style="color:#555">Monitor: <strong>{label}</strong><br>
  <a href="{url}" style="color:#0066cc">{url}</a></p>
  {diag}
  {action_html}
  {perf}
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
  <p style="color:#999;font-size:12px">CacheSnap &mdash; Edge performance monitoring</p>
</div>"#,
        type_label = capitalize(&n.alert_type),
        region = n.region,
        label = monitor_label,
        url = monitor_url,
        diag = if !diagnosis.is_empty() { format!("<p style='color:#333'>{}</p>", diagnosis) } else { String::new() },
        action_html = if !action.is_empty() { format!("<p style='color:#0055aa'><strong>Action:</strong> {}</p>", action) } else { String::new() },
        perf = perf_line,
    )
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

fn comparator_display(c: &str) -> &str {
    match c {
        "prev_hour"          => "previous hour",
        "same_hour_prev_day" => "same time yesterday",
        "day_avg"            => "24h average",
        other                => other,
    }
}
