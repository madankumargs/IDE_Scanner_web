CREATE TABLE IF NOT EXISTS feedback_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('bug', 'suggestion', 'report_clarity', 'other')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 3 AND 4000),
  contact_email TEXT,
  page_path TEXT NOT NULL DEFAULT '',
  requester_hash TEXT NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  email_error TEXT,
  emailed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_submissions_requester_created
  ON feedback_submissions(requester_hash, created_at DESC);
