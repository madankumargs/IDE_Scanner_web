CREATE TABLE IF NOT EXISTS app_team_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES app_teams(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_by TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_team_invitations_team_idx ON app_team_invitations(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_team_invitations_pending_idx ON app_team_invitations(token_hash, accepted_at, expires_at);
