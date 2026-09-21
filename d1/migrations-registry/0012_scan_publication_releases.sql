CREATE TABLE IF NOT EXISTS app_scan_publication_releases (
  id TEXT PRIMARY KEY NOT NULL,
  policy_version TEXT NOT NULL,
  ruleset_version TEXT NOT NULL,
  score_schema_version TEXT NOT NULL,
  scanner_build TEXT NOT NULL,
  expected_reports INTEGER NOT NULL,
  report_count_at_activation INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  activated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS app_scan_publication_active_idx
  ON app_scan_publication_releases(active)
  WHERE active = 1;

CREATE TABLE IF NOT EXISTS app_scan_publication_release_reports (
  release_id TEXT NOT NULL REFERENCES app_scan_publication_releases(id) ON DELETE CASCADE,
  scan_id TEXT NOT NULL REFERENCES app_scan_reports(scan_id) ON DELETE CASCADE,
  extension_id TEXT NOT NULL,
  version TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  PRIMARY KEY (release_id, scan_id),
  UNIQUE (release_id, extension_id, version)
);

CREATE INDEX IF NOT EXISTS app_scan_publication_release_reports_release_idx
  ON app_scan_publication_release_reports(release_id, extension_id, version);
