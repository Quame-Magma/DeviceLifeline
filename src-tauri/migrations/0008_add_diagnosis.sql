-- Increment 11: AI Detective (offline / heuristic).
-- A diagnosis session records a natural-language query, the on-device context
-- summary that was analyzed (context_json, for transparency), and a set of
-- findings (likely causes with evidence, confidence, and suggested actions).

CREATE TABLE IF NOT EXISTS diagnosis_sessions (
  id            TEXT PRIMARY KEY,
  device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  query         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  summary       TEXT NOT NULL,
  context_json  TEXT NOT NULL,   -- serialized DiagnosisContext (what was analyzed)
  finding_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_diagnosis_sessions_created ON diagnosis_sessions(created_at DESC);

CREATE TABLE IF NOT EXISTS diagnosis_findings (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES diagnosis_sessions(id) ON DELETE CASCADE,
  order_index      INTEGER NOT NULL,
  title            TEXT NOT NULL,
  cause            TEXT NOT NULL,
  evidence         TEXT NOT NULL,
  confidence       INTEGER NOT NULL,   -- 0..100
  suggested_action TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diagnosis_findings_session ON diagnosis_findings(session_id);
