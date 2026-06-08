-- Increment 2: system-configuration capture domain.
-- Adds a config_count column to snapshots and a config_items table for startup
-- items, services, and scheduled tasks.

ALTER TABLE device_dna_snapshots ADD COLUMN config_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS config_items (
  id           TEXT PRIMARY KEY,
  snapshot_id  TEXT NOT NULL REFERENCES device_dna_snapshots(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,            -- 'startup' | 'service' | 'scheduled_task'
  name         TEXT NOT NULL,
  status       TEXT,
  path         TEXT,
  publisher    TEXT,
  source       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_config_snapshot ON config_items(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_config_kind ON config_items(kind);
