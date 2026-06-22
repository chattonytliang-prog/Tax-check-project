CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  credit_code TEXT,
  region TEXT,
  industry TEXT,
  taxpayer_type TEXT,
  risk_level TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON clients(updated_at);
CREATE INDEX IF NOT EXISTS idx_clients_risk_level ON clients(risk_level);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  risk_level TEXT,
  content TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_client_id ON reports(client_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

CREATE TABLE IF NOT EXISTS risk_results (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  report_id TEXT,
  rule_code TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_risk_results_client_id ON risk_results(client_id);
CREATE INDEX IF NOT EXISTS idx_risk_results_report_id ON risk_results(report_id);

CREATE TABLE IF NOT EXISTS risk_rules (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tax_type TEXT,
  risk_level TEXT,
  basis TEXT,
  suggestion TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
