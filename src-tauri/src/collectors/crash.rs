//! Crash / stability event collectors.
//!
//! [`WindowsCrashCollector`] reads the Windows Event Log by shelling out to
//! PowerShell `Get-WinEvent` (compiled only on Windows), mirroring how
//! [`WinGetInstaller`](crate::installer::winget) shells out to `winget`.
//! [`MockCrashCollector`] returns a fixed set of representative events and is
//! always compiled, so non-Windows builds and unit tests have a deterministic
//! source.

#[cfg(windows)]
use std::process::Command;

use crate::error::CollectorError;
use crate::models::RawCrashEvent;

use super::CrashCollector;

/// PowerShell script that emits recent crash/stability events as
/// `provider|eventId|isoTimestamp|message` lines from the System and
/// Application logs.
#[cfg(windows)]
const PS_SCRIPT: &str = r#"$ErrorActionPreference='SilentlyContinue';
$e=@();
$e+=Get-WinEvent -FilterHashtable @{LogName='System';Id=1001,41,6008} -MaxEvents 100;
$e+=Get-WinEvent -FilterHashtable @{LogName='Application';Id=1000,1002} -MaxEvents 100;
$e | ForEach-Object { '{0}|{1}|{2}|{3}' -f $_.ProviderName,$_.Id,$_.TimeCreated.ToUniversalTime().ToString('o'),($_.Message -replace '[\r\n]+',' ') }"#;

/// Reads recent crash / stability events from the Windows Event Log.
#[cfg(windows)]
pub struct WindowsCrashCollector;

#[cfg(windows)]
impl WindowsCrashCollector {
    /// Creates a new collector.
    pub fn new() -> Self {
        WindowsCrashCollector
    }
}

#[cfg(windows)]
impl Default for WindowsCrashCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(windows)]
impl CrashCollector for WindowsCrashCollector {
    fn collect(&self) -> Result<Vec<RawCrashEvent>, CollectorError> {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT])
            .output()
            .map_err(|err| CollectorError::Source(format!("failed to run powershell: {err}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let line = stderr
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .unwrap_or("Get-WinEvent failed");
            return Err(CollectorError::Source(format!(
                "Get-WinEvent failed: {line}"
            )));
        }

        Ok(parse_lines(&output.stdout))
    }
}

/// Parses `provider|eventId|isoTimestamp|message` lines into [`RawCrashEvent`]s.
/// Malformed lines are skipped. The message keeps any embedded `|`.
#[cfg(windows)]
fn parse_lines(stdout: &[u8]) -> Vec<RawCrashEvent> {
    String::from_utf8_lossy(stdout)
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let mut parts = line.splitn(4, '|');
            let provider = parts.next()?.trim().to_string();
            let event_id = parts.next().and_then(|s| s.trim().parse::<i64>().ok());
            let occurred_at = parts.next()?.trim().to_string();
            let message = parts
                .next()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            if provider.is_empty() || occurred_at.is_empty() {
                return None;
            }
            Some(RawCrashEvent {
                provider,
                event_id,
                occurred_at,
                message,
            })
        })
        .collect()
}

/// A deterministic, cross-platform collector used on non-Windows builds and in
/// tests. Always returns the same four events (covering BSOD, application
/// crash, application hang, and kernel-power) with `source = "mock"` providers.
pub struct MockCrashCollector;

impl MockCrashCollector {
    /// Creates a new mock collector.
    pub fn new() -> Self {
        MockCrashCollector
    }
}

impl Default for MockCrashCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl CrashCollector for MockCrashCollector {
    fn collect(&self) -> Result<Vec<RawCrashEvent>, CollectorError> {
        let event = |provider: &str, id: i64, occurred_at: &str, message: &str| RawCrashEvent {
            provider: provider.to_string(),
            event_id: Some(id),
            occurred_at: occurred_at.to_string(),
            message: Some(message.to_string()),
        };

        Ok(vec![
            event(
                "Microsoft-Windows-WER-SystemErrorReporting",
                1001,
                "2026-06-07T03:12:45Z",
                "The computer rebooted from a bugcheck. BugCheck 0x0000007E \
                 (SYSTEM_THREAD_EXCEPTION_NOT_HANDLED).",
            ),
            event(
                "Application Error",
                1000,
                "2026-06-07T09:41:02Z",
                "Faulting application name: chrome.exe, version 125.0.6422.142; \
                 faulting module: ntdll.dll.",
            ),
            event(
                "Application Hang",
                1002,
                "2026-06-06T18:05:33Z",
                "The program Code.exe version 1.90.0 stopped interacting with \
                 Windows and was closed.",
            ),
            event(
                "Microsoft-Windows-Kernel-Power",
                41,
                "2026-06-05T22:58:10Z",
                "The system rebooted without cleanly shutting down first.",
            ),
        ])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_collector_returns_four_events_with_ids() {
        let collector = MockCrashCollector::new();
        let events = collector.collect().expect("mock collect");
        assert_eq!(events.len(), 4);
        assert!(events.iter().all(|e| e.event_id.is_some()));
        assert!(events.iter().any(|e| e.event_id == Some(1001)));
    }

    #[test]
    fn mock_collector_is_stable_across_calls() {
        let collector = MockCrashCollector::new();
        let first = collector.collect().expect("first collect");
        let second = collector.collect().expect("second collect");
        let first_ids: Vec<Option<i64>> = first.iter().map(|e| e.event_id).collect();
        let second_ids: Vec<Option<i64>> = second.iter().map(|e| e.event_id).collect();
        assert_eq!(first_ids, second_ids);
    }
}
