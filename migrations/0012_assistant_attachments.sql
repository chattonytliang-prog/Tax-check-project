CREATE TABLE IF NOT EXISTS assistant_attachments (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  sections_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assistant_attachments_owner_thread
  ON assistant_attachments(owner_user_id, thread_id);

CREATE TRIGGER IF NOT EXISTS delete_assistant_thread_attachments
  AFTER DELETE ON assistant_threads
BEGIN
  DELETE FROM assistant_attachments WHERE thread_id = OLD.id AND owner_user_id = OLD.owner_user_id;
END;
