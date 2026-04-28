-- ============================================================
-- migration-v23-webhooks.sql
-- Kullanıcıya dışa webhook gönderme sistemi
-- Çalıştır: wrangler d1 execute mirpdf-db --file=d1/migration-v23-webhooks.sql --remote
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id                 TEXT    PRIMARY KEY,
  user_id            TEXT    NOT NULL,
  url                TEXT    NOT NULL,
  events             TEXT    NOT NULL DEFAULT '[]',   -- JSON array: ["job.completed","job.failed",…]
  secret             TEXT    NOT NULL,                -- HMAC-SHA256 imzalama secret'ı
  active             INTEGER NOT NULL DEFAULT 1,
  failure_count      INTEGER NOT NULL DEFAULT 0,
  last_triggered_at  TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wh_user_id ON webhook_endpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_wh_active  ON webhook_endpoints(active);
