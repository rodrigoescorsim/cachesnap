use serde::Serialize;

#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq)]
pub enum Severity {
    Critical,
    Warning,
    Info,
    Ok,
}

#[derive(Debug, Clone, Serialize)]
pub struct Diagnosis {
    pub severity: String,
    pub cause: String,
    pub action: String,
    pub summary: String,
    pub estimated_gain_ms: Option<f64>,
}

pub struct DiagnosisInput {
    pub ttfb_ms: Option<f64>,
    pub cache_status: Option<String>,
    pub baseline_ttfb_ms: Option<f64>,
    pub redirect_count: Option<i32>,
    pub http_version: Option<String>,
    pub region: String,
    pub error: Option<String>,
    pub served_by: Option<String>, // CF-Ray or X-Served-By — used for anycast audit
    pub age_s: Option<i32>,        // Age response header — used for zombie cache detection
}

// ─── IATA → HopLens region mapping ───────────────────────────────────────────
// Maps Cloudflare PoP IATA codes to the probe region they should ideally serve.
// Used for anycast routing audit: if a probe from sa-east is answered by an IAD
// PoP (us-east territory), traffic is traveling farther than necessary.

fn iata_to_region(iata: &str) -> Option<&'static str> {
    match iata {
        // South America
        "GRU" | "GIG" | "EZE" | "SCL" | "BOG" | "LIM" | "UIO" | "MVD" | "ASU" | "CWB"
        | "POA" | "FOR" | "SSA" | "BEL" | "MAO" => Some("sa-east"),
        // North America (grouped under us-east for probe routing purposes)
        "IAD" | "JFK" | "EWR" | "ORD" | "LAX" | "DFW" | "SJC" | "ATL" | "MIA" | "BOS"
        | "SEA" | "DEN" | "PDX" | "MSP" | "DTW" | "PHX" | "CLT" | "YYZ" | "YVR" | "SFO"
        | "YUL" | "LAS" | "SLC" | "HNL" | "ANC" => Some("us-east"),
        // Europe
        "LHR" | "AMS" | "FRA" | "CDG" | "MXP" | "MAD" | "ARN" | "WAW" | "PRG" | "VIE"
        | "MAN" | "BRU" | "HEL" | "OSL" | "CPH" | "ZUR" | "LIS" | "ATH" | "DUB" | "BCN"
        | "MRS" | "HAM" | "MUC" | "BUD" | "OTP" | "SOF" | "TXL" | "BER" | "FCO" => Some("eu-west"),
        // Asia Pacific
        "NRT" | "SIN" | "HKG" | "BOM" | "DEL" | "ICN" | "KUL" | "BKK" | "CGK" | "MNL"
        | "PVG" | "TPE" | "CAN" | "SZX" | "HAN" | "SGN" | "CMB" | "CCU" | "KHI" | "DAC"
        | "RGN" | "MLE" | "DXB" | "AUH" | "KWI" | "BAH" | "DOH" | "RUH" | "AMM" | "BEY"
        | "TLV" | "IST" | "ESB" => Some("ap-east"),
        // Oceania
        "SYD" | "MEL" | "BNE" | "PER" | "ADL" | "AKL" | "CHC" | "WLG" | "NOU" | "PPT" => Some("oc"),
        _ => None,
    }
}

/// Extracts the IATA airport code from a CF-Ray value like "87c1d4a2b3c4d5e6-GRU"
/// or a plain IATA string like "GRU".
pub fn extract_iata_from_served_by(served_by: &str) -> Option<&str> {
    // CF-Ray format: hex-IATA
    if let Some(pos) = served_by.rfind('-') {
        let candidate = &served_by[pos + 1..];
        if candidate.len() >= 2
            && candidate.len() <= 4
            && candidate.chars().all(|c| c.is_ascii_uppercase())
        {
            return Some(candidate);
        }
    }
    // Plain IATA code (X-Served-By or fallback)
    if served_by.len() >= 2
        && served_by.len() <= 4
        && served_by.chars().all(|c| c.is_ascii_uppercase())
    {
        return Some(served_by);
    }
    None
}

/// Returns Some((iata, served_region)) if the served_by PoP belongs to a different
/// region than the probe's region. Returns None if routing is correct or unknown.
pub fn detect_anycast_mismatch<'a>(served_by: &'a str, probe_region: &str) -> Option<(&'a str, &'static str)> {
    let iata = extract_iata_from_served_by(served_by)?;
    let served_region = iata_to_region(iata)?;
    if served_region != probe_region {
        Some((iata, served_region))
    } else {
        None
    }
}

// ─── Rule-based diagnosis engine ─────────────────────────────────────────────

/// Engine de diagnóstico rule-based.
/// Recebe métricas de um probe result e retorna causa + ação recomendada.
/// Sem LLM — determinístico e testável.
///
/// Rule priority (highest → lowest):
///   1. Connectivity error (site unreachable)
///   2. Cache MISS / BYPASS with high TTFB  ← most actionable for performance
///   3. TTFB anomaly vs 7-day baseline
///   4. Excessive redirects
///   5. Cache HIT but slow edge function
///   6. HTTP/1.1 upgrade suggestion
///   7. Zombie cache (Age > 86400)          ← background audit, lower priority
///   8. Anycast routing mismatch            ← background audit, lower priority
///   9. OK (no issues)
pub fn diagnose(input: &DiagnosisInput) -> Diagnosis {
    // 1. Connectivity error
    if let Some(err) = &input.error {
        return Diagnosis {
            severity: "critical".into(),
            cause: format!("Probe failed: {err}"),
            action: "Check if the URL is accessible and responding.".into(),
            summary: format!("Site unreachable from {}", input.region),
            estimated_gain_ms: None,
        };
    }

    let ttfb = input.ttfb_ms.unwrap_or(0.0);
    let cache = input.cache_status.as_deref().unwrap_or("").to_uppercase();

    // 2. Cache MISS / BYPASS with high TTFB → origin being hit every request
    if (cache.contains("MISS") || cache.contains("BYPASS")) && ttfb > 200.0 {
        let gain = ttfb - 30.0; // estimate: a cache HIT would cost ~30ms
        return Diagnosis {
            severity: "critical".into(),
            cause: format!(
                "Cache {} — origin server is being consulted for every request in {}.",
                cache, input.region
            ),
            action: "Add `Cache-Control: public, s-maxage=300` to your response headers. \
                     For Next.js, use `export const revalidate = 300` in your page."
                .into(),
            summary: format!("Cache {} in {} is adding ~{:.0}ms", cache, input.region, gain),
            estimated_gain_ms: Some(gain),
        };
    }

    // 3. TTFB anomaly vs 7-day baseline
    if let Some(baseline) = input.baseline_ttfb_ms {
        let factor = ttfb / baseline;
        if factor > 2.0 {
            return Diagnosis {
                severity: "warning".into(),
                cause: format!(
                    "TTFB is {:.1}x slower than your 7-day baseline ({:.0}ms vs {:.0}ms normal) in {}.",
                    factor, ttfb, baseline, input.region
                ),
                action: "Check for recent deploys, increased origin load, or cold starts.".into(),
                summary: format!("{:.1}x slower than normal in {}", factor, input.region),
                estimated_gain_ms: Some(ttfb - baseline),
            };
        }
    }

    // 4. Excessive redirects
    if let Some(redirects) = input.redirect_count {
        if redirects > 1 {
            let cost = redirects as f64 * 150.0; // ~150ms per hop estimate
            return Diagnosis {
                severity: "warning".into(),
                cause: format!("{redirects} redirect hops detected. Each hop adds ~150ms RTT."),
                action: "Configure a direct redirect from http:// to https://www in one step. \
                         Avoid intermediate hops."
                    .into(),
                summary: format!("{redirects} unnecessary redirects (+~{:.0}ms)", cost),
                estimated_gain_ms: Some(cost),
            };
        }
    }

    // 5. Cache HIT but slow edge function
    if cache.contains("HIT") && ttfb > 150.0 {
        return Diagnosis {
            severity: "warning".into(),
            cause: format!(
                "Cache HIT but TTFB is {:.0}ms in {} — edge function may be slow.",
                ttfb, input.region
            ),
            action: "Review edge function logic. Consider moving heavy computation to build time \
                     or reducing middleware chain."
                .into(),
            summary: format!(
                "Slow edge function in {} ({:.0}ms despite cache HIT)",
                input.region, ttfb
            ),
            estimated_gain_ms: None,
        };
    }

    // 6. HTTP/1.1 — suggest upgrade
    if input.http_version.as_deref() == Some("HTTP/1.1") && ttfb > 100.0 {
        return Diagnosis {
            severity: "info".into(),
            cause: "Site is using HTTP/1.1. HTTP/2 or HTTP/3 would improve multiplexing.".into(),
            action: "Enable HTTP/2 on your CDN or origin server.".into(),
            summary: "HTTP/1.1 detected — upgrade available".into(),
            estimated_gain_ms: Some(30.0),
        };
    }

    // 7. Zombie cache — content older than 24h; lower priority than performance issues
    if let Some(age) = input.age_s {
        if age > 86_400 {
            let days = age / 86_400;
            return Diagnosis {
                severity: "warning".into(),
                cause: format!(
                    "Cache content is {days}d old (Age: {age}s). \
                     The CDN may not be invalidating this resource properly — \
                     users could be receiving stale content."
                ),
                action: "Verify your cache invalidation strategy. Use `Cache-Control: s-maxage=N` \
                         combined with `stale-while-revalidate`, or configure purge rules on your CDN \
                         to evict content after significant updates."
                    .into(),
                summary: format!("Zombie cache in {} — content {days}d old", input.region),
                estimated_gain_ms: None,
            };
        }
    }

    // 8. Anycast routing mismatch — background audit; lowest priority before "ok"
    if let Some(ref served_by) = input.served_by {
        if let Some((iata, served_region)) = detect_anycast_mismatch(served_by, &input.region) {
            return Diagnosis {
                severity: "warning".into(),
                cause: format!(
                    "Anycast routing mismatch: probe from {} is being answered by the {} PoP ({}). \
                     Traffic is crossing regions, adding unnecessary latency.",
                    input.region, iata, served_region
                ),
                action: "Review your CDN's anycast routing configuration. \
                         Check for geo-steering rules that may be directing traffic to the wrong PoP. \
                         For Cloudflare, verify your load balancer geo rules and origin health."
                    .into(),
                summary: format!(
                    "{} probe routed to {} PoP ({})",
                    input.region, iata, served_region
                ),
                estimated_gain_ms: Some(80.0),
            };
        }
    }

    // 9. All checks passed
    Diagnosis {
        severity: "ok".into(),
        cause: format!(
            "TTFB {:.0}ms from {} — within normal parameters.",
            ttfb, input.region
        ),
        action: String::new(),
        summary: format!("Healthy from {} ({:.0}ms)", input.region, ttfb),
        estimated_gain_ms: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_input() -> DiagnosisInput {
        DiagnosisInput {
            ttfb_ms: Some(45.0),
            cache_status: Some("HIT".into()),
            baseline_ttfb_ms: Some(40.0),
            redirect_count: Some(0),
            http_version: Some("HTTP/2".into()),
            region: "us-east".into(),
            error: None,
            served_by: None,
            age_s: None,
        }
    }

    // ── Existing rules ────────────────────────────────────────────────────────

    #[test]
    fn detects_cache_miss() {
        let d = diagnose(&DiagnosisInput {
            ttfb_ms: Some(450.0),
            cache_status: Some("MISS".into()),
            region: "sa-east".into(),
            ..base_input()
        });
        assert_eq!(d.severity, "critical");
        assert!(d.cause.contains("MISS"));
        assert!(d.estimated_gain_ms.unwrap() > 0.0);
    }

    #[test]
    fn detects_anomaly_vs_baseline() {
        let d = diagnose(&DiagnosisInput {
            ttfb_ms: Some(600.0),
            cache_status: Some("HIT".into()),
            baseline_ttfb_ms: Some(80.0),
            region: "eu-west".into(),
            ..base_input()
        });
        assert_eq!(d.severity, "warning");
        assert!(d.cause.contains("7-day baseline"));
    }

    #[test]
    fn healthy_site_returns_ok() {
        let d = diagnose(&base_input());
        assert_eq!(d.severity, "ok");
    }

    // ── Zombie cache ──────────────────────────────────────────────────────────

    #[test]
    fn detects_zombie_cache() {
        let d = diagnose(&DiagnosisInput {
            age_s: Some(90_000), // 25 hours
            ..base_input()
        });
        assert_eq!(d.severity, "warning");
        assert!(d.cause.contains("stale"));
        assert!(d.summary.contains("Zombie cache"));
    }

    #[test]
    fn zombie_cache_not_triggered_for_fresh_content() {
        let d = diagnose(&DiagnosisInput {
            age_s: Some(3600), // 1 hour — fine
            ..base_input()
        });
        assert_eq!(d.severity, "ok");
    }

    /// Cache MISS + high TTFB must take priority over zombie cache (rule 2 > rule 7)
    #[test]
    fn cache_miss_beats_zombie_cache() {
        let d = diagnose(&DiagnosisInput {
            ttfb_ms: Some(500.0),
            cache_status: Some("MISS".into()),
            age_s: Some(172_800), // 2 days old — zombie cache
            baseline_ttfb_ms: None,
            ..base_input()
        });
        assert_eq!(d.severity, "critical");
        assert!(d.cause.contains("MISS"), "Cache MISS should win over zombie cache");
    }

    /// Baseline anomaly must take priority over zombie cache (rule 3 > rule 7)
    #[test]
    fn baseline_anomaly_beats_zombie_cache() {
        let d = diagnose(&DiagnosisInput {
            ttfb_ms: Some(800.0),
            cache_status: Some("HIT".into()),
            baseline_ttfb_ms: Some(100.0), // 8x slower
            age_s: Some(172_800),           // also zombie cache
            ..base_input()
        });
        assert_eq!(d.severity, "warning");
        assert!(d.cause.contains("7-day baseline"), "Baseline anomaly should win over zombie cache");
    }

    // ── Anycast audit ─────────────────────────────────────────────────────────

    #[test]
    fn detects_anycast_mismatch() {
        // Probe from sa-east but served by IAD (us-east)
        let d = diagnose(&DiagnosisInput {
            served_by: Some("abc123def456789-IAD".into()),
            region: "sa-east".into(),
            ..base_input()
        });
        assert_eq!(d.severity, "warning");
        assert!(d.summary.contains("IAD"));
        assert!(d.cause.contains("routing mismatch"));
    }

    #[test]
    fn anycast_no_alert_when_region_matches() {
        // Probe from sa-east, served by GRU (sa-east) — correct routing
        let d = diagnose(&DiagnosisInput {
            served_by: Some("abc123def456789-GRU".into()),
            region: "sa-east".into(),
            ..base_input()
        });
        assert_eq!(d.severity, "ok");
    }

    /// Cache MISS must take priority over anycast mismatch (rule 2 > rule 8)
    #[test]
    fn cache_miss_beats_anycast() {
        let d = diagnose(&DiagnosisInput {
            ttfb_ms: Some(500.0),
            cache_status: Some("MISS".into()),
            served_by: Some("abc123-IAD".into()),
            region: "sa-east".into(),
            baseline_ttfb_ms: None,
            ..base_input()
        });
        assert_eq!(d.severity, "critical");
        assert!(d.cause.contains("MISS"), "Cache MISS should win over anycast");
    }

    // ── IATA helpers ──────────────────────────────────────────────────────────

    #[test]
    fn iata_extraction_handles_cf_ray_format() {
        assert_eq!(extract_iata_from_served_by("87c1d4a2b3c4d5e6-GRU"), Some("GRU"));
        assert_eq!(extract_iata_from_served_by("abc123-IAD"), Some("IAD"));
        assert_eq!(extract_iata_from_served_by("GRU"), Some("GRU")); // plain IATA
        assert_eq!(extract_iata_from_served_by("unknown"), None);
        assert_eq!(extract_iata_from_served_by(""), None);
    }

    #[test]
    fn detect_anycast_mismatch_returns_none_for_same_region() {
        assert!(detect_anycast_mismatch("abc-GRU", "sa-east").is_none());
        assert!(detect_anycast_mismatch("abc-LHR", "eu-west").is_none());
        assert!(detect_anycast_mismatch("abc-SYD", "oc").is_none());
    }

    #[test]
    fn detect_anycast_mismatch_returns_some_for_cross_region() {
        let result = detect_anycast_mismatch("abc-IAD", "sa-east");
        assert!(result.is_some());
        let (iata, region) = result.unwrap();
        assert_eq!(iata, "IAD");
        assert_eq!(region, "us-east");
    }
}
