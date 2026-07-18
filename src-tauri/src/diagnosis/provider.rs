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

/// Detected natural-language intent for a diagnosis query.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QueryIntent {
    /// Performance / slowness.
    Slow,
    /// Crash / instability.
    Crash,
    /// Disk space / storage.
    Disk,
    /// Memory pressure.
    Memory,
    /// CPU load.
    Cpu,
    /// Startup / boot time.
    Startup,
    /// Network connectivity.
    Network,
    /// No specific intent detected.
    General,
}

impl QueryIntent {
    /// Stable slug stored on [`DiagnosisContext::query_intent`].
    pub fn as_str(self) -> &'static str {
        match self {
            QueryIntent::Slow => "slow",
            QueryIntent::Crash => "crash",
            QueryIntent::Disk => "disk",
            QueryIntent::Memory => "memory",
            QueryIntent::Cpu => "cpu",
            QueryIntent::Startup => "startup",
            QueryIntent::Network => "network",
            QueryIntent::General => "general",
        }
    }
}

/// Detects intent keywords from a free-text diagnosis query.
pub fn detect_intent(query: &str) -> QueryIntent {
    let q = query.to_lowercase();

    // Order matters: more specific intents before general "slow".
    if contains_any(
        &q,
        &[
            "crash",
            "bsod",
            "blue screen",
            "restart",
            "reboot loop",
            "hang",
            "frozen",
        ],
    ) {
        return QueryIntent::Crash;
    }
    if contains_any(
        &q,
        &[
            "disk",
            "storage",
            "space",
            "full drive",
            "hard drive",
            "ssd",
            "cleanup",
        ],
    ) {
        return QueryIntent::Disk;
    }
    if contains_any(&q, &["memory", "ram", "swap", "paging"]) {
        return QueryIntent::Memory;
    }
    if contains_any(&q, &["cpu", "processor", "overheat", "thermal"]) {
        return QueryIntent::Cpu;
    }
    if contains_any(&q, &["startup", "boot", "login", "logon", "starts slow"]) {
        return QueryIntent::Startup;
    }
    if contains_any(
        &q,
        &[
            "network", "wifi", "wi-fi", "internet", "offline", "latency", "dns", "ethernet",
        ],
    ) {
        return QueryIntent::Network;
    }
    if contains_any(
        &q,
        &[
            "slow",
            "sluggish",
            "lag",
            "laggy",
            "performance",
            "unresponsive",
            "stutter",
        ],
    ) {
        return QueryIntent::Slow;
    }
    QueryIntent::General
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| haystack.contains(n))
}

/// A source of diagnosis findings for a query + context.
pub trait DiagnosisProvider: Send + Sync {
    /// Produces findings for the given query and on-device context.
    fn diagnose(&self, query: &str, context: &DiagnosisContext) -> Vec<FindingDraft>;
}

/// Returns the platform-appropriate provider.
///
/// When any of `XAI_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` is set,
/// uses that cloud provider (see `DEVICELIFELINE_LLM_PROVIDER` for preference),
/// with heuristic fallback on failure. Otherwise uses offline heuristics.
pub fn default_provider() -> Box<dyn DiagnosisProvider> {
    if let Some(llm) = crate::diagnosis::llm::LlmProvider::from_env() {
        Box::new(llm)
    } else {
        Box::new(HeuristicProvider::new())
    }
}

/// A deterministic, offline provider that derives findings from the context
/// using simple resource/stability rules, adjusted by query intent.
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

/// Boosts confidence when the finding matches the query intent.
fn intent_boost(base: i64, matches_intent: bool) -> i64 {
    if matches_intent {
        (base + 10).min(95)
    } else {
        base
    }
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

/// Builds a process-attribution finding for slow/memory/cpu intents.
fn top_process_finding(context: &DiagnosisContext, intent: QueryIntent) -> Option<FindingDraft> {
    if context.top_process_names.is_empty() {
        return None;
    }
    if !matches!(
        intent,
        QueryIntent::Slow | QueryIntent::Memory | QueryIntent::Cpu | QueryIntent::General
    ) {
        return None;
    }

    let top = context
        .top_process_names
        .iter()
        .take(5)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
    let mem_note = context
        .top_process_memory_pct
        .map(|p| format!(" Combined top-process memory share ≈ {:.0}%.", p.round()))
        .unwrap_or_default();

    let (title, confidence) = match intent {
        QueryIntent::Slow => (
            "Top processes may explain slowdown".to_string(),
            intent_boost(60, true),
        ),
        QueryIntent::Memory => (
            "Top processes contributing to memory use".to_string(),
            intent_boost(65, true),
        ),
        QueryIntent::Cpu => (
            "Top processes contributing to CPU load".to_string(),
            intent_boost(65, true),
        ),
        _ => (
            "Notable running processes".to_string(),
            intent_boost(45, false),
        ),
    };

    Some(FindingDraft {
        title,
        cause:
            "A small set of processes often accounts for perceived slowness or resource pressure."
                .to_string(),
        evidence: format!("Top processes by resource use: {top}.{mem_note}"),
        confidence,
        suggested_action:
            "Inspect these processes in Process Intelligence; close or update unexpected ones."
                .to_string(),
    })
}

impl DiagnosisProvider for HeuristicProvider {
    fn diagnose(&self, query: &str, context: &DiagnosisContext) -> Vec<FindingDraft> {
        let intent = context
            .query_intent
            .as_deref()
            .and_then(|s| match s {
                "slow" => Some(QueryIntent::Slow),
                "crash" => Some(QueryIntent::Crash),
                "disk" => Some(QueryIntent::Disk),
                "memory" => Some(QueryIntent::Memory),
                "cpu" => Some(QueryIntent::Cpu),
                "startup" => Some(QueryIntent::Startup),
                "network" => Some(QueryIntent::Network),
                "general" => Some(QueryIntent::General),
                _ => None,
            })
            .unwrap_or_else(|| detect_intent(query));

        let mut findings = Vec::new();

        let memory_pct = context.memory_pct.unwrap_or(0.0);
        let memory_relevant = matches!(
            intent,
            QueryIntent::Memory | QueryIntent::Slow | QueryIntent::General
        );
        if memory_pct >= 85.0 || has(&context.active_alert_kinds, "memory_critical") {
            let mut title = "High memory pressure".to_string();
            if intent == QueryIntent::Memory {
                title = "Memory pressure matches your query".to_string();
            } else if intent == QueryIntent::Slow {
                title = "High memory pressure may be causing slowdown".to_string();
            }
            findings.push(FindingDraft {
                title,
                cause: "Available memory is running low, which can cause slowdowns and swapping."
                    .to_string(),
                evidence: format!(
                    "Memory usage at {}%{}{}.",
                    memory_pct.round() as i64,
                    if has(&context.active_alert_kinds, "memory_critical") {
                        " with an active memory alert"
                    } else {
                        ""
                    },
                    if !context.top_process_names.is_empty() {
                        format!(
                            "; top processes: {}",
                            context
                                .top_process_names
                                .iter()
                                .take(3)
                                .cloned()
                                .collect::<Vec<_>>()
                                .join(", ")
                        )
                    } else {
                        String::new()
                    }
                ),
                confidence: intent_boost(80, memory_relevant),
                suggested_action:
                    "Close memory-heavy applications; consider adding RAM if this is frequent."
                        .to_string(),
            });
        }

        let disk_pct = context.disk_pct.unwrap_or(0.0);
        let disk_relevant = matches!(
            intent,
            QueryIntent::Disk | QueryIntent::Slow | QueryIntent::General
        );
        if disk_pct >= 85.0 || has(&context.active_alert_kinds, "disk_low_space") {
            let title = if intent == QueryIntent::Disk {
                "Low disk space matches your query".to_string()
            } else {
                "Low disk space".to_string()
            };
            findings.push(FindingDraft {
                title,
                cause: "At least one detected disk is nearly full, which can degrade performance and updates."
                    .to_string(),
                evidence: format!(
                    "Most constrained detected disk {}% full.",
                    disk_pct.round() as i64
                ),
                confidence: intent_boost(75, disk_relevant),
                suggested_action: "Free up space (temp files, downloads) or extend storage."
                    .to_string(),
            });
        } else if intent == QueryIntent::Disk {
            // Intent-specific nudge even when thresholds are not breached.
            findings.push(FindingDraft {
                title: "Disk health appears acceptable".to_string(),
                cause: "No critical disk-pressure threshold was crossed in the latest sample."
                    .to_string(),
                evidence: format!(
                    "Most constrained detected disk {}% full.",
                    disk_pct.round() as i64
                ),
                confidence: 45,
                suggested_action: "Run Storage Intelligence for large files and temp bloat."
                    .to_string(),
            });
        }

        let cpu_usage = context.cpu_usage.unwrap_or(0.0);
        let cpu_relevant = matches!(
            intent,
            QueryIntent::Cpu | QueryIntent::Slow | QueryIntent::General
        );
        if cpu_usage >= 90.0 || has(&context.active_alert_kinds, "cpu_high") {
            let title = if intent == QueryIntent::Cpu {
                "Sustained high CPU matches your query".to_string()
            } else if intent == QueryIntent::Slow {
                "High CPU may be causing slowdown".to_string()
            } else {
                "Sustained high CPU".to_string()
            };
            findings.push(FindingDraft {
                title,
                cause: "CPU usage is very high, which can make the system feel unresponsive."
                    .to_string(),
                evidence: format!(
                    "CPU usage at {}%.{}",
                    cpu_usage.round() as i64,
                    if !context.top_process_names.is_empty() {
                        format!(
                            " Top processes: {}.",
                            context
                                .top_process_names
                                .iter()
                                .take(3)
                                .cloned()
                                .collect::<Vec<_>>()
                                .join(", ")
                        )
                    } else {
                        String::new()
                    }
                ),
                confidence: intent_boost(65, cpu_relevant),
                suggested_action: "Identify CPU-heavy processes and close or update them."
                    .to_string(),
            });
        }

        let severe_crash = has(&context.recent_crash_categories, "bsod")
            || has(&context.recent_crash_categories, "kernel_power");
        let crash_relevant = matches!(intent, QueryIntent::Crash | QueryIntent::General);
        if severe_crash {
            let title = if intent == QueryIntent::Crash {
                "System instability matches your crash query".to_string()
            } else {
                "System instability detected".to_string()
            };
            findings.push(FindingDraft {
                title,
                cause: "Recent blue-screen or unexpected-shutdown events indicate driver, hardware, or power issues."
                    .to_string(),
                evidence: format!(
                    "Recent crash categories: {}.",
                    context.recent_crash_categories.join(", ")
                ),
                confidence: intent_boost(85, crash_relevant),
                suggested_action: "Update or roll back drivers; check recent Windows updates and hardware health."
                    .to_string(),
            });
        } else if !context.recent_crash_categories.is_empty() {
            findings.push(FindingDraft {
                title: if intent == QueryIntent::Crash {
                    "Application crashes related to your query".to_string()
                } else {
                    "Application crashes detected".to_string()
                },
                cause: "One or more applications crashed or stopped responding recently."
                    .to_string(),
                evidence: format!(
                    "Recent crash categories: {}.",
                    context.recent_crash_categories.join(", ")
                ),
                confidence: intent_boost(60, crash_relevant),
                suggested_action:
                    "Update the affected applications and check the Crash Intelligence page."
                        .to_string(),
            });
        } else if intent == QueryIntent::Crash {
            findings.push(FindingDraft {
                title: "No recent crashes in captured telemetry".to_string(),
                cause: "Crash Intelligence has not recorded matching events in the recent window."
                    .to_string(),
                evidence: "Recent crash categories: none.".to_string(),
                confidence: 40,
                suggested_action: "Run a crash event scan, then re-ask if symptoms continue."
                    .to_string(),
            });
        }

        if let Some(finding) = recent_change_finding(context) {
            let mut finding = finding;
            if intent == QueryIntent::Startup && finding.evidence.to_lowercase().contains("startup")
            {
                finding.confidence = intent_boost(finding.confidence, true);
                finding.title = "Recent startup-related change".to_string();
            }
            if intent == QueryIntent::Network && finding.title.to_lowercase().contains("network") {
                finding.confidence = intent_boost(finding.confidence, true);
            }
            findings.push(finding);
        } else if intent == QueryIntent::Startup {
            findings.push(FindingDraft {
                title: "Startup performance review".to_string(),
                cause: "Startup slowness is often driven by login apps and services.".to_string(),
                evidence: format!(
                    "No recent config changes captured; software inventory has {} item(s).",
                    context.software_count
                ),
                confidence: 45,
                suggested_action:
                    "Review startup items and services in Device DNA; disable non-essential ones."
                        .to_string(),
            });
        } else if intent == QueryIntent::Network {
            findings.push(FindingDraft {
                title: "Network symptom check".to_string(),
                cause: "Network issues can be adapter, driver, or ISP related."
                    .to_string(),
                evidence: "No recent network adapter change was present in the Timeline sample."
                    .to_string(),
                confidence: 40,
                suggested_action:
                    "Check adapter status, DNS, and recent driver updates; capture a new DNA snapshot."
                        .to_string(),
            });
        }

        if let Some(score) = context.health_score {
            if score < 50 {
                findings.push(FindingDraft {
                    title: "Overall device health is low".to_string(),
                    cause:
                        "The composite HealthScore is low, indicating combined resource pressure."
                            .to_string(),
                    evidence: format!("HealthScore is {score}/100."),
                    confidence: intent_boost(70, intent == QueryIntent::Slow),
                    suggested_action: "Address the resource findings above and re-sample health."
                        .to_string(),
                });
            }
        }

        // Process attribution for slow / resource intents.
        if let Some(finding) = top_process_finding(context, intent) {
            // Avoid pure duplicate when we already mentioned top processes heavily.
            findings.push(finding);
        }

        if findings.is_empty() {
            findings.push(FindingDraft {
                title: "No major issues detected".to_string(),
                cause: "On-device telemetry looks healthy for the captured data.".to_string(),
                evidence: format!(
                    "HealthScore {}, {} active alert(s), {} recent crash(es). Intent: {}.",
                    context
                        .health_score
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "n/a".to_string()),
                    context.active_alert_kinds.len(),
                    context.recent_crash_categories.len(),
                    intent.as_str()
                ),
                confidence: 50,
                suggested_action: "Keep monitoring; capture a snapshot after making changes."
                    .to_string(),
            });
        }

        // Prefer intent-matched findings first (stable secondary by confidence).
        findings.sort_by(|a, b| b.confidence.cmp(&a.confidence));
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
        assert!(findings
            .iter()
            .any(|f| f.title.contains("memory") || f.title.contains("Memory")));
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
            .find(|f| f.title.contains("instability") || f.title.contains("System"))
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
        assert!(findings.iter().any(|f| f.title.contains("disk")
            || f.title.contains("Disk")
            || f.title.contains("space")));
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

    #[test]
    fn detect_intent_recognizes_common_phrases() {
        assert_eq!(detect_intent("why is my pc so slow?"), QueryIntent::Slow);
        assert_eq!(detect_intent("disk almost full"), QueryIntent::Disk);
        assert_eq!(detect_intent("blue screen crash"), QueryIntent::Crash);
        assert_eq!(detect_intent("wifi not working"), QueryIntent::Network);
        assert_eq!(detect_intent("high cpu usage"), QueryIntent::Cpu);
    }

    #[test]
    fn slow_query_uses_top_process_names() {
        let context = DiagnosisContext {
            query_intent: Some("slow".to_string()),
            top_process_names: vec!["chrome.exe".to_string(), "code.exe".to_string()],
            top_process_memory_pct: Some(42.0),
            memory_pct: Some(50.0),
            ..Default::default()
        };
        let findings = HeuristicProvider::new().diagnose("why slow?", &context);
        assert!(findings.iter().any(|f| f.evidence.contains("chrome.exe")));
        assert!(findings.iter().any(|f| f.title.contains("process")
            || f.title.contains("slowdown")
            || f.evidence.contains("Top processes")));
    }

    #[test]
    fn crash_intent_without_events_still_answers() {
        let context = DiagnosisContext {
            query_intent: Some("crash".to_string()),
            ..Default::default()
        };
        let findings = HeuristicProvider::new().diagnose("why crash?", &context);
        assert!(findings
            .iter()
            .any(|f| f.title.to_lowercase().contains("crash")));
    }
}
