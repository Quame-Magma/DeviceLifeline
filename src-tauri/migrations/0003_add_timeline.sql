-- Increment 3: Performance Timeline.
-- Stores change events derived from diffing consecutive Device DNA snapshots.

CREATE TABLE IF NOT EXISTS timeline_events (
  id                   TEXT PRIMARY KEY,
  device_id            TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  snapshot_id          TEXT NOT NULL REFERENCES device_dna_snapshots(id) ON DELETE CASCADE,
  previous_snapshot_id TEXT REFERENCES device_dna_snapshots(id) ON DELETE SET NULL,
  event_type           TEXT NOT NULL,  -- software_install | software_removal | software_update | config_added | config_removed
  category             TEXT NOT NULL,  -- software | config
  title                TEXT NOT NULL,
  detail               TEXT,
  occurred_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_device ON timeline_events(device_id);
CREATE INDEX IF NOT EXISTS idx_timeline_occurred ON timeline_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_snapshot ON timeline_events(snapshot_id);
