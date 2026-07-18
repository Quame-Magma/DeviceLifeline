//! Process risk scoring heuristics.
//!
//! Pure functions over process attributes — no OS I/O — so unit tests can cover
//! the policy without sysinfo.

/// Input attributes used by the risk scorer.
#[derive(Clone, Debug)]
pub struct ProcessRiskInput<'a> {
    /// Process display name.
    pub name: &'a str,
    /// CPU usage percentage.
    pub cpu_usage: f64,
    /// Resident memory in bytes.
    pub memory_bytes: u64,
    /// Executable path, if known.
    pub path: Option<&'a str>,
}

/// Output of risk scoring.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProcessRisk {
    /// Score in `0..=100`.
    pub score: i64,
    /// Human-readable reasons that contributed points.
    pub reasons: Vec<String>,
}

/// Memory threshold treated as "high" (500 MiB).
pub const HIGH_MEMORY_BYTES: u64 = 500 * 1024 * 1024;
/// CPU threshold treated as "high" (25%).
pub const HIGH_CPU_PCT: f64 = 25.0;

/// Well-known Windows/system process basenames (lowercase, no extension match
/// is also attempted).
const SYSTEM_LIKE_NAMES: &[&str] = &[
    "system",
    "idle",
    "smss",
    "csrss",
    "wininit",
    "services",
    "lsass",
    "svchost",
    "winlogon",
    "fontdrvhost",
    "dwm",
    "explorer",
    "runtimebroker",
    "sihost",
    "taskhostw",
    "searchhost",
    "startmenuexperiencehost",
    "shellhost",
    "conhost",
    "registry",
    "memory compression",
    "system idle process",
    "secure system",
];

/// Scores a process for risk using simple heuristics.
///
/// Higher scores indicate processes more worth operator attention (resource
/// hogs, missing paths, non-system binaries with high load).
pub fn score_process(input: &ProcessRiskInput<'_>) -> ProcessRisk {
    let mut score: i64 = 0;
    let mut reasons = Vec::new();

    if input.memory_bytes >= HIGH_MEMORY_BYTES {
        score += 35;
        reasons.push(format!(
            "High memory ({} MB)",
            input.memory_bytes / (1024 * 1024)
        ));
    } else if input.memory_bytes >= HIGH_MEMORY_BYTES / 2 {
        score += 15;
        reasons.push(format!(
            "Elevated memory ({} MB)",
            input.memory_bytes / (1024 * 1024)
        ));
    }

    if input.cpu_usage >= HIGH_CPU_PCT {
        score += 30;
        reasons.push(format!("High CPU ({:.0}%)", input.cpu_usage));
    } else if input.cpu_usage >= 10.0 {
        score += 10;
        reasons.push(format!("Elevated CPU ({:.0}%)", input.cpu_usage));
    }

    let path_empty = input
        .path
        .map(|p| p.trim().is_empty())
        .unwrap_or(true);
    if path_empty && !is_system_like_name(input.name) {
        score += 20;
        reasons.push("Empty executable path".to_string());
    }

    if is_system_like_name(input.name) {
        // System processes are less suspicious as "user risk" but still can
        // contribute resource findings; dampen empty-path and mild load.
        score = (score - 10).max(0);
        if score > 0 {
            reasons.push("System-like process name".to_string());
        }
    } else if looks_like_user_app(input.path) {
        // User apps with high resource use are more actionable.
        if input.memory_bytes >= HIGH_MEMORY_BYTES || input.cpu_usage >= HIGH_CPU_PCT {
            score += 10;
            reasons.push("User application under load".to_string());
        }
    }

    ProcessRisk {
        score: score.clamp(0, 100),
        reasons,
    }
}

/// Returns true when the process name matches a known system-like basename.
pub fn is_system_like_name(name: &str) -> bool {
    let base = basename_lower(name);
    SYSTEM_LIKE_NAMES
        .iter()
        .any(|sys| base == *sys || base.trim_end_matches(".exe") == *sys)
}

fn looks_like_user_app(path: Option<&str>) -> bool {
    let Some(path) = path.map(|p| p.to_lowercase()) else {
        return false;
    };
    path.contains("\\users\\")
        || path.contains("/users/")
        || path.contains("\\program files")
        || path.contains("/applications/")
        || path.contains("\\appdata\\")
}

fn basename_lower(name: &str) -> String {
    let trimmed = name.trim();
    let base = trimmed
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(trimmed);
    base.to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn high_memory_increases_score() {
        let risk = score_process(&ProcessRiskInput {
            name: "chrome.exe",
            cpu_usage: 1.0,
            memory_bytes: 600 * 1024 * 1024,
            path: Some(r"C:\Program Files\Google\Chrome\chrome.exe"),
        });
        assert!(risk.score >= 35);
        assert!(risk.reasons.iter().any(|r| r.contains("High memory")));
    }

    #[test]
    fn high_cpu_increases_score() {
        let risk = score_process(&ProcessRiskInput {
            name: "encode.exe",
            cpu_usage: 40.0,
            memory_bytes: 10 * 1024 * 1024,
            path: Some(r"C:\Users\me\tools\encode.exe"),
        });
        assert!(risk.score >= 30);
        assert!(risk.reasons.iter().any(|r| r.contains("High CPU")));
    }

    #[test]
    fn empty_path_non_system_adds_risk() {
        let risk = score_process(&ProcessRiskInput {
            name: "mystery.exe",
            cpu_usage: 0.0,
            memory_bytes: 1_000,
            path: None,
        });
        assert!(risk.score >= 20);
        assert!(risk.reasons.iter().any(|r| r.contains("Empty")));
    }

    #[test]
    fn system_like_names_are_recognized() {
        assert!(is_system_like_name("svchost.exe"));
        assert!(is_system_like_name("System"));
        assert!(!is_system_like_name("myapp.exe"));
    }

    #[test]
    fn system_process_with_empty_path_is_dampened() {
        let risk = score_process(&ProcessRiskInput {
            name: "svchost.exe",
            cpu_usage: 0.0,
            memory_bytes: 1_000,
            path: None,
        });
        // Empty path (+20) then system dampen (-10) => 10, no resource reasons.
        assert!(risk.score <= 15);
    }
}
