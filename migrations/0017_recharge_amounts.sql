-- Extend both existing order schemas without firing credit triggers on history.
-- A user can have one pending standard order and one pending Test2 order per channel.
CREATE TABLE wechat_orders_amounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  appid TEXT NOT NULL,
  mchid TEXT NOT NULL,
  amount_fen INTEGER NOT NULL,
  points INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','expired','paid')),
  code_url TEXT,
  transaction_id TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, request_id),
  CHECK ((points = 1 OR points BETWEEN 200 AND 1000) AND typeof(points) = 'integer' AND amount_fen = points * 100)
);
CREATE TABLE wechat_recharges_amounts (
  order_id TEXT PRIMARY KEY REFERENCES wechat_orders_amounts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL CHECK (typeof(points) = 'integer' AND (points = 1 OR points BETWEEN 200 AND 1000)),
  transaction_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO wechat_orders_amounts
  SELECT id,user_id,request_id,appid,mchid,amount_fen,points,status,code_url,transaction_id,expires_at,paid_at,created_at FROM wechat_orders;
INSERT INTO wechat_recharges_amounts
  SELECT order_id,user_id,points,transaction_id,created_at FROM wechat_recharges;
DROP TABLE wechat_recharges;
DROP TABLE wechat_orders;
ALTER TABLE wechat_orders_amounts RENAME TO wechat_orders;
ALTER TABLE wechat_recharges_amounts RENAME TO wechat_recharges;
CREATE INDEX idx_wechat_orders_user ON wechat_orders(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_wechat_orders_active ON wechat_orders(user_id, amount_fen) WHERE status = 'pending';
CREATE UNIQUE INDEX idx_wechat_orders_standard_active ON wechat_orders(user_id) WHERE status = 'pending' AND amount_fen >= 20000;
CREATE TRIGGER wechat_orders_immutable BEFORE UPDATE ON wechat_orders
WHEN NEW.id != OLD.id OR NEW.user_id != OLD.user_id OR NEW.request_id != OLD.request_id
  OR NEW.appid != OLD.appid OR NEW.mchid != OLD.mchid OR NEW.amount_fen != OLD.amount_fen OR NEW.points != OLD.points
  OR (OLD.status = 'paid' AND (NEW.status != 'paid' OR NEW.transaction_id IS NOT OLD.transaction_id))
BEGIN
  SELECT RAISE(ABORT, 'immutable_payment_order');
END;
CREATE TRIGGER wechat_orders_credit AFTER UPDATE OF status ON wechat_orders
WHEN OLD.status != 'paid' AND NEW.status = 'paid'
BEGIN
  SELECT CASE WHEN NEW.transaction_id IS NULL OR NEW.paid_at IS NULL
    OR NOT EXISTS (SELECT 1 FROM point_wallets WHERE user_id = NEW.user_id)
    THEN RAISE(ABORT, 'invalid_payment_credit') END;
  INSERT INTO wechat_recharges (order_id,user_id,points,transaction_id)
  VALUES (NEW.id,NEW.user_id,NEW.points,NEW.transaction_id);
  UPDATE point_wallets SET balance = balance + NEW.points, updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;

CREATE TABLE alipay_orders_amounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  amount_fen INTEGER NOT NULL,
  points INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','expired','paid')),
  trade_no TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, request_id),
  CHECK ((points = 1 OR points BETWEEN 200 AND 1000) AND typeof(points) = 'integer' AND amount_fen = points * 100)
);
CREATE TABLE alipay_recharges_amounts (
  order_id TEXT PRIMARY KEY REFERENCES alipay_orders_amounts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL CHECK (typeof(points) = 'integer' AND (points = 1 OR points BETWEEN 200 AND 1000)),
  trade_no TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO alipay_orders_amounts
  SELECT id,user_id,request_id,app_id,seller_id,amount_fen,points,status,trade_no,expires_at,paid_at,created_at FROM alipay_orders;
INSERT INTO alipay_recharges_amounts
  SELECT order_id,user_id,points,trade_no,created_at FROM alipay_recharges;
DROP TABLE alipay_recharges;
DROP TABLE alipay_orders;
ALTER TABLE alipay_orders_amounts RENAME TO alipay_orders;
ALTER TABLE alipay_recharges_amounts RENAME TO alipay_recharges;
CREATE UNIQUE INDEX idx_alipay_orders_active ON alipay_orders(user_id, amount_fen) WHERE status = 'pending';
CREATE UNIQUE INDEX idx_alipay_orders_standard_active ON alipay_orders(user_id) WHERE status = 'pending' AND amount_fen >= 20000;
CREATE INDEX idx_alipay_recharges_user ON alipay_recharges(user_id, created_at DESC);
CREATE TRIGGER alipay_orders_immutable BEFORE UPDATE ON alipay_orders
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.request_id IS NOT OLD.request_id
  OR NEW.app_id IS NOT OLD.app_id OR NEW.seller_id IS NOT OLD.seller_id
  OR NEW.amount_fen IS NOT OLD.amount_fen OR NEW.points IS NOT OLD.points OR NEW.expires_at IS NOT OLD.expires_at
  OR (OLD.status = 'paid' AND (NEW.status IS NOT OLD.status OR NEW.trade_no IS NOT OLD.trade_no OR NEW.paid_at IS NOT OLD.paid_at))
BEGIN
  SELECT RAISE(ABORT, 'immutable_alipay_order');
END;
CREATE TRIGGER alipay_orders_credit AFTER UPDATE OF status ON alipay_orders
WHEN OLD.status != 'paid' AND NEW.status = 'paid'
BEGIN
  SELECT CASE WHEN NEW.trade_no IS NULL OR NEW.paid_at IS NULL
    OR NOT EXISTS (SELECT 1 FROM point_wallets WHERE user_id = NEW.user_id)
    THEN RAISE(ABORT, 'invalid_alipay_credit') END;
  INSERT INTO alipay_recharges (order_id,user_id,points,trade_no)
  VALUES (NEW.id,NEW.user_id,NEW.points,NEW.trade_no);
  UPDATE point_wallets SET balance = balance + NEW.points, updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;
