use serde::Serialize;

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
}

/// Engine de diagnóstico rule-based.
/// Recebe métricas de um probe result e retorna causa + ação recomendada.
/// Sem LLM — determinístico e testável.
pub fn diagnose(input: &DiagnosisInput) -> Diagnosis {
    // Erro de conectividade
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

    // Cache MISS com TTFB alto → origin sendo consultado
    if (cache.contains("MISS") || cache.contains("BYPASS")) && ttfb > 200.0 {
        let gain = ttfb - 30.0; // estimativa: cache hit teria ~30ms
        return Diagnosis {
            severity: "critical".into(),
            cause: format!(
                "Cache {} — origin server is being consulted for every request in {}.",
                cache, input.region
            ),
            action: "Add `Cache-Control: public, s-maxage=300` to your response headers. \
                     For Next.js, use `export const revalidate = 300` in your page."
                .into(),
            summary: format!(
                "Cache {} in {} is adding ~{:.0}ms",
                cache, input.region, gain
            ),
            estimated_gain_ms: Some(gain),
        };
    }

    // Anomalia vs baseline
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
                summary: format!(
                    "{:.1}x slower than normal in {}",
                    factor, input.region
                ),
                estimated_gain_ms: Some(ttfb - baseline),
            };
        }
    }

    // Redirects desnecessários
    if let Some(redirects) = input.redirect_count {
        if redirects > 1 {
            let cost = redirects as f64 * 150.0; // ~150ms por hop estimado
            return Diagnosis {
                severity: "warning".into(),
                cause: format!(
                    "{redirects} redirect hops detected. Each hop adds ~150ms RTT."
                ),
                action: "Configure a direct redirect from http:// to https://www in one step. \
                         Avoid intermediate hops."
                    .into(),
                summary: format!("{redirects} unnecessary redirects (+~{:.0}ms)", cost),
                estimated_gain_ms: Some(cost),
            };
        }
    }

    // TTFB alto mesmo com cache HIT → edge function lenta
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
            summary: format!("Slow edge function in {} ({:.0}ms despite cache HIT)", input.region, ttfb),
            estimated_gain_ms: None,
        };
    }

    // HTTP 1.1 → sugerir upgrade
    if input.http_version.as_deref() == Some("HTTP/1.1") && ttfb > 100.0 {
        return Diagnosis {
            severity: "info".into(),
            cause: "Site is using HTTP/1.1. HTTP/2 or HTTP/3 would improve multiplexing.".into(),
            action: "Enable HTTP/2 on your CDN or origin server.".into(),
            summary: "HTTP/1.1 detected — upgrade available".into(),
            estimated_gain_ms: Some(30.0),
        };
    }

    // Tudo ok
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

    #[test]
    fn detects_cache_miss() {
        let d = diagnose(&DiagnosisInput {
            ttfb_ms: Some(450.0),
            cache_status: Some("MISS".into()),
            baseline_ttfb_ms: None,
            redirect_count: None,
            http_version: None,
            region: "sa-east".into(),
            error: None,
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
            redirect_count: None,
            http_version: None,
            region: "eu-west".into(),
            error: None,
        });
        assert_eq!(d.severity, "warning");
        assert!(d.cause.contains("7-day baseline"));
    }

    #[test]
    fn healthy_site_returns_ok() {
        let d = diagnose(&DiagnosisInput {
            ttfb_ms: Some(45.0),
            cache_status: Some("HIT".into()),
            baseline_ttfb_ms: Some(40.0),
            redirect_count: Some(0),
            http_version: Some("HTTP/2".into()),
            region: "us-east".into(),
            error: None,
        });
        assert_eq!(d.severity, "ok");
    }
}
