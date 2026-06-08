//! Performance Timeline.
//!
//! Derives [`TimelineEvent`](crate::models::TimelineEvent)s by diffing two
//! consecutive Device DNA snapshots. The diff itself is a pure function in
//! [`diff`] so it is trivially unit-testable; persistence lives in
//! `storage::timeline_repo` and orchestration in `dna::snapshot`.

pub mod diff;
