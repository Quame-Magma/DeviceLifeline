//! Real WinGet installer (Windows only).
//!
//! [`WinGetInstaller`] shells out to `winget install` via
//! [`std::process::Command`]. Everything in this module is gated on
//! `#[cfg(windows)]`; on other platforms the module compiles empty and
//! [`default_installer`](super::default_installer) uses the mock instead.

#[cfg(windows)]
use std::process::Command;

#[cfg(windows)]
use super::Installer;
#[cfg(windows)]
use crate::models::{RestorePlanStep, StepOutcome};

/// Step-result status for a successful install.
#[cfg(windows)]
const RESULT_SUCCEEDED: &str = "succeeded";
/// Step-result status for a failed install.
#[cfg(windows)]
const RESULT_FAILED: &str = "failed";

/// Installs software using the Windows Package Manager (`winget`).
#[cfg(windows)]
pub struct WinGetInstaller;

#[cfg(windows)]
impl WinGetInstaller {
    /// Creates a new WinGet installer.
    pub fn new() -> Self {
        WinGetInstaller
    }
}

#[cfg(windows)]
impl Default for WinGetInstaller {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(windows)]
impl Installer for WinGetInstaller {
    fn install(&self, step: &RestorePlanStep) -> StepOutcome {
        let mut command = Command::new("winget");
        command.arg("install");

        // Prefer an explicit package id when known; otherwise match by name.
        match &step.winget_id {
            Some(id) => {
                command.arg("--id").arg(id).arg("-e");
            }
            None => {
                command.arg("--name").arg(&step.software_name).arg("-e");
            }
        }
        command
            .arg("--silent")
            .arg("--accept-source-agreements")
            .arg("--accept-package-agreements");

        match command.output() {
            Ok(output) if output.status.success() => StepOutcome {
                status: RESULT_SUCCEEDED.to_string(),
                message: None,
            },
            Ok(output) => StepOutcome {
                status: RESULT_FAILED.to_string(),
                message: Some(first_line(&output.stderr, &output.stdout)),
            },
            Err(err) => StepOutcome {
                status: RESULT_FAILED.to_string(),
                message: Some(err.to_string()),
            },
        }
    }
}

/// Returns the first non-empty line of `stderr`, falling back to `stdout`, or a
/// generic message when both are empty.
#[cfg(windows)]
fn first_line(stderr: &[u8], stdout: &[u8]) -> String {
    let from = |bytes: &[u8]| -> Option<String> {
        String::from_utf8_lossy(bytes)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(|line| line.to_string())
    };
    from(stderr)
        .or_else(|| from(stdout))
        .unwrap_or_else(|| "winget install failed".to_string())
}
