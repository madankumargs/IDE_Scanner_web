-- Small, abuse-resistant anonymous Deep Scan trial.
-- The trial key is an HMAC-derived requester fingerprint; raw IP addresses
-- are never stored. Access is granted by a separate hashed HttpOnly cookie.

CREATE TABLE IF NOT EXISTS app_guest_scan_trials (
  trial_key TEXT PRIMARY KEY NOT NULL,
  scan_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  last_scan_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_guest_scan_access (
  job_id TEXT PRIMARY KEY NOT NULL REFERENCES app_scan_jobs(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  trial_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_guest_scan_access_token_idx ON app_guest_scan_access(token_hash, created_at DESC);
