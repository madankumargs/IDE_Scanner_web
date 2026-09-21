CREATE TABLE IF NOT EXISTS registry_section_chunks (
  section TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (section, chunk_index)
);

CREATE INDEX IF NOT EXISTS registry_section_chunks_section_idx
  ON registry_section_chunks (section, chunk_index);
