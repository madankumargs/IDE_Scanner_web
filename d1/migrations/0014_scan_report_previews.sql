-- Keep source evidence independently bounded from the canonical report row.
-- Large VSIX inventories can otherwise exceed D1's per-value limit even when
-- the decision and finding graph are valid.
CREATE TABLE IF NOT EXISTS app_scan_report_previews (
  scan_id TEXT NOT NULL REFERENCES app_scan_reports(scan_id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY(scan_id, path)
);

CREATE INDEX IF NOT EXISTS app_scan_report_previews_scan_idx
  ON app_scan_report_previews(scan_id, path);
