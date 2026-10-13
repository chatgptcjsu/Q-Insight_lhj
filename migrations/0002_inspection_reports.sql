CREATE TABLE IF NOT EXISTS inspection_reports (
  id TEXT PRIMARY KEY,
  received_date TEXT NOT NULL,
  original_name TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  note TEXT,
  uploaded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inspection_reports_received_date
  ON inspection_reports(received_date DESC, uploaded_at DESC);
