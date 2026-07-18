-- Hardware samples, drivers, security findings, recovery vault (VSS / disk vault).

CREATE TABLE IF NOT EXISTS hardware_samples (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  captured_at     TEXT NOT NULL,
  cpu_temp_c      REAL,
  gpu_temp_c      REAL,
  gpu_name        TEXT,
  gpu_usage_pct   REAL,
  gpu_vram_used   INTEGER,
  gpu_vram_total  INTEGER,
  cpu_clock_mhz   REAL,
  metrics_json    TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_hardware_samples_device ON hardware_samples(device_id);
CREATE INDEX IF NOT EXISTS idx_hardware_samples_captured ON hardware_samples(captured_at DESC);

CREATE TABLE IF NOT EXISTS smart_readings (
  id              TEXT PRIMARY KEY,
  sample_id       TEXT NOT NULL REFERENCES hardware_samples(id) ON DELETE CASCADE,
  disk_name       TEXT NOT NULL,
  model           TEXT,
  serial          TEXT,
  media_type      TEXT,
  health_status   TEXT,
  temperature_c   REAL,
  power_on_hours  INTEGER,
  wear_pct        REAL,
  raw_json        TEXT
);
CREATE INDEX IF NOT EXISTS idx_smart_sample ON smart_readings(sample_id);

CREATE TABLE IF NOT EXISTS drivers (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  captured_at     TEXT NOT NULL,
  name            TEXT NOT NULL,
  device_class    TEXT,
  manufacturer    TEXT,
  driver_version  TEXT,
  driver_date     TEXT,
  signer          TEXT,
  is_signed       INTEGER NOT NULL DEFAULT 0,
  inf_name        TEXT,
  hardware_id     TEXT,
  status          TEXT,
  health_score    INTEGER NOT NULL DEFAULT 100,
  risk_reasons    TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_drivers_device ON drivers(device_id);
CREATE INDEX IF NOT EXISTS idx_drivers_name ON drivers(name);

CREATE TABLE IF NOT EXISTS security_findings (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL,
  category        TEXT NOT NULL,
  severity        TEXT NOT NULL,
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  evidence        TEXT NOT NULL,
  confidence      INTEGER NOT NULL,
  path            TEXT,
  process_name    TEXT,
  dismissed       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_security_findings_device ON security_findings(device_id);
CREATE INDEX IF NOT EXISTS idx_security_findings_created ON security_findings(created_at DESC);

CREATE TABLE IF NOT EXISTS vault_entries (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL,
  detail          TEXT,
  path            TEXT,
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  metadata_json   TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_vault_device ON vault_entries(device_id);
CREATE INDEX IF NOT EXISTS idx_vault_created ON vault_entries(created_at DESC);

CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,
  captured_at     TEXT NOT NULL,
  status          TEXT NOT NULL,
  detail          TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_device ON agent_heartbeats(device_id);
