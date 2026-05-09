use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct AlertIncident {
    pub id: Uuid,
    pub monitor_id: Uuid,
    pub alert_type: String,
    pub severity: String,
    pub affected_regions: Vec<String>,
    pub last_actual: Option<f64>,
    pub last_threshold: Option<f64>,
    pub opened_at: DateTime<Utc>,
    pub last_notified_at: Option<DateTime<Utc>>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub notification_count: i32,
    pub snoozed_until: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[allow(dead_code)]
impl AlertIncident {
    pub fn is_snoozed(&self) -> bool {
        self.snoozed_until.map_or(false, |t| t > Utc::now())
    }

    pub fn active_duration(&self) -> chrono::Duration {
        let end = self.resolved_at.unwrap_or_else(Utc::now);
        end - self.opened_at
    }
}

/// Minimal row returned by resolve_stale_incidents for recovery email decisions.
#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct ResolvedIncident {
    pub id: Uuid,
    pub monitor_id: Uuid,
    pub alert_type: String,
    pub severity: String,
    pub notification_count: i32,
    pub opened_at: DateTime<Utc>,
    pub resolved_at: DateTime<Utc>,
    pub affected_regions: Vec<String>,
}
