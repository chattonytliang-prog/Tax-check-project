ALTER TABLE clients ADD COLUMN owner_user_id TEXT;
ALTER TABLE reports ADD COLUMN owner_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_owner_user_id ON clients(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_owner_user_id ON reports(owner_user_id);
