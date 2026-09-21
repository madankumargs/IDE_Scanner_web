CREATE TABLE IF NOT EXISTS registry_sections (
  section TEXT PRIMARY KEY NOT NULL,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS registry_product_chunks (
  extension_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (extension_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS registry_product_chunks_extension_idx
  ON registry_product_chunks (extension_id, chunk_index);
