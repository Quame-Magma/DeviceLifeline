-- Patch My PC–class update catalog + Macrium-class backup schedules.

CREATE TABLE IF NOT EXISTS software_updates (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  winget_id TEXT,
  publisher TEXT,
  current_version TEXT,
  available_version TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'winget',
  status TEXT NOT NULL DEFAULT 'available',
  detail TEXT,
  scanned_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_software_updates_device ON software_updates(device_id);
CREATE INDEX IF NOT EXISTS idx_software_updates_status ON software_updates(status);

CREATE TABLE IF NOT EXISTS backup_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  volume TEXT NOT NULL,
  frequency TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  detail TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_backup_schedules_device ON backup_schedules(device_id);

CREATE TABLE IF NOT EXISTS volume_shadows (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  shadow_id TEXT NOT NULL,
  volume TEXT NOT NULL,
  device_object TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  detail TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_volume_shadows_device ON volume_shadows(device_id);
