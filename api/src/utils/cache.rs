/// Centralized logic for what constitutes a "Cache Hit" in CacheSnap.
/// Includes HIT, STALE, REVALIDATED, UPDATING, REVALIDATE, and REFRESH_HIT.


/// Checks if a given cache status string should be treated as a Hit.
pub fn is_hit(status: &str) -> bool {
    let s = status.to_uppercase();
    s == "HIT"
        || s == "STALE"
        || s == "REVALIDATED"
        || s == "UPDATING"
        || s == "REVALIDATE"
        || s == "REFRESH_HIT"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_hit_standard() {
        assert!(is_hit("HIT"));
        assert!(is_hit("stale"));
        assert!(is_hit("REVALIDATED"));
        assert!(is_hit("updating"));
        assert!(is_hit("revalidate"));
        assert!(is_hit("refresh_hit"));
    }

    #[test]
    fn test_is_hit_misses() {
        assert!(!is_hit("MISS"));
        assert!(!is_hit("EXPIRED"));
        assert!(!is_hit("DYNAMIC"));
        assert!(!is_hit("BYPASS"));
        assert!(!is_hit("HIDDEN"));
    }

    #[test]
    fn test_is_hit_unknown() {
        assert!(!is_hit(""));
        assert!(!is_hit("SOME_RANDOM_STATUS"));
    }
}
