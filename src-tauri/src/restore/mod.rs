//! Restore & Install orchestration.
//!
//! [`plan`] turns a snapshot's software inventory into an ordered
//! [`RestorePlan`](crate::models::RestorePlan); [`executor`] runs a plan through
//! an [`Installer`](crate::installer::Installer), persisting a
//! [`RestoreJob`](crate::models::RestoreJob) and its per-step results. Neither
//! performs IPC or owns shared state (see doc 48 §4.1).

pub mod executor;
pub mod plan;
