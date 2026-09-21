CREATE TABLE IF NOT EXISTS app_ai_usage (
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, feature)
);
