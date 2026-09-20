-- Stage registry snapshots under an immutable publication id and flip one
-- pointer only after every section and product chunk has been written.
-- The legacy chunk tables remain available for the transition fallback in the
-- application; new imports use these generation-addressed tables.
CREATE TABLE IF NOT EXISTS registry_publications (
  id TEXT PRIMARY KEY NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS registry_publication_state (
  state_key TEXT PRIMARY KEY NOT NULL,
  publication_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS registry_section_chunks_v2 (
  publication_id TEXT NOT NULL,
  section TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (publication_id, section, chunk_index)
);

CREATE INDEX IF NOT EXISTS registry_section_chunks_v2_lookup_idx
  ON registry_section_chunks_v2 (publication_id, section, chunk_index);

CREATE TABLE IF NOT EXISTS registry_product_chunks_v2 (
  publication_id TEXT NOT NULL,
  extension_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (publication_id, extension_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS registry_product_chunks_v2_lookup_idx
  ON registry_product_chunks_v2 (publication_id, extension_id, chunk_index);
