-- Vision 2.0 intelligence spine: durable findings, action audit, background jobs.

CREATE TABLE IF NOT EXISTS intelligence_findings (
  id           TEXT PRIMARY KEY,
  device_id    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  engine       TEXT NOT NULL,
  kind         TEXT NOT NULL,
  severity     TEXT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL,
  evidence     TEXT NOT NULL,
  confidence   INTEGER NOT NULL,
  suggested_action TEXT,
  action_id    TEXT,
  created_at   TEXT NOT NULL,
  dismissed    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_findings_device ON intelligence_findings(device_id);
CREATE INDEX IF NOT EXISTS idx_findings_engine ON intelligence_findings(engine);
CREATE INDEX IF NOT EXISTS idx_findings_created ON intelligence_findings(created_at DESC);

CREATE TABLE IF NOT EXISTS action_audit (
  id            TEXT PRIMARY KEY,
  device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  action_type   TEXT NOT NULL,
  risk_tier     TEXT NOT NULL,
  title         TEXT NOT NULL,
  detail        TEXT,
  status        TEXT NOT NULL,
  preview       TEXT,
  result_message TEXT,
  created_at    TEXT NOT NULL,
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_action_audit_device ON action_audit(device_id);
CREATE INDEX IF NOT EXISTS idx_action_audit_created ON action_audit(created_at DESC);

CREATE TABLE IF NOT EXISTS background_jobs (
  id            TEXT PRIMARY KEY,
  device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL,
  status        TEXT NOT NULL,
  progress_pct  INTEGER NOT NULL DEFAULT 0,
  message       TEXT,
  result_json   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_device ON background_jobs(device_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON background_jobs(status);
