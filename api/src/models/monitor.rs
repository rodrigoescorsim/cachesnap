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
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}
