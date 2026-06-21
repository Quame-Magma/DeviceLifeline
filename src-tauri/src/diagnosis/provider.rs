//! Diagnosis providers.
//!
//! A [`DiagnosisProvider`] turns the on-device [`DiagnosisContext`] into a set
//! of findings. [`HeuristicProvider`] is the default, fully-offline,
//! deterministic implementation (rule-based over the context). A future remote
//! provider (OpenAI/Anthropic via a Supabase edge function) can be swapped in
//! behind [`default_provider`] without touching the rest of the slice —
//! mirroring the real-vs-mock collector pattern.

use crate::models::DiagnosisContext;

/// A finding produced by a provider, prior to persistence.
pub struct FindingDraft {
    /// Plain-English summary of the finding.
    pub title: String,
    /// The likely cause.
    pub cause: String,
    /// Supporting evidence drawn from the device context.
    pub evidence: String,
    /// Confidence score in `0..=100`.
    pub confidence: i64,
    /// Recommended next step.
    pub suggested_action: String,
}

/// A source of diagnosis findings for a query + context.
pub trait DiagnosisProvider: Send + Sync {
    /// Produces findings for the given query and on-device context.
    fn diagnose(&self, query: &str, context: &DiagnosisContext) -> Vec<FindingDraft>;
}

/// Returns the platform-appropriate provider. Currently always the offline
/// [`HeuristicProvider`]; a credentialed remote provider drops in here later.
pub fn default_provider() -> Box<dyn DiagnosisProvider> {
    Box::new(HeuristicProvider::new())
}

/// A deterministic, offline provider that derives findings from the context
/// using simple resource/stability rules.
pub struct HeuristicProvider;

impl HeuristicProvider {
    /// Creates a new heuristic provider.
    pub fn new() -> Self {
        HeuristicProvider
    }
}

impl Default for HeuristicProvider {
    fn default() -> Self {
        Self::new()
    }
}

/// Returns whether `kinds` contains `kind`.
fn has(kinds: &[String], kind: &str) -> bool {
    kinds.iter().any(|k| k == kind)
}

fn recent_change_finding(context: &DiagnosisContext) -> Option<FindingDraft> {
    if context.recent_change_titles.is_empty() {
        return None;
    }

    let joined = context.recent_change_titles.join("; ");
    let joined_lower = joined.to_lowercase();
    let (title, cause, confidence, suggested_action) = if joined_lower.contains("browser extension")
    {
        (
                "Recent browser extension change",
                "A browser extension changed recently and could affect browser performance or stability.",
                55,
                "Disable the newest extension temporarily and compare browser behavior.",
            )
    } else if joined_lower.contains("network adapter") {
        (
                "Recent network change",
                "A network adapter changed recently and may correlate with connectivity or latency issues.",
                60,
                "Review adapter drivers and compare the Timeline against when network symptoms began.",
            )
    } else if joined_lower.contains("power setting") {
        (
                "Recent power setting change",
                "The active power configuration changed recently and may affect performance or battery behavior.",
                55,
                "Check the active power plan and restore the previous plan if the timing matches the issue.",
            )
    } else if joined_lower.contains("developer tool") {
        (
                "Recent developer tool change",
                "A developer tool changed recently and may have added services, startup items, or background load.",
                50,
                "Review the new tool's background services and startup behavior in Device DNA.",
            )
    } else {
        (
            "Recent changes may be relevant",
            "Software or configuration changed recently and may correlate with the issue.",
            40,
            "Review the Timeline around when the problem started.",
        )
    };

    Some(FindingDraft {
        title: title.to_string(),
        cause: cause.to_string(),
        evidence: format!("Recent changes: {joined}."),
        confidence,
        suggested_action: suggested_action.to_string(),
    })
}

impl DiagnosisProvider for HeuristicProvider {
    fn diagnose(&self, _query: &str, context: &DiagnosisContext) -> Vec<FindingDraft> {
        let mut findings = Vec::new();

        let memory_pct = context.memory_pct.unwrap_or(0.0);
        if memory_pct >= 85.0 || has(&context.active_alert_kinds, "memory_critical") {
            findings.push(FindingDraft {
                title: "High memory pressure".to_string(),
                cause: "Available memory is running low, which can cause slowdowns and swapping."
                    .to_string(),
                evidence: format!(
                    "Memory usage at {}%{}.",
                    memory_pct.round() as i64,
                    if has(&context.active_alert_kinds, "memory_critical") {
                        " with an active memory alert"
                    } else {
                        ""
                    }
                ),
                confidence: 80,
                suggested_action:
                    "Close memory-heavy applications; consider adding RAM if this is frequent."
                        .to_string(),
            });
        }

        let disk_pct = context.disk_pct.unwrap_or(0.0);
        if disk_pct >= 85.0 || has(&context.active_alert_kinds, "disk_low_space") {
            findings.push(FindingDraft {
                title: "Low disk space".to_string(),
                cause:
                    "The primary disk is nearly full, which can degrade performance and updates."
                        .to_string(),
                evidence: format!("Primary disk {}% full.", disk_pct.round() as i64),
                confidence: 75,
                suggested_action: "Free up space (temp files, downloads) or extend storage."
                    .to_string(),
            });
        }

        let cpu_usage = context.cpu_usage.unwrap_or(0.0);
        if cpu_usage >= 90.0 || has(&context.active_alert_kinds, "cpu_high") {
            findings.push(FindingDraft {
                title: "Sustained high CPU".to_string(),
                cause: "CPU usage is very high, which can make the system feel unresponsive."
                    .to_string(),
                evidence: format!("CPU usage at {}%.", cpu_usage.round() as i64),
                confidence: 65,
                suggested_action: "Identify CPU-heavy processes and close or update them."
                    .to_string(),
            });
        }

        let severe_crash = has(&context.recent_crash_categories, "bsod")
            || has(&context.recent_crash_categories, "kernel_power");
        if severe_crash {
            findings.push(FindingDraft {
                title: "System instability detected".to_string(),
                cause: "Recent blue-screen or unexpected-shutdown events indicate driver, hardware, or power issues."
                    .to_string(),
                evidence: format!(
                    "Recent crash categories: {}.",
                    context.recent_crash_categories.join(", ")
                ),
                confidence: 85,
                suggested_action: "Update or roll back drivers; check recent Windows updates and hardware health."
                    .to_string(),
            });
        } else if !context.recent_crash_categories.is_empty() {
            findings.push(FindingDraft {
                title: "Application crashes detected".to_string(),
                cause: "One or more applications crashed or stopped responding recently."
                    .to_string(),
                evidence: format!(
                    "Recent crash categories: {}.",
                    context.recent_crash_categories.join(", ")
                ),
                confidence: 60,
                suggested_action:
                    "Update the affected applications and check the Crash Intelligence page."
                        .to_string(),
            });
        }

        if let Some(finding) = recent_change_finding(context) {
            findings.push(finding);
        }

        if let Some(score) = context.health_score {
            if score < 50 {
                findings.push(FindingDraft {
                    title: "Overall device health is low".to_string(),
                    cause:
                        "The composite HealthScore is low, indicating combined resource pressure."
                            .to_string(),
                    evidence: format!("HealthScore is {score}/100."),
                    confidence: 70,
                    suggested_action: "Address the resource findings above and re-sample health."
                        .to_string(),
                });
            }
        }

        if findings.is_empty() {
            findings.push(FindingDraft {
                title: "No major issues detected".to_string(),
                cause: "On-device telemetry looks healthy for the captured data.".to_string(),
                evidence: format!(
                    "HealthScore {}, {} active alert(s), {} recent crash(es).",
                    context
                        .health_score
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "n/a".to_string()),
                    context.active_alert_kinds.len(),
                    context.recent_crash_categories.len()
                ),
                confidence: 50,
                suggested_action: "Keep monitoring; capture a snapshot after making changes."
                    .to_string(),
            });
        }

        findings
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> DiagnosisContext {
        DiagnosisContext::default()
    }

    #[test]
    fn healthy_context_yields_no_major_issues() {
        let findings = HeuristicProvider::new().diagnose("why slow?", &ctx());
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].title, "No major issues detected");
    }

    #[test]
    fn high_memory_yields_memory_finding() {
        let context = DiagnosisContext {
            memory_pct: Some(95.0),
            ..Default::default()
        };
        let findings = HeuristicProvider::new().diagnose("", &context);
        assert!(findings.iter().any(|f| f.title == "High memory pressure"));
    }

    #[test]
    fn bsod_yields_instability_finding_with_high_confidence() {
        let context = DiagnosisContext {
            recent_crash_categories: vec!["bsod".to_string()],
            ..Default::default()
        };
        let findings = HeuristicProvider::new().diagnose("", &context);
        let instability = findings
            .iter()
            .find(|f| f.title == "System instability detected")
            .expect("instability finding");
        assert!(instability.confidence >= 80);
    }

    #[test]
    fn alert_kinds_trigger_findings_without_raw_metrics() {
        let context = DiagnosisContext {
            active_alert_kinds: vec!["disk_low_space".to_string()],
            ..Default::default()
        };
        let findings = HeuristicProvider::new().diagnose("", &context);
        assert!(findings.iter().any(|f| f.title == "Low disk space"));
    }

    #[test]
    fn browser_extension_change_yields_specific_finding() {
        let context = DiagnosisContext {
            recent_change_titles: vec![
                "Added browser extension: Chrome: React Developer Tools".to_string()
            ],
            ..Default::default()
        };

        let findings = HeuristicProvider::new().diagnose("", &context);
        let finding = findings
            .iter()
            .find(|f| f.title == "Recent browser extension change")
            .expect("browser extension finding");
        assert!(finding.evidence.contains("React Developer Tools"));
        assert!(finding.suggested_action.contains("Disable"));
    }

    #[test]
    fn network_change_yields_specific_finding() {
        let context = DiagnosisContext {
            recent_change_titles: vec!["Added network adapter: Wi-Fi".to_string()],
            ..Default::default()
        };

        let findings = HeuristicProvider::new().diagnose("", &context);
        let finding = findings
            .iter()
            .find(|f| f.title == "Recent network change")
            .expect("network finding");
        assert!(finding.confidence >= 60);
    }
}
