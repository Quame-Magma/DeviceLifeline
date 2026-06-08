-- Increment 7: Health Alerts.
-- Threshold-breach alerts derived from a health_samples reading (e.g. memory
-- critically high, disk low on space, CPU sustained high). Each alert links to
-- the sample that produced it and can be acknowledged by the user.

CREATE TABLE IF NOT EXISTS health_alerts (
  id           TEXT PRIMARY KEY,
  device_id    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  sample_id    TEXT NOT NULL REFERENCES health_samples(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,    -- RFC3339; the producing sample's captured_at
  kind         TEXT NOT NULL,    -- memory_critical | disk_low_space | cpu_high
  severity     TEXT NOT NULL,    -- critical | warning
  title        TEXT NOT NULL,    -- plain-English summary
  detail       TEXT NOT NULL,    -- plain-English detail
  value        REAL NOT NULL,    -- breaching percentage (0..100)
  acknowledged INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_health_alerts_device ON health_alerts(device_id);
CREATE INDEX IF NOT EXISTS idx_health_alerts_created ON health_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_alerts_ack ON health_alerts(acknowledged);
