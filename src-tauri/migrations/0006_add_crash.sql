-- Increment 6: Crash Intelligence.
-- Crash / stability events parsed from the OS event log (Windows Event Viewer on
-- Windows; a deterministic mock elsewhere), classified into plain-English
-- categories. Re-scanning the log is idempotent thanks to the UNIQUE natural key.

CREATE TABLE IF NOT EXISTS crash_events (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,    -- when the crash/event happened (RFC3339)
  captured_at TEXT NOT NULL,    -- when DeviceLifeline recorded it (RFC3339)
  category    TEXT NOT NULL,    -- bsod | app_crash | app_hang | kernel_power | unexpected_shutdown | unknown
  severity    TEXT NOT NULL,    -- critical | error | warning
  source      TEXT NOT NULL,    -- event provider name, or "mock"
  title       TEXT NOT NULL,    -- plain-English summary line
  detail      TEXT,             -- plain-English detail / raw event message
  event_id    INTEGER,          -- Windows Event ID, when known
  UNIQUE (device_id, occurred_at, category, title)
);
CREATE INDEX IF NOT EXISTS idx_crash_events_device ON crash_events(device_id);
CREATE INDEX IF NOT EXISTS idx_crash_events_occurred ON crash_events(occurred_at DESC);
