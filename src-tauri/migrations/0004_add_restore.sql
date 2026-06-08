-- Increment 4: Restore & Install.
-- Restore plans generated from snapshots, the steps within them, execution jobs,
-- and per-step results.

CREATE TABLE IF NOT EXISTS restore_plans (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES device_dna_snapshots(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  step_count  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_restore_plans_device ON restore_plans(device_id);
CREATE INDEX IF NOT EXISTS idx_restore_plans_created ON restore_plans(created_at DESC);

CREATE TABLE IF NOT EXISTS restore_plan_steps (
  id             TEXT PRIMARY KEY,
  plan_id        TEXT NOT NULL REFERENCES restore_plans(id) ON DELETE CASCADE,
  order_index    INTEGER NOT NULL,
  software_name  TEXT NOT NULL,
  target_version TEXT,
  winget_id      TEXT,
  source         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_restore_steps_plan ON restore_plan_steps(plan_id);

CREATE TABLE IF NOT EXISTS restore_jobs (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT NOT NULL REFERENCES restore_plans(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status          TEXT NOT NULL,   -- running | completed | completed_with_errors | failed
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  total_steps     INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  skipped_count   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_restore_jobs_plan ON restore_jobs(plan_id);
CREATE INDEX IF NOT EXISTS idx_restore_jobs_started ON restore_jobs(started_at DESC);

CREATE TABLE IF NOT EXISTS restore_step_results (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES restore_jobs(id) ON DELETE CASCADE,
  step_id       TEXT NOT NULL REFERENCES restore_plan_steps(id) ON DELETE CASCADE,
  software_name TEXT NOT NULL,
  status        TEXT NOT NULL,   -- succeeded | failed | skipped
  message       TEXT
);
CREATE INDEX IF NOT EXISTS idx_restore_results_job ON restore_step_results(job_id);
