//! Health alert threshold policy.
//!
//! A pure evaluation of a health reading against the predefined alert
//! thresholds. No I/O lives here, so the alerting policy is unit-testable in
//! isolation from sampling and persistence.

/// Memory usage at or above this percentage raises a critical alert.
const MEMORY_CRITICAL_PCT: f64 = 90.0;
/// Disk usage at or above this percentage raises a low-space warning.
const DISK_LOW_PCT: f64 = 90.0;
/// CPU usage at or above this percentage raises a high-load warning.
const CPU_HIGH_PCT: f64 = 95.0;

/// A threshold breach to be persisted as a health alert.
pub struct AlertDraft {
    /// Stable kind slug: `memory_critical`, `disk_low_space`, or `cpu_high`.
    pub kind: String,
    /// Severity slug: `critical` or `warning`.
    pub severity: String,
    /// Plain-English summary title.
    pub title: String,
    /// Plain-English detail line.
    pub detail: String,
    /// The breaching percentage value (`0.0..=100.0`).
    pub value: f64,
}

/// Evaluates a reading (CPU / memory / disk usage percentages) against the
/// predefined thresholds, returning a draft for each breach. The result is
/// empty when nothing is over threshold.
pub fn evaluate(cpu_pct: f64, memory_pct: f64, disk_pct: f64) -> Vec<AlertDraft> {
    let mut drafts = Vec::new();

    if memory_pct >= MEMORY_CRITICAL_PCT {
        drafts.push(AlertDraft {
            kind: "memory_critical".to_string(),
            severity: "critical".to_string(),
            title: "Memory critically high".to_string(),
            detail: format!("Memory usage is at {}%.", memory_pct.round() as i64),
            value: memory_pct,
        });
    }
    if disk_pct >= DISK_LOW_PCT {
        drafts.push(AlertDraft {
            kind: "disk_low_space".to_string(),
            severity: "warning".to_string(),
            title: "Disk space low".to_string(),
            detail: format!(
                "The most constrained detected disk is {}% full.",
                disk_pct.round() as i64
            ),
            value: disk_pct,
        });
    }
    if cpu_pct >= CPU_HIGH_PCT {
        drafts.push(AlertDraft {
            kind: "cpu_high".to_string(),
            severity: "warning".to_string(),
            title: "CPU usage sustained high".to_string(),
            detail: format!("CPU usage is at {}%.", cpu_pct.round() as i64),
            value: cpu_pct,
        });
    }

    drafts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn healthy_reading_raises_no_alerts() {
        assert!(evaluate(10.0, 40.0, 50.0).is_empty());
    }

    #[test]
    fn each_threshold_breach_is_reported() {
        let drafts = evaluate(96.0, 92.0, 91.0);
        let kinds: Vec<&str> = drafts.iter().map(|d| d.kind.as_str()).collect();
        assert!(kinds.contains(&"memory_critical"));
        assert!(kinds.contains(&"disk_low_space"));
        assert!(kinds.contains(&"cpu_high"));
        assert_eq!(drafts.len(), 3);
    }

    #[test]
    fn memory_breach_is_critical_severity() {
        let drafts = evaluate(10.0, 95.0, 10.0);
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].kind, "memory_critical");
        assert_eq!(drafts[0].severity, "critical");
    }

    #[test]
    fn thresholds_are_inclusive_at_the_boundary() {
        // Exactly 90% memory and disk both trip; 94% CPU does not.
        let drafts = evaluate(94.0, 90.0, 90.0);
        let kinds: Vec<&str> = drafts.iter().map(|d| d.kind.as_str()).collect();
        assert!(kinds.contains(&"memory_critical"));
        assert!(kinds.contains(&"disk_low_space"));
        assert!(!kinds.contains(&"cpu_high"));
    }
}
