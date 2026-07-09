CREATE TABLE IF NOT EXISTS assistant_cleaning_drafts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  thread_id TEXT,
  client_id TEXT,
  client_name TEXT,
  source_type TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assistant_cleaning_drafts_owner_updated
  ON assistant_cleaning_drafts(owner_user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_assistant_cleaning_drafts_client
  ON assistant_cleaning_drafts(client_id);

CREATE TABLE IF NOT EXISTS assistant_customer_memories (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT,
  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,
  source TEXT,
  confidence TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_customer_memories_unique
  ON assistant_customer_memories(owner_user_id, client_id, memory_key);

CREATE INDEX IF NOT EXISTS idx_assistant_customer_memories_owner_updated
  ON assistant_customer_memories(owner_user_id, updated_at);

CREATE TABLE IF NOT EXISTS assistant_import_audits (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  thread_id TEXT,
  client_id TEXT,
  client_name TEXT,
  action TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  source_material_ids TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assistant_import_audits_owner_created
  ON assistant_import_audits(owner_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assistant_import_audits_client
  ON assistant_import_audits(client_id);
