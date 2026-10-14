-- OAuth 2.1 state for the GuardRails MCP resource server. Tokens and
-- authorization codes are stored only as SHA-256 hashes.

CREATE TABLE IF NOT EXISTS app_oauth_clients (
  client_id TEXT PRIMARY KEY NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  redirect_uris_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES app_oauth_clients(client_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_oauth_codes_user_idx ON app_oauth_authorization_codes(user_id, expires_at);

CREATE TABLE IF NOT EXISTS app_oauth_access_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES app_oauth_clients(client_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_oauth_tokens_user_idx ON app_oauth_access_tokens(user_id, expires_at);
