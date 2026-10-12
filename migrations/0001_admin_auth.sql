CREATE TABLE IF NOT EXISTS admin_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pin_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 1,
  recovery_hash TEXT
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
  ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_attempts (
  client_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
