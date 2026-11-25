-- Copy both tables before replacing them. Historic paid orders must not fire the credit trigger again.
CREATE TABLE wechat_orders_next (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  appid TEXT NOT NULL,
  mchid TEXT NOT NULL,
  amount_fen INTEGER NOT NULL,
  points INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'expired', 'paid')),
  code_url TEXT,
  transaction_id TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, request_id),
  CHECK ((amount_fen = 20000 AND points = 200) OR (amount_fen = 100 AND points = 1))
);

CREATE TABLE wechat_recharges_next (
  order_id TEXT PRIMARY KEY REFERENCES wechat_orders_next(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL CHECK (points IN (200, 1)),
  transaction_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO wechat_orders_next
  (id, user_id, request_id, appid, mchid, amount_fen, points, status, code_url, transaction_id, expires_at, paid_at, created_at)
SELECT id, user_id, request_id, appid, mchid, amount_fen, points, status, code_url, transaction_id, expires_at, paid_at, created_at
FROM wechat_orders;

INSERT INTO wechat_recharges_next (order_id, user_id, points, transaction_id, created_at)
SELECT order_id, user_id, points, transaction_id, created_at FROM wechat_recharges;

DROP TABLE wechat_recharges;
DROP TABLE wechat_orders;
ALTER TABLE wechat_orders_next RENAME TO wechat_orders;
ALTER TABLE wechat_recharges_next RENAME TO wechat_recharges;

CREATE INDEX idx_wechat_orders_user ON wechat_orders(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_wechat_orders_active ON wechat_orders(user_id, amount_fen) WHERE status = 'pending';

CREATE TRIGGER wechat_orders_immutable
BEFORE UPDATE ON wechat_orders
WHEN NEW.id != OLD.id OR NEW.user_id != OLD.user_id OR NEW.request_id != OLD.request_id
  OR NEW.appid != OLD.appid OR NEW.mchid != OLD.mchid
  OR NEW.amount_fen != OLD.amount_fen OR NEW.points != OLD.points
  OR (OLD.status = 'paid' AND (NEW.status != 'paid' OR NEW.transaction_id IS NOT OLD.transaction_id))
BEGIN
  SELECT RAISE(ABORT, 'immutable_payment_order');
END;

CREATE TRIGGER wechat_orders_credit
AFTER UPDATE OF status ON wechat_orders
WHEN OLD.status != 'paid' AND NEW.status = 'paid'
BEGIN
  SELECT CASE WHEN NEW.transaction_id IS NULL OR NEW.paid_at IS NULL
    OR NOT EXISTS (SELECT 1 FROM point_wallets WHERE user_id = NEW.user_id)
    THEN RAISE(ABORT, 'invalid_payment_credit') END;
  INSERT INTO wechat_recharges (order_id, user_id, points, transaction_id)
  VALUES (NEW.id, NEW.user_id, NEW.points, NEW.transaction_id);
  UPDATE point_wallets SET balance = balance + NEW.points, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
