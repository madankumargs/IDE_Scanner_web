-- Skill scans are intentionally isolated from the extension scan contract.
-- The report identity is an exact public GitHub Skill snapshot.
CREATE TABLE IF NOT EXISTS app_skill_scan_reports (
  scan_id TEXT PRIMARY KEY NOT NULL,
  skill_id TEXT NOT NULL,
  requested_url TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  ref TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  skill_path TEXT NOT NULL DEFAULT '',
  canonical_url TEXT NOT NULL,
  commit_url TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  decision TEXT NOT NULL,
  risk_score REAL NOT NULL,
  malware_score REAL NOT NULL,
  coverage_completed INTEGER NOT NULL,
  coverage_required INTEGER NOT NULL,
  findings_count INTEGER NOT NULL,
  report_json TEXT NOT NULL,
  report_chunk_count INTEGER NOT NULL DEFAULT 0,
  scanned_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS app_skill_scan_reports_identity_idx
  ON app_skill_scan_reports(owner, repo, skill_path, commit_sha);

CREATE INDEX IF NOT EXISTS app_skill_scan_reports_decision_idx
  ON app_skill_scan_reports(decision, scanned_at DESC);

CREATE TABLE IF NOT EXISTS app_skill_scan_report_chunks (
  scan_id TEXT NOT NULL REFERENCES app_skill_scan_reports(scan_id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY(scan_id, chunk_index)
);
