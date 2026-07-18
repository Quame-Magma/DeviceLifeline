-- Storage Intelligence: scan jobs and discovered items.

CREATE TABLE IF NOT EXISTS storage_scans (
  id            TEXT PRIMARY KEY,
  device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  root_path     TEXT NOT NULL,
  status        TEXT NOT NULL,
  total_bytes   INTEGER NOT NULL DEFAULT 0,
  file_count    INTEGER NOT NULL DEFAULT 0,
  dir_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_storage_scans_device ON storage_scans(device_id);

CREATE TABLE IF NOT EXISTS storage_items (
  id            TEXT PRIMARY KEY,
  scan_id       TEXT NOT NULL REFERENCES storage_scans(id) ON DELETE CASCADE,
  path          TEXT NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  category      TEXT NOT NULL,
  is_directory  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_storage_items_scan ON storage_items(scan_id);
CREATE INDEX IF NOT EXISTS idx_storage_items_size ON storage_items(size_bytes DESC);
CREATE INDEX IF NOT EXISTS idx_storage_items_category ON storage_items(category);
