/// Alert severity tiers with repeat notification cadences and recovery email policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlertSeverity {
    Critical,
    High,
    Medium,
    Low,
}

impl AlertSeverity {
    pub fn as_str(&self) -> &'static str {
        match self {
            AlertSeverity::Critical => "critical",
            AlertSeverity::High => "high",
            AlertSeverity::Medium => "medium",
            AlertSeverity::Low => "low",
        }
    }

    /// Minutes between repeat digest notifications while the incident stays open.
    pub fn repeat_cooldown_minutes(&self) -> i64 {
        match self {
            AlertSeverity::Critical => 60,   // 1 hour
            AlertSeverity::High => 240,       // 4 hours
            AlertSeverity::Medium => 480,     // 8 hours
            AlertSeverity::Low => 1440,       // 24 hours
        }
    }

    /// Only CRITICAL and HIGH get a recovery email (resolved notification).
    pub fn sends_recovery(&self) -> bool {
        matches!(self, AlertSeverity::Critical | AlertSeverity::High)
    }

    /// CSS hex color for severity badge in HTML emails.
    pub fn color(&self) -> &'static str {
        match self {
            AlertSeverity::Critical => "#dc2626",
            AlertSeverity::High => "#ea580c",
            AlertSeverity::Medium => "#ca8a04",
            AlertSeverity::Low => "#6b7280",
        }
    }
}

impl std::fmt::Display for AlertSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Map alert_type slug → severity tier.
pub fn alert_severity(alert_type: &str) -> AlertSeverity {
    match alert_type {
        "down" => AlertSeverity::Critical,
        "ttfb_threshold" | "anomaly" => AlertSeverity::High,
        "cache_hit_low"
        | "cache_hit_trend_drop_region"
        | "cache_hit_trend_drop_global" => AlertSeverity::Medium,
        // ttfb trends, anycast, zombie_cache, ssl_expiry, unknown
        _ => AlertSeverity::Low,
    }
}

/// Human-readable display name for alert_type slugs (no snake_case in emails).
pub fn alert_type_display(alert_type: &str) -> &'static str {
    match alert_type {
        "down" => "Monitor Offline",
        "ttfb_threshold" => "TTFB Threshold Exceeded",
        "anomaly" => "Latency Anomaly",
        "cache_hit_low" => "Cache Hit Rate Low",
        "ssl_expiry" => "SSL Certificate Expiring",
        "zombie_cache" => "Cache Age Alert",
        "anycast" => "Anycast Routing Issue",
        "cache_hit_trend_drop_region" => "Cache Hit Trend Drop (Region)",
        "cache_hit_trend_drop_global" => "Cache Hit Trend Drop (Global)",
        "ttfb_trend_up_region" => "TTFB Trend Worsening (Region)",
        "ttfb_trend_up_global" => "TTFB Trend Worsening (Global)",
        "ttfb_trend_down_region" => "TTFB Improved (Region)",
        "ttfb_trend_down_global" => "TTFB Improved (Global)",
        _ => "Unknown Alert",
    }
}

/// Whether the metric is cache-based (vs TTFB/latency). Determines unit labels.
pub fn is_cache_metric(alert_type: &str) -> bool {
    alert_type.contains("cache_hit")
}

/// Unit label for the metric (appended to values in notifications).
pub fn metric_unit(alert_type: &str) -> &'static str {
    if is_cache_metric(alert_type) { "%" } else { "ms" }
}

/// Format a duration in human-readable English (e.g. "42 minutes", "6 hours", "2 days").
pub fn format_duration(duration: &chrono::Duration) -> String {
    let total_minutes = duration.num_minutes().max(0);
    let total_hours = duration.num_hours();
    let total_days = duration.num_days();

    if total_days >= 2 {
        format!("{} days", total_days)
    } else if total_days == 1 {
        "1 day".to_string()
    } else if total_hours >= 1 {
        if total_hours == 1 {
            "1 hour".to_string()
        } else {
            format!("{} hours", total_hours)
        }
    } else if total_minutes == 1 {
        "1 minute".to_string()
    } else {
        format!("{} minutes", total_minutes)
    }
}

/// Short duration label for email subjects: "6h", "2d", "42m".
pub fn format_duration_short(duration: &chrono::Duration) -> String {
    let total_hours = duration.num_hours();
    let total_days = duration.num_days();
    if total_days >= 1 {
        format!("{}d", total_days)
    } else if total_hours >= 1 {
        format!("{}h", total_hours)
    } else {
        format!("{}m", duration.num_minutes().max(1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn test_all_known_types_have_display_names() {
        let known_types = [
            "down", "ttfb_threshold", "anomaly", "cache_hit_low", "ssl_expiry",
            "zombie_cache", "anycast", "cache_hit_trend_drop_region",
            "cache_hit_trend_drop_global", "ttfb_trend_up_region",
            "ttfb_trend_up_global", "ttfb_trend_down_region", "ttfb_trend_down_global",
        ];
        for t in known_types {
            let name = alert_type_display(t);
            assert!(!name.is_empty(), "empty display for {t}");
            assert!(!name.contains('_'), "snake_case in display for {t}: {name}");
        }
    }

    #[test]
    fn test_unknown_type_fallback() {
        assert_eq!(alert_type_display("some_new_type"), "Unknown Alert");
    }

    #[test]
    fn test_severity_tiers() {
        assert_eq!(alert_severity("down"), AlertSeverity::Critical);
        assert_eq!(alert_severity("ttfb_threshold"), AlertSeverity::High);
        assert_eq!(alert_severity("anomaly"), AlertSeverity::High);
        assert_eq!(alert_severity("cache_hit_low"), AlertSeverity::Medium);
        assert_eq!(alert_severity("cache_hit_trend_drop_region"), AlertSeverity::Medium);
        assert_eq!(alert_severity("ttfb_trend_up_region"), AlertSeverity::Low);
        assert_eq!(alert_severity("ssl_expiry"), AlertSeverity::Low);
        assert_eq!(alert_severity("zombie_cache"), AlertSeverity::Low);
        assert_eq!(alert_severity("anycast"), AlertSeverity::Low);
    }

    #[test]
    fn test_repeat_cooldowns() {
        assert_eq!(AlertSeverity::Critical.repeat_cooldown_minutes(), 60);
        assert_eq!(AlertSeverity::High.repeat_cooldown_minutes(), 240);
        assert_eq!(AlertSeverity::Medium.repeat_cooldown_minutes(), 480);
        assert_eq!(AlertSeverity::Low.repeat_cooldown_minutes(), 1440);
    }

    #[test]
    fn test_recovery_policy() {
        assert!(AlertSeverity::Critical.sends_recovery());
        assert!(AlertSeverity::High.sends_recovery());
        assert!(!AlertSeverity::Medium.sends_recovery());
        assert!(!AlertSeverity::Low.sends_recovery());
    }

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(&Duration::minutes(0)), "0 minutes");
        assert_eq!(format_duration(&Duration::minutes(1)), "1 minute");
        assert_eq!(format_duration(&Duration::minutes(42)), "42 minutes");
        assert_eq!(format_duration(&Duration::hours(1)), "1 hour");
        assert_eq!(format_duration(&Duration::hours(6)), "6 hours");
        assert_eq!(format_duration(&Duration::hours(23)), "23 hours");
        assert_eq!(format_duration(&Duration::hours(24)), "1 day");
        assert_eq!(format_duration(&Duration::hours(48)), "2 days");
        assert_eq!(format_duration(&Duration::hours(72)), "3 days");
    }

    #[test]
    fn test_format_duration_short() {
        assert_eq!(format_duration_short(&Duration::minutes(42)), "42m");
        assert_eq!(format_duration_short(&Duration::hours(6)), "6h");
        assert_eq!(format_duration_short(&Duration::hours(25)), "1d");
    }
}
