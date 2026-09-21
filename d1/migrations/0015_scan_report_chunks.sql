CREATE TABLE IF NOT EXISTS app_scan_report_chunks (
  scan_id TEXT NOT NULL REFERENCES app_scan_reports(scan_id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (scan_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS app_scan_report_chunks_scan_idx
  ON app_scan_report_chunks(scan_id, chunk_index);
