//! Installer abstraction for executing restore steps.
//!
//! The [`Installer`] trait hides the platform-specific install mechanism behind
//! a single method. [`default_installer`] returns the real
//! [`WinGetInstaller`](winget::WinGetInstaller) on Windows and the deterministic
//! [`MockInstaller`] everywhere else, so the restore flow is runnable and
//! testable on any platform.

pub mod winget;

use crate::models::{RestorePlanStep, StepOutcome};

/// Step-result status for a successful install.
const RESULT_SUCCEEDED: &str = "succeeded";
/// Step-result status for a failed install.
const RESULT_FAILED: &str = "failed";

/// Installs the software described by a single [`RestorePlanStep`].
pub trait Installer: Send + Sync {
    /// Attempts to install `step`, returning the [`StepOutcome`].
    fn install(&self, step: &RestorePlanStep) -> StepOutcome;
}

/// Returns the platform-appropriate [`Installer`].
///
/// On Windows this runs real `winget` commands; on every other platform (and in
/// unit tests) it returns the deterministic [`MockInstaller`].
pub fn default_installer() -> Box<dyn Installer> {
    #[cfg(windows)]
    {
        Box::new(winget::WinGetInstaller::new())
    }
    #[cfg(not(windows))]
    {
        Box::new(MockInstaller::new())
    }
}

/// A deterministic, cross-platform installer used on non-Windows builds and in
/// tests. Every step succeeds except those whose `software_name` contains
/// `"Docker"`, which fail with a simulated package-not-found message.
pub struct MockInstaller;

impl MockInstaller {
    /// Creates a new mock installer.
    pub fn new() -> Self {
        MockInstaller
    }
}

impl Default for MockInstaller {
    fn default() -> Self {
        Self::new()
    }
}

impl Installer for MockInstaller {
    fn install(&self, step: &RestorePlanStep) -> StepOutcome {
        if step.software_name.contains("Docker") {
            StepOutcome {
                status: RESULT_FAILED.to_string(),
                message: Some("winget package not found (simulated)".to_string()),
            }
        } else {
            StepOutcome {
                status: RESULT_SUCCEEDED.to_string(),
                message: None,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(name: &str) -> RestorePlanStep {
        RestorePlanStep {
            id: "step-1".to_string(),
            plan_id: "plan-1".to_string(),
            order_index: 0,
            software_name: name.to_string(),
            target_version: None,
            winget_id: None,
            source: "winget".to_string(),
        }
    }

    #[test]
    fn mock_installer_succeeds_for_normal_software() {
        let installer = MockInstaller::new();
        let outcome = installer.install(&step("Google Chrome"));
        assert_eq!(outcome.status, "succeeded");
        assert!(outcome.message.is_none());
    }

    #[test]
    fn mock_installer_fails_for_docker() {
        let installer = MockInstaller::new();
        let outcome = installer.install(&step("Docker Desktop"));
        assert_eq!(outcome.status, "failed");
        assert_eq!(
            outcome.message.as_deref(),
            Some("winget package not found (simulated)")
        );
    }
}
