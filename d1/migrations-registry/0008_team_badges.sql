-- Team-owned exact-release badges. The public token exposes only a sanitized
-- projection; all workspace metadata remains behind team authorization.
CREATE TABLE IF NOT EXISTS app_team_badges (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES app_teams(id) ON DELETE CASCADE,
  extension_id TEXT NOT NULL,
  badge_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'exact_release' CHECK (mode IN ('exact_release', 'latest')),
  version TEXT NOT NULL,
  scan_id TEXT REFERENCES app_scan_reports(scan_id) ON DELETE SET NULL,
  scan_job_id TEXT REFERENCES app_scan_jobs(id) ON DELETE SET NULL,
  artifact_sha256 TEXT,
  public_token TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'stale', 'failed', 'revoked')),
  decision TEXT,
  verdict TEXT,
  public_outcome TEXT,
  trust_tier TEXT,
  trust_label TEXT,
  coverage_percent REAL,
  risk_score REAL,
  malware_score REAL,
  scanned_at TEXT,
  last_error TEXT,
  revoked_at TEXT,
  created_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(team_id, badge_key)
);

CREATE INDEX IF NOT EXISTS app_team_badges_team_status_idx
  ON app_team_badges(team_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_team_badges_team_extension_idx
  ON app_team_badges(team_id, extension_id, updated_at DESC);
