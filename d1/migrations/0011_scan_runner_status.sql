-- A runner heartbeat must be independent of scan completion. A healthy worker
-- can legitimately poll an empty queue for hours, and completion timestamps
-- would make that healthy worker look stale.
CREATE TABLE IF NOT EXISTS app_scan_runner_status (
  id TEXT PRIMARY KEY NOT NULL,
  runner_id TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_claimed_at TEXT,
  last_completed_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
