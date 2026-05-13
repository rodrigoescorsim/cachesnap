use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Monitor {
    pub id: Uuid,
    pub user_id: Uuid,
    pub url: String,
    pub name: Option<String>,
    pub check_interval_seconds: i32,
    pub alert_threshold_ms: i32,
    pub audit_interval_seconds: Option<i32>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub notify_email: Option<String>,
    pub notify_email_enabled: bool,
    pub notify_slack_webhook: Option<String>,
    pub notify_slack_enabled: bool,
    // Edge vs Origin readiness (DB columns `audit_readiness_*`, migration 026)
    pub audit_readiness_state: String,
    pub audit_readiness_updated_at: Option<DateTime<Utc>>,
    pub audit_readiness_consecutive_hits: i32,
    pub audit_readiness_reason: Option<String>,
    pub audit_readiness_comparable_pairs: i32,
    pub audit_readiness_comparable_regions: i32,
    pub audit_readiness_edge_hit_ratio: f64,
}
