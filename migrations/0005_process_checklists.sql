CREATE TABLE IF NOT EXISTS process_checklists (
  id TEXT PRIMARY KEY,
  machine TEXT NOT NULL CHECK (machine IN ('초지3', '초지4', '초지5')),
  checklist_date TEXT NOT NULL,
  source_name TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  readings_json TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL,
  UNIQUE(machine, checklist_date)
);

CREATE INDEX IF NOT EXISTS idx_process_checklists_machine_date
  ON process_checklists(machine, checklist_date DESC);
