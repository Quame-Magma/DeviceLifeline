//! AI Detective / Copilot.
//!
//! Assembles a privacy-safe, on-device [`DiagnosisContext`] (structured
//! summaries only — never raw file contents), runs the platform
//! [`DiagnosisProvider`](provider::DiagnosisProvider) over it, and persists the
//! session and findings. Uses **local Qwen3** when provisioned in
//! `resources/ai`; otherwise offline heuristics. No cloud LLM APIs.
//! SQL lives in `storage::diagnosis_repo`.

pub mod llm;
pub mod provider;

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{DiagnosisContext, DiagnosisFinding, DiagnosisSession};
use crate::process;
use crate::storage::{
    alerts_repo, crash_repo, device_repo, diagnosis_repo, health_repo, timeline_repo,
};

/// Number of most-recent crash events summarized into the context.
const RECENT_CRASHES: usize = 8;
/// Number of most-recent timeline changes summarized into the context.
const RECENT_CHANGES: usize = 5;
/// Number of top processes summarized into the context.
const TOP_PROCESSES: usize = 8;

/// Pushes `value` into `vec` if not already present (order-preserving dedup).
fn push_unique(vec: &mut Vec<String>, value: String) {
    if !vec.contains(&value) {
        vec.push(value);
    }
}

/// Returns `used / total` as a percentage, or `None` when `total` is zero.
fn pct(used: i64, total: i64) -> Option<f64> {
    if total <= 0 {
        return None;
    }
    Some((used as f64 / total as f64) * 100.0)
}

/// Assembles the on-device context summary the provider will analyze. Reads
/// only summaries from existing repos; never touches raw file contents.
///
/// When `query` is provided, also records the detected intent on the context.
pub fn assemble_context(
    conn: &Connection,
    query: Option<&str>,
) -> Result<DiagnosisContext, CoreError> {
    let latest = health_repo::latest_sample(conn)?;
    let (health_score, cpu_usage, memory_pct, disk_pct) = match &latest {
        Some(sample) => (
            Some(sample.health_score),
            Some(sample.cpu_usage),
            pct(sample.memory_used, sample.memory_total),
            pct(sample.disk_used, sample.disk_total),
        ),
        None => (None, None, None, None),
    };

    let mut active_alert_kinds = Vec::new();
    for alert in alerts_repo::list_alerts(conn)? {
        if !alert.acknowledged {
            push_unique(&mut active_alert_kinds, alert.kind);
        }
    }

    let mut recent_crash_categories = Vec::new();
    for event in crash_repo::list_events(conn)?
        .into_iter()
        .take(RECENT_CRASHES)
    {
        push_unique(&mut recent_crash_categories, event.category);
    }

    let recent_change_titles: Vec<String> = timeline_repo::list_events(conn)?
        .into_iter()
        .take(RECENT_CHANGES)
        .map(|event| event.title)
        .collect();

    let software_count = device_repo::list_snapshots(conn)?
        .first()
        .map(|snapshot| snapshot.software_count)
        .unwrap_or(0);

    // Live process summary for "slow" / resource attribution. Best-effort: if
    // process sampling fails, leave fields empty rather than aborting diagnosis.
    let (top_process_names, top_process_memory_pct) =
        process::top_process_summary(TOP_PROCESSES).unwrap_or_default();

    let query_intent = query.map(|q| provider::detect_intent(q).as_str().to_string());

    Ok(DiagnosisContext {
        health_score,
        cpu_usage,
        memory_pct,
        disk_pct,
        active_alert_kinds,
        recent_crash_categories,
        recent_change_titles,
        software_count,
        top_process_names,
        top_process_memory_pct,
        query_intent,
    })
}

/// Pick a string from `options` using a stable hash of seed (varies by query + metrics).
fn pick<'a>(seed: &str, options: &[&'a str]) -> &'a str {
    let mut h: u32 = 2166136261;
    for b in seed.bytes() {
        h ^= u32::from(b);
        h = h.wrapping_mul(16777619);
    }
    if options.is_empty() {
        return "";
    }
    options[(h as usize) % options.len()]
}

/// Conversational reply for greetings / small talk (no findings dump).
fn chat_reply(query: &str, context: &DiagnosisContext) -> String {
    let q = query.trim().to_lowercase();
    let health = context
        .health_score
        .map(|s| format!("{s:.0}"))
        .unwrap_or_else(|| "n/a".into());
    let disk = context
        .disk_pct
        .map(|p| format!("{p:.0}%"))
        .unwrap_or_else(|| "unknown".into());
    let mem = context
        .memory_pct
        .map(|p| format!("{p:.0}%"))
        .unwrap_or_else(|| "unknown".into());
    let cpu = context
        .cpu_usage
        .map(|p| format!("{p:.0}%"))
        .unwrap_or_else(|| "unknown".into());

    if q.contains("thank") || q == "thx" || q == "ty" {
        return pick(
            &q,
            &[
                "Anytime. When you're ready, we can dig into storage, performance, or whatever is actually bugging this PC.",
                "Glad it helped. I'm still on this machine if you want to chase down free space, startup load, or a crash next.",
                "No problem. Ping me with a symptom whenever something feels off.",
            ],
        )
        .to_string();
    }
    if q.contains("who are you") || q.contains("what are you") {
        return format!(
            "I'm DeviceLifeline Copilot. I run entirely on this PC, read local telemetry, and never send your chats to a cloud LLM. Right now health is about {health}/100, disk pressure around {disk}, memory {mem}. Ask me a real symptom and I'll work from the live sample, not a script."
        );
    }
    if q.contains("how are you") {
        return format!(
            "I'm fine, thanks. Your machine is sitting at health ~{health}/100 with disk ~{disk} and CPU ~{cpu} on the latest sample. Want me to look at anything specific?"
        );
    }
    if q == "help" || q == "?" {
        return "I can dig into why this PC feels slow, why a disk keeps filling, what's eating RAM or CPU, startup bloat, and recent crashes. Phrase it like you would to a tech: what's wrong, when it started, what you already tried.".into();
    }

    let opener = pick(
        &format!("{q}|{health}|{disk}"),
        &[
            "Hey",
            "Hi there",
            "Hello",
            "Good to see you",
        ],
    );
    let body = if context.disk_pct.unwrap_or(0.0) >= 90.0 {
        format!(
            "{opener}. I'm your on-device Copilot for this machine. Live sample: health ~{health}/100, and the busiest disk is about {disk} full, which is worth talking about if things feel tight."
        )
    } else if context.memory_pct.unwrap_or(0.0) >= 90.0 {
        format!(
            "{opener}. Copilot here, reading this PC only. Health ~{health}/100; memory is elevated around {mem}. Tell me what you're noticing."
        )
    } else {
        format!(
            "{opener}. I'm Copilot on this device. Latest snapshot: health ~{health}/100, CPU ~{cpu}, memory ~{mem}, disk ~{disk}. What should we look at?"
        )
    };
    format!(
        "{body}\n\nYou can ask casually (\"why is C: always full?\") or point me at a tool (storage, startup, crashes)."
    )
}

/// Build a multi-paragraph, telemetry-grounded answer that actually addresses `query`.
/// Not a one-line template: different metrics, findings, and seeds change the wording.
fn compose_reply(
    query: &str,
    findings: &[provider::FindingDraft],
    context: &DiagnosisContext,
    history: Option<&str>,
) -> String {
    let intent = provider::detect_intent(query);
    if intent == provider::QueryIntent::Chat {
        return chat_reply(query, context);
    }

    let seed = format!(
        "{query}|{:?}|{:?}|{:?}|{:?}|{}",
        context.disk_pct,
        context.memory_pct,
        context.cpu_usage,
        context.health_score,
        findings.len()
    );

    let mut parts: Vec<String> = Vec::new();

    // Acknowledge prior thread lightly when present.
    if let Some(h) = history {
        if !h.trim().is_empty() {
            let cont = pick(
                &seed,
                &[
                    "Building on what we were just discussing",
                    "Taking your latest question in context of this chat",
                    "Following up from the last turn",
                ],
            );
            parts.push(format!("{cont}:"));
        }
    }

    // Direct answer line tailored to intent + live numbers.
    match intent {
        provider::QueryIntent::Disk => {
            if let Some(pct) = context.disk_pct {
                if pct >= 95.0 {
                    parts.push(format!(
                        "Short answer: yes, storage pressure is real on this PC. The most constrained disk is about {pct:.0}% full in the latest health sample, so Windows has almost no room for temp files, updates, or caches."
                    ));
                } else if pct >= 85.0 {
                    parts.push(format!(
                        "You're right to worry about space. Telemetry shows the busiest volume around {pct:.0}% full. That level is where machines start recycling free space every day from temp and cache writers."
                    ));
                } else {
                    parts.push(format!(
                        "On the latest sample the tightest disk is about {pct:.0}% full. That may not be \"always full\" right this second, but if free space vanishes after cleanups, something is rewriting large files regularly."
                    ));
                }
            } else {
                parts.push(
                    "I don't have a disk fill percentage in the latest sample yet, so take a Health sample first. From what I can still infer from alerts and findings:".into(),
                );
            }
            parts.push(
                "Disks that \"always\" refill usually aren't losing personal documents overnight. Recurring writers win: user and Windows temp, browser/GPU caches, Delivery Optimization / Update downloads, and fat Downloads folders. Cleanup frees space; the writers put it back unless you also change habits or move large libraries."
                    .into(),
            );
        }
        provider::QueryIntent::Memory => {
            if let Some(pct) = context.memory_pct {
                parts.push(format!(
                    "Memory is the story here: about {pct:.0}% used on the latest sample{}.",
                    if pct >= 90.0 {
                        ", which is high enough to force paging and make everything feel sticky"
                    } else {
                        ""
                    }
                ));
            }
            if !context.top_process_names.is_empty() {
                let top = context
                    .top_process_names
                    .iter()
                    .take(4)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ");
                parts.push(format!(
                    "The processes showing up near the top of the sample are: {top}. That's where I'd look first before blaming \"Windows in general.\""
                ));
            }
        }
        provider::QueryIntent::Cpu => {
            if let Some(pct) = context.cpu_usage {
                parts.push(format!(
                    "CPU was around {pct:.0}% when we last sampled{}.",
                    if pct >= 90.0 {
                        " - that's sustained enough to make the UI feel frozen"
                    } else {
                        ""
                    }
                ));
            }
            if !context.top_process_names.is_empty() {
                let top = context
                    .top_process_names
                    .iter()
                    .take(4)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ");
                parts.push(format!("Top resource names in view: {top}."));
            }
        }
        provider::QueryIntent::Slow => {
            let mut bits = Vec::new();
            if let Some(d) = context.disk_pct {
                if d >= 90.0 {
                    bits.push(format!("disk ~{d:.0}% full"));
                }
            }
            if let Some(m) = context.memory_pct {
                if m >= 85.0 {
                    bits.push(format!("memory ~{m:.0}%"));
                }
            }
            if let Some(c) = context.cpu_usage {
                if c >= 85.0 {
                    bits.push(format!("CPU ~{c:.0}%"));
                }
            }
            if bits.is_empty() {
                parts.push(format!(
                    "For slowness I'm looking at the whole sample (health ~{}). No single gauge is screaming, so we go after processes, startup, and recent changes next.",
                    context
                        .health_score
                        .map(|s| format!("{s:.0}/100"))
                        .unwrap_or_else(|| "n/a".into())
                ));
            } else {
                parts.push(format!(
                    "Slowness lines up with pressure I can measure: {}. That's a better starting point than guessing \"Windows is broken.\"",
                    bits.join("; ")
                ));
            }
        }
        provider::QueryIntent::Crash => {
            if context.recent_crash_categories.is_empty() {
                parts.push(
                    "I don't see recent crash categories in the captured window. If the machine still reboots or apps die, pull a fresh crash scan and tell me the exact symptom (BSOD code, app name, or \"unexpected restart\")."
                        .into(),
                );
            } else {
                parts.push(format!(
                    "Crash telemetry I have: {}. Those categories are what we should explain, not a generic \"unstable PC\" label.",
                    context.recent_crash_categories.join(", ")
                ));
            }
        }
        provider::QueryIntent::Startup => {
            parts.push(
                "Startup delay is almost always login apps, scheduled tasks, or services competing at sign-in. I'll stick to persistence and recent config changes rather than random CPU spikes mid-day."
                    .into(),
            );
        }
        provider::QueryIntent::Network => {
            parts.push(
                "For network issues I care about adapter changes, DNS, and whether this is Wi-Fi vs Ethernet. I'll ignore disk/CPU noise unless you said the whole PC freezes while offline."
                    .into(),
            );
        }
        _ => {
            parts.push(format!(
                "Working from live telemetry on this PC for “{}”. Health ~{}, CPU ~{}, memory ~{}, disk ~{}.",
                query.trim(),
                context
                    .health_score
                    .map(|s| format!("{s:.0}"))
                    .unwrap_or_else(|| "n/a".into()),
                context
                    .cpu_usage
                    .map(|p| format!("{p:.0}%"))
                    .unwrap_or_else(|| "?".into()),
                context
                    .memory_pct
                    .map(|p| format!("{p:.0}%"))
                    .unwrap_or_else(|| "?".into()),
                context
                    .disk_pct
                    .map(|p| format!("{p:.0}%"))
                    .unwrap_or_else(|| "?".into()),
            ));
        }
    }

    // Weave findings as explanation, not a robotic "N signals".
    let meaningful: Vec<&provider::FindingDraft> = findings
        .iter()
        .filter(|f| f.title != "No major issues detected")
        .collect();

    if meaningful.is_empty() {
        parts.push(pick(
            &seed,
            &[
                "Nothing else in the sample contradicts that read. If your experience doesn't match the gauges, say when it happens (boot, after sleep, while compiling) and we'll narrow it.",
                "Telemetry looks quiet beyond what I already covered. Give me a sharper symptom or a time window if this still feels wrong.",
            ],
        ).to_string());
    } else {
        parts.push(pick(
            &seed,
            &[
                "Here's the grounded detail from the sample:",
                "What the on-device rules and sample actually support:",
                "Breaking down the evidence I trust on this machine:",
            ],
        ).to_string());
        for (i, f) in meaningful.iter().take(4).enumerate() {
            parts.push(format!(
                "{}. {} - {} Evidence: {} Suggested: {}",
                i + 1,
                f.title,
                f.cause.trim_end_matches('.'),
                f.evidence.trim_end_matches('.'),
                f.suggested_action.trim_end_matches('.')
            ));
        }
    }

    // Concrete next step.
    let next = match intent {
        provider::QueryIntent::Disk => {
            "Next step: open Storage or Cleanup, clear temp and browser caches you recognize, empty Recycle Bin, then rescan free space. If it fills again within a day, check Downloads and large app data folders."
        }
        provider::QueryIntent::Memory | provider::QueryIntent::Cpu => {
            "Next step: open Processes, sort by the hot resource, and note what stays high across two refreshes before you kill anything important."
        }
        provider::QueryIntent::Startup => {
            "Next step: open Startup, disable non-essential logon items, reboot once, and compare boot feel."
        }
        provider::QueryIntent::Crash => {
            "Next step: open Crashes for the exact events, then update or roll back the driver or app named there."
        }
        provider::QueryIntent::Slow => {
            "Next step: fix the highest-pressure gauge first (disk, memory, or CPU), then re-check Health after a few minutes of normal use."
        }
        _ => "Next step: pick the tool that matches the symptom (Storage, Processes, Startup, or Crashes) and we can go deeper on the next message.",
    };
    parts.push(next.into());

    parts.join("\n\n")
}

/// Runs diagnosis for `query`, persists session + findings, returns the session.
/// `history` is optional prior chat turns (plain text) so replies stay multi-turn aware.
pub fn run_diagnosis(
    conn: &mut Connection,
    query: &str,
    history: Option<&str>,
) -> Result<DiagnosisSession, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let context = assemble_context(conn, Some(query))?;
    let intent = provider::detect_intent(query);

    // Chat: no findings dump.
    let drafts = if intent == provider::QueryIntent::Chat {
        Vec::new()
    } else {
        provider::default_provider().diagnose(query, &context)
    };

    // Prefer local model prose when available; otherwise compose from telemetry.
    let summary = if intent == provider::QueryIntent::Chat {
        llm::generate_chat_reply(query, &context, &[], history)
            .unwrap_or_else(|| chat_reply(query, &context))
    } else {
        llm::generate_chat_reply(query, &context, &drafts, history)
            .unwrap_or_else(|| compose_reply(query, &drafts, &context, history))
    };

    let session_id = uuid::Uuid::new_v4().to_string();
    let session = DiagnosisSession {
        id: session_id.clone(),
        device_id: device.id,
        query: query.to_string(),
        created_at: now_rfc3339()?,
        summary,
        context,
        finding_count: drafts.len() as i64,
    };

    let findings: Vec<DiagnosisFinding> = drafts
        .into_iter()
        .enumerate()
        .map(|(index, draft)| DiagnosisFinding {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            order_index: index as i64,
            title: draft.title,
            cause: draft.cause,
            evidence: draft.evidence,
            confidence: draft.confidence,
            suggested_action: draft.suggested_action,
        })
        .collect();

    diagnosis_repo::insert_session(conn, &session, &findings)?;
    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dna::snapshot::capture_snapshot;
    use crate::storage::db;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn assemble_context_summarizes_snapshot_software() {
        let mut conn = memory_db();
        // The collector differs by platform (real registry on Windows, mock
        // elsewhere), so compare to the captured snapshot's own count.
        let snapshot = capture_snapshot(&mut conn).expect("capture snapshot");

        let context =
            assemble_context(&conn, Some("why is my pc slow?")).expect("assemble context");
        assert_eq!(context.software_count, snapshot.software_count);
        assert!(context.health_score.is_none());
        assert!(context.recent_crash_categories.is_empty());
        assert_eq!(context.query_intent.as_deref(), Some("slow"));
    }

    #[test]
    fn run_diagnosis_persists_session_and_findings() {
        let mut conn = memory_db();
        let snapshot = capture_snapshot(&mut conn).expect("capture snapshot");

        let session =
            run_diagnosis(&mut conn, "why is my pc slow?", None).expect("run diagnosis");
        assert_eq!(session.query, "why is my pc slow?");
        assert!(session.finding_count >= 1);
        assert!(!session.summary.is_empty());
        assert_eq!(session.context.query_intent.as_deref(), Some("slow"));

        let findings = diagnosis_repo::list_findings(&conn, &session.id).expect("list findings");
        assert_eq!(findings.len() as i64, session.finding_count);

        let sessions = diagnosis_repo::list_sessions(&conn).expect("list sessions");
        assert_eq!(sessions.len(), 1);
        // Context round-trips through JSON storage (count matches the snapshot,
        // whatever the platform collector produced).
        assert_eq!(sessions[0].context.software_count, snapshot.software_count);
    }
}
