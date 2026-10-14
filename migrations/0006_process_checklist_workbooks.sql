CREATE TABLE IF NOT EXISTS process_checklist_reports (
  id TEXT PRIMARY KEY,
  machine TEXT NOT NULL CHECK (machine IN ('초지3', '초지4', '초지5')),
  period TEXT NOT NULL,
  original_name TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sheet_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  blank_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL
);

ALTER TABLE process_checklists ADD COLUMN period TEXT;
ALTER TABLE process_checklists ADD COLUMN source_sheet TEXT;
ALTER TABLE process_checklists ADD COLUMN raw_sheet_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE process_checklists ADD COLUMN report_id TEXT;

CREATE INDEX IF NOT EXISTS idx_process_checklist_reports_period
  ON process_checklist_reports(machine, period DESC, uploaded_at DESC);
