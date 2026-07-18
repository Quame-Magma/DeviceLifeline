-- Metadata for Everything-style scoped file index (documents live in search_index as entity_type=file).

CREATE TABLE IF NOT EXISTS file_index_meta (
  id            TEXT PRIMARY KEY,
  built_at      TEXT NOT NULL,
  file_count    INTEGER NOT NULL DEFAULT 0,
  root_count    INTEGER NOT NULL DEFAULT 0,
  roots_json    TEXT NOT NULL DEFAULT '[]'
);
