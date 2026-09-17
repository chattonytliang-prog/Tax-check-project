CREATE TABLE IF NOT EXISTS point_wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO point_wallets (user_id)
SELECT id FROM users;

CREATE TRIGGER IF NOT EXISTS point_wallets_new_user
AFTER INSERT ON users
BEGIN
  INSERT INTO point_wallets (user_id) VALUES (NEW.id);
END;

CREATE TABLE IF NOT EXISTS report_entitlements (
  report_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('legacy', 'free', 'paid', 'admin')),
  cost_points INTEGER NOT NULL CHECK (cost_points IN (0, 200)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_entitlements_user_id
ON report_entitlements(user_id);

-- Existing reports have already consumed the account's first free report.
INSERT OR IGNORE INTO report_entitlements (report_id, user_id, kind, cost_points, created_at)
SELECT reports.id, reports.owner_user_id, 'legacy', 0, reports.created_at
FROM reports JOIN users ON users.id = reports.owner_user_id;

CREATE TABLE IF NOT EXISTS point_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('report', 'admin_adjustment')),
  report_id TEXT,
  actor_user_id TEXT REFERENCES users(id),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (source = 'report' AND delta = -200 AND report_id IS NOT NULL AND actor_user_id IS NULL)
    OR (source = 'admin_adjustment' AND delta != 0 AND report_id IS NULL AND actor_user_id IS NOT NULL AND length(trim(note)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_created
ON point_transactions(user_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS point_transactions_validate
BEFORE INSERT ON point_transactions
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM point_wallets WHERE user_id = NEW.user_id)
    THEN RAISE(ABORT, 'point_wallet_missing')
  END;
  SELECT CASE
    WHEN NEW.source = 'admin_adjustment'
      AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.actor_user_id AND role = 'admin')
    THEN RAISE(ABORT, 'admin_required')
  END;
  SELECT CASE
    WHEN COALESCE((SELECT balance FROM point_wallets WHERE user_id = NEW.user_id), -1) + NEW.delta < 0
    THEN RAISE(ABORT, 'insufficient_points')
  END;
END;

CREATE TRIGGER IF NOT EXISTS point_transactions_apply
AFTER INSERT ON point_transactions
BEGIN
  UPDATE point_wallets
  SET balance = balance + NEW.delta, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS report_entitlements_validate
BEFORE INSERT ON report_entitlements
BEGIN
  SELECT CASE
    WHEN NEW.kind = 'legacy'
      OR (NEW.kind = 'admin' AND (NEW.cost_points != 0 OR (SELECT role FROM users WHERE id = NEW.user_id) != 'admin'))
      OR (NEW.kind = 'free' AND (NEW.cost_points != 0 OR (SELECT role FROM users WHERE id = NEW.user_id) = 'admin'
        OR EXISTS (SELECT 1 FROM report_entitlements WHERE user_id = NEW.user_id)))
      OR (NEW.kind = 'paid' AND (NEW.cost_points != 200 OR (SELECT role FROM users WHERE id = NEW.user_id) = 'admin'
        OR NOT EXISTS (SELECT 1 FROM report_entitlements WHERE user_id = NEW.user_id)))
    THEN RAISE(ABORT, 'invalid_report_entitlement')
  END;
END;

CREATE TRIGGER IF NOT EXISTS report_entitlements_charge
AFTER INSERT ON report_entitlements
WHEN NEW.kind = 'paid'
BEGIN
  INSERT INTO point_transactions (id, user_id, delta, source, report_id, note)
  VALUES (lower(hex(randomblob(16))), NEW.user_id, -200, 'report', NEW.report_id, '生成报告');
END;
