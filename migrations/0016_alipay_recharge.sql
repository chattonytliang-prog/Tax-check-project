CREATE TABLE IF NOT EXISTS alipay_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  amount_fen INTEGER NOT NULL,
  points INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'expired', 'paid')),
  trade_no TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, request_id),
  CHECK ((amount_fen = 20000 AND points = 200) OR (amount_fen = 100 AND points = 1))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alipay_orders_active ON alipay_orders(user_id, amount_fen) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS alipay_recharges (
  order_id TEXT PRIMARY KEY REFERENCES alipay_orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL CHECK (points IN (1, 200)),
  trade_no TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_alipay_recharges_user ON alipay_recharges(user_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS alipay_orders_immutable
BEFORE UPDATE ON alipay_orders
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.request_id IS NOT OLD.request_id
  OR NEW.app_id IS NOT OLD.app_id OR NEW.seller_id IS NOT OLD.seller_id
  OR NEW.amount_fen IS NOT OLD.amount_fen OR NEW.points IS NOT OLD.points OR NEW.expires_at IS NOT OLD.expires_at
  OR (OLD.status = 'paid' AND (NEW.status IS NOT OLD.status OR NEW.trade_no IS NOT OLD.trade_no OR NEW.paid_at IS NOT OLD.paid_at))
BEGIN
  SELECT RAISE(ABORT, 'immutable_alipay_order');
END;

CREATE TRIGGER IF NOT EXISTS alipay_orders_credit
AFTER UPDATE OF status ON alipay_orders
WHEN OLD.status != 'paid' AND NEW.status = 'paid'
BEGIN
  SELECT CASE WHEN NEW.trade_no IS NULL OR NEW.paid_at IS NULL
    OR NOT EXISTS (SELECT 1 FROM point_wallets WHERE user_id = NEW.user_id)
    THEN RAISE(ABORT, 'invalid_alipay_credit') END;
  INSERT INTO alipay_recharges (order_id, user_id, points, trade_no)
  VALUES (NEW.id, NEW.user_id, NEW.points, NEW.trade_no);
  UPDATE point_wallets SET balance = balance + NEW.points, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
