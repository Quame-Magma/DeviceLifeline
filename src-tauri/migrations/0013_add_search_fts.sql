-- Universal search: FTS5 index over findings, software, config, crashes, timeline.

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity_type,
  entity_id,
  title,
  body,
  tokenize = 'porter'
);
