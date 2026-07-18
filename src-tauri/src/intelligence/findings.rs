//! Intelligence findings construction and severity helpers.
//!
//! Builds system findings from live process data and publishes them to the
//! intelligence spine.

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{IntelligenceFinding, ProcessInfo};
use crate::process::risk::{HIGH_CPU_PCT, HIGH_MEMORY_BYTES};
use crate::storage::intelligence_repo;

/// Severity: informational only.
pub const SEVERITY_INFO: &str = "info";
/// Severity: warning — worth operator attention.
pub const SEVERITY_WARNING: &str = "warning";
/// Severity: critical — immediate attention.
pub const SEVERITY_CRITICAL: &str = "critical";

/// Returns true when `severity` is a known severity slug.
pub fn is_valid_severity(severity: &str) -> bool {
    matches!(
        severity,
        SEVERITY_INFO | SEVERITY_WARNING | SEVERITY_CRITICAL
    )
}

/// Maps a numeric risk score onto a severity slug.
pub fn severity_from_risk_score(score: i64) -> &'static str {
    if score >= 70 {
        SEVERITY_CRITICAL
    } else if score >= 40 {
        SEVERITY_WARNING
    } else {
        SEVERITY_INFO
    }
}

/// Builds system/process findings from a process list (does not persist).
pub fn build_system_findings(
    device_id: &str,
    processes: &[ProcessInfo],
) -> Result<Vec<IntelligenceFinding>, CoreError> {
    let created_at = now_rfc3339()?;
    let mut findings = Vec::new();

    for proc_ in processes.iter().filter(|p| p.risk_score >= 40) {
        let kind = if proc_.memory_bytes >= HIGH_MEMORY_BYTES && proc_.cpu_usage >= HIGH_CPU_PCT {
            "high_resource_process"
        } else if proc_.memory_bytes >= HIGH_MEMORY_BYTES {
            "high_memory_process"
        } else if proc_.cpu_usage >= HIGH_CPU_PCT {
            "high_cpu_process"
        } else {
            "elevated_risk_process"
        };

        let severity = severity_from_risk_score(proc_.risk_score).to_string();
        let reasons = if proc_.risk_reasons.is_empty() {
            "heuristic risk score elevated".to_string()
        } else {
            proc_.risk_reasons.join("; ")
        };

        findings.push(IntelligenceFinding {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device_id.to_string(),
            engine: "process".to_string(),
            kind: kind.to_string(),
            severity,
            title: format!("Process attention: {}", proc_.name),
            summary: format!(
                "{} (pid {}) scored risk {}/100.",
                proc_.name, proc_.pid, proc_.risk_score
            ),
            evidence: format!(
                "CPU {:.0}%, memory {} MB. {}",
                proc_.cpu_usage,
                proc_.memory_bytes / (1024 * 1024),
                reasons
            ),
            confidence: (50 + proc_.risk_score / 2).clamp(50, 95),
            suggested_action: Some(format!(
                "Review {} in Process Intelligence; close or update if unexpected.",
                proc_.name
            )),
            action_id: None,
            created_at: created_at.clone(),
            dismissed: false,
        });
    }

    // Cap findings so a noisy host does not flood the spine.
    findings.truncate(15);
    Ok(findings)
}

/// Publishes findings to the database (insert only).
pub fn publish_findings(
    conn: &Connection,
    findings: &[IntelligenceFinding],
) -> Result<(), CoreError> {
    if findings.is_empty() {
        return Ok(());
    }
    intelligence_repo::insert_findings(conn, findings)
}

/// Captures processes, builds findings, publishes them, and returns the published set.
pub fn refresh_system_findings(
    conn: &Connection,
    device_id: &str,
    processes: &[ProcessInfo],
) -> Result<Vec<IntelligenceFinding>, CoreError> {
    let findings = build_system_findings(device_id, processes)?;
    publish_findings(conn, &findings)?;
    Ok(findings)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_process(name: &str, memory: u64, cpu: f64, risk: i64) -> ProcessInfo {
        ProcessInfo {
            pid: 100,
            name: name.to_string(),
            cpu_usage: cpu,
            memory_bytes: memory,
            parent_pid: Some(1),
            status: "Run".to_string(),
            path: Some(r"C:\Program Files\App\app.exe".to_string()),
            risk_score: risk,
            risk_reasons: vec!["High memory (600 MB)".to_string()],
            cmd: None,
            user: None,
            thread_count: None,
            parent_name: Some("services".into()),
            children_count: 0,
            handle_count: None,
            working_set_bytes: Some(memory),
            modules: Vec::new(),
        }
    }

    #[test]
    fn severity_mapping() {
        assert_eq!(severity_from_risk_score(10), SEVERITY_INFO);
        assert_eq!(severity_from_risk_score(50), SEVERITY_WARNING);
        assert_eq!(severity_from_risk_score(80), SEVERITY_CRITICAL);
        assert!(is_valid_severity(SEVERITY_WARNING));
    }

    #[test]
    fn build_system_findings_skips_low_risk() {
        let processes = vec![
            sample_process("quiet.exe", 1_000, 0.1, 5),
            sample_process("hog.exe", HIGH_MEMORY_BYTES + 1, 5.0, 45),
        ];
        let findings = build_system_findings("dev-1", &processes).expect("build");
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].kind, "high_memory_process");
        assert_eq!(findings[0].engine, "process");
    }
}
