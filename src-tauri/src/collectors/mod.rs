//! OS data collectors.
//!
//! Collectors perform raw OS data collection (e.g., reading the Windows
//! registry) and return normalized [`RawSoftware`](crate::models::RawSoftware)
//! values. They contain no persistence and no business logic beyond
//! normalization (see doc 48 §4.1).

pub mod software;

use crate::error::CollectorError;
use crate::models::RawSoftware;

/// A source of installed-software inventory.
pub trait SoftwareCollector: Send + Sync {
    /// Collects the current installed-software inventory.
    fn collect(&self) -> Result<Vec<RawSoftware>, CollectorError>;
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
