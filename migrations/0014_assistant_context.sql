CREATE TABLE IF NOT EXISTS assistant_context (
  owner_user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  covered_count INTEGER NOT NULL DEFAULT 0,
  prefix_hash TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  tool_receipts_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_user_id, thread_id)
);

CREATE TRIGGER IF NOT EXISTS delete_assistant_thread_context
  AFTER DELETE ON assistant_threads
BEGIN
  DELETE FROM assistant_context WHERE thread_id = OLD.id AND owner_user_id = OLD.owner_user_id;
END;
