//! OS data collectors.
//!
//! Collectors perform raw OS data collection (e.g., reading the Windows
//! registry) and return normalized [`RawSoftware`](crate::models::RawSoftware)
//! or [`RawConfig`](crate::models::RawConfig) values. They contain no
//! persistence and no business logic beyond normalization (see doc 48 §4.1).

pub mod config;
pub mod software;

use crate::error::CollectorError;
use crate::models::{RawConfig, RawSoftware};

/// A source of installed-software inventory.
pub trait SoftwareCollector: Send + Sync {
    /// Collects the current installed-software inventory.
    fn collect(&self) -> Result<Vec<RawSoftware>, CollectorError>;
}

/// A source of system-configuration items (startup, services, scheduled tasks).
pub trait ConfigCollector: Send + Sync {
    /// Collects the current system-configuration items.
    fn collect(&self) -> Result<Vec<RawConfig>, CollectorError>;
}

/// Returns the platform-appropriate [`SoftwareCollector`].
///
/// On Windows this reads the real uninstall registry; on every other platform
/// (and in unit tests) it returns deterministic mock data.
pub fn default_software_collector() -> Box<dyn SoftwareCollector> {
    #[cfg(windows)]
    {
        Box::new(software::WindowsSoftwareCollector::new())
    }
    #[cfg(not(windows))]
    {
        Box::new(software::MockSoftwareCollector::new())
    }
}

/// Returns the platform-appropriate [`ConfigCollector`].
///
/// On Windows this reads the real registry (Run keys, services, scheduled
/// tasks); on every other platform (and in unit tests) it returns deterministic
/// mock data.
pub fn default_config_collector() -> Box<dyn ConfigCollector> {
    #[cfg(windows)]
    {
        Box::new(config::WindowsConfigCollector::new())
    }
    #[cfg(not(windows))]
    {
        Box::new(config::MockConfigCollector::new())
    }
}
