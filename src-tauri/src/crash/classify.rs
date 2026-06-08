//! Crash classification.
//!
//! A pure mapping from an event-log provider / Windows event ID to a
//! plain-English category, severity, and title. No I/O lives here, so the
//! classification policy is unit-testable in isolation from the collectors.

/// The plain-English classification of a crash / stability event.
pub struct CrashClass {
    /// Category slug: `bsod`, `app_crash`, `app_hang`, `kernel_power`,
    /// `unexpected_shutdown`, or `unknown`.
    pub category: String,
    /// Severity slug: `critical`, `error`, or `warning`.
    pub severity: String,
    /// Plain-English summary title.
    pub title: String,
}

/// Classifies an event-log entry by its `provider` and optional Windows
/// `event_id`. Unrecognized events fall back to an `unknown` / `warning`
/// classification.
pub fn classify(provider: &str, event_id: Option<i64>) -> CrashClass {
    let make = |category: &str, severity: &str, title: &str| CrashClass {
        category: category.to_string(),
        severity: severity.to_string(),
        title: title.to_string(),
    };

    match event_id {
        Some(1001) => make("bsod", "critical", "System crash (BSOD / bugcheck)"),
        Some(41) => make(
            "kernel_power",
            "critical",
            "Unexpected shutdown (power loss or hard reset)",
        ),
        Some(6008) => make("unexpected_shutdown", "error", "Unexpected shutdown"),
        Some(1000) => make("app_crash", "error", "Application crash"),
        Some(1002) => make("app_hang", "warning", "Application stopped responding"),
        _ if provider.eq_ignore_ascii_case("BugCheck") => {
            // Some bugcheck reports surface under the BugCheck provider without
            // the canonical id; treat those as a system crash too.
            make("bsod", "critical", "System crash (BSOD / bugcheck)")
        }
        _ => make("unknown", "warning", "Unrecognized stability event"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_known_event_ids() {
        assert_eq!(classify("BugCheck", Some(1001)).category, "bsod");
        assert_eq!(
            classify("Application Error", Some(1000)).category,
            "app_crash"
        );
        assert_eq!(
            classify("Application Hang", Some(1002)).category,
            "app_hang"
        );
        assert_eq!(
            classify("Microsoft-Windows-Kernel-Power", Some(41)).category,
            "kernel_power"
        );
        assert_eq!(
            classify("EventLog", Some(6008)).category,
            "unexpected_shutdown"
        );
    }

    #[test]
    fn bsod_severity_is_critical() {
        assert_eq!(classify("BugCheck", Some(1001)).severity, "critical");
    }

    #[test]
    fn falls_back_to_unknown_for_unrecognized_ids() {
        let class = classify("SomeProvider", Some(9999));
        assert_eq!(class.category, "unknown");
        assert_eq!(class.severity, "warning");
    }

    #[test]
    fn bugcheck_provider_without_id_is_bsod() {
        assert_eq!(classify("BugCheck", None).category, "bsod");
    }
}
