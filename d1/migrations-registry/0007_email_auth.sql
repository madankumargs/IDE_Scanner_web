CREATE TABLE IF NOT EXISTS app_email_auth_codes (
  email TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
