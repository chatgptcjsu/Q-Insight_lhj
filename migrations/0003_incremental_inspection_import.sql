ALTER TABLE inspection_reports ADD COLUMN import_status TEXT NOT NULL DEFAULT 'archive_only';
ALTER TABLE inspection_reports ADD COLUMN imported_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inspection_reports ADD COLUMN duplicate_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inspection_reports ADD COLUMN conflict_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inspection_reports ADD COLUMN skipped_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inspection_reports ADD COLUMN processed_at TEXT;

CREATE TABLE IF NOT EXISTS inspection_records (
  record_key TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  machine TEXT NOT NULL,
  inspection_date TEXT NOT NULL,
  excel_row INTEGER NOT NULL,
  values_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (report_id) REFERENCES inspection_reports(id)
);

CREATE INDEX IF NOT EXISTS idx_inspection_records_machine_date
  ON inspection_records(machine, inspection_date DESC);
