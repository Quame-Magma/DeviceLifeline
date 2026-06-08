-- Increment 5: Health Intelligence.
-- On-device health samples: a point-in-time reading of CPU, memory, and disk
-- usage plus a derived 0-100 HealthScore (higher is healthier). One row per
-- sample, linked to the device the reading was taken on.

CREATE TABLE IF NOT EXISTS health_samples (
  id           TEXT PRIMARY KEY,
  device_id    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  captured_at  TEXT NOT NULL,
  cpu_usage    REAL NOT NULL,    -- overall CPU usage, percent 0..100
  memory_total INTEGER NOT NULL, -- total physical memory, bytes
  memory_used  INTEGER NOT NULL, -- used physical memory, bytes
  disk_total   INTEGER NOT NULL, -- primary disk total space, bytes
  disk_used    INTEGER NOT NULL, -- primary disk used space, bytes
  health_score INTEGER NOT NULL  -- derived score, 0..100 (higher is healthier)
);
CREATE INDEX IF NOT EXISTS idx_health_samples_device ON health_samples(device_id);
CREATE INDEX IF NOT EXISTS idx_health_samples_captured ON health_samples(captured_at DESC);
