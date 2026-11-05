CREATE TABLE IF NOT EXISTS assistant_artifacts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assistant_artifacts_thread
  ON assistant_artifacts(owner_user_id, thread_id, created_at);

CREATE TRIGGER IF NOT EXISTS delete_assistant_thread_artifacts
  AFTER DELETE ON assistant_threads
BEGIN
  DELETE FROM assistant_artifacts WHERE thread_id = OLD.id AND owner_user_id = OLD.owner_user_id;
END;
