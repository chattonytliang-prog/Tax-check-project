CREATE TABLE IF NOT EXISTS assistant_materials (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  thread_id TEXT,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  object_key TEXT,
  storage_status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assistant_materials_owner_created
  ON assistant_materials(owner_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assistant_materials_thread
  ON assistant_materials(thread_id);
