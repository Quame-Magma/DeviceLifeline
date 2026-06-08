-- Increment 12: Cloud-sync scaffold (offline queue).
-- Records entities (snapshots, health samples) pending upload to the cloud.
-- Until a Supabase project is configured, items simply remain 'pending'. The
-- UNIQUE(entity_type, entity_id) key makes enqueueing idempotent.

CREATE TABLE IF NOT EXISTS sync_queue (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,    -- snapshot | health_sample
  entity_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | synced | failed
  attempts    INTEGER NOT NULL DEFAULT 0,
  synced_at   TEXT,
  UNIQUE (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
