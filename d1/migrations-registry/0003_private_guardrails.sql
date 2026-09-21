-- Cloudflare-backed private product state.
-- Public registry rows remain in the existing tables; these app_* tables are
-- deliberately isolated so the private product can operate when Supabase is
-- unavailable or rate limited.

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'github',
  provider_subject TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role TEXT,
  primary_ide TEXT,
  use_case TEXT,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS app_teams (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_team_members (
  team_id TEXT NOT NULL REFERENCES app_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  PRIMARY KEY(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS app_team_members_user_idx ON app_team_members(user_id, created_at);

CREATE TABLE IF NOT EXISTS app_team_state (
  team_id TEXT PRIMARY KEY NOT NULL REFERENCES app_teams(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_scan_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  extension_id TEXT NOT NULL,
  version TEXT NOT NULL,
  profile TEXT NOT NULL DEFAULT 'deep',
  status TEXT NOT NULL DEFAULT 'queued',
  lifecycle_stage TEXT NOT NULL DEFAULT 'queued',
  requested_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  requester_hash TEXT,
  scan_purpose TEXT NOT NULL DEFAULT 'user_request',
  expected_scanner_build TEXT,
  target_platform TEXT,
  github_run_id INTEGER,
  runner_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  dispatch_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  callback_error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  result_received_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  last_event_at TEXT
);

CREATE INDEX IF NOT EXISTS app_scan_jobs_lookup_idx ON app_scan_jobs(extension_id, version, profile, status, created_at);
CREATE INDEX IF NOT EXISTS app_scan_jobs_user_idx ON app_scan_jobs(requested_by, created_at);

CREATE TABLE IF NOT EXISTS app_scan_job_subscribers (
  job_id TEXT NOT NULL REFERENCES app_scan_jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(job_id, user_id)
);

CREATE TABLE IF NOT EXISTS app_scan_job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES app_scan_jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_scan_job_events_job_idx ON app_scan_job_events(job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_scan_reports (
  scan_id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL UNIQUE REFERENCES app_scan_jobs(id) ON DELETE CASCADE,
  extension_id TEXT NOT NULL,
  version TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_scan_reports_artifact_idx ON app_scan_reports(extension_id, version, created_at DESC);

CREATE TABLE IF NOT EXISTS app_notification_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES app_teams(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'generic_webhook',
  target TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  delivered_at TEXT,
  next_attempt_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_notification_delivery_idx ON app_notification_deliveries(status, next_attempt_at);
