PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,
  hostname    TEXT NOT NULL,
  os_name     TEXT NOT NULL,
  os_version  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_dna_snapshots (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  captured_at    TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  source         TEXT NOT NULL,
  software_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_snapshots_device ON device_dna_snapshots(device_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured ON device_dna_snapshots(captured_at DESC);

CREATE TABLE IF NOT EXISTS software_inventory_items (
  id               TEXT PRIMARY KEY,
  snapshot_id      TEXT NOT NULL REFERENCES device_dna_snapshots(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  version          TEXT,
  publisher        TEXT,
  install_date     TEXT,
  source           TEXT NOT NULL,
  install_location TEXT
);
CREATE INDEX IF NOT EXISTS idx_software_snapshot ON software_inventory_items(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_software_name ON software_inventory_items(name);
