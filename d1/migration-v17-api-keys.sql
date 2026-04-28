-- migration-v17-api-keys.sql
-- Self-serve API key yönetimi

CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,           -- uuid
  user_id     TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,       -- SHA-256(key) — düz key saklanmaz
  key_prefix  TEXT NOT NULL,              -- İlk 8 karakter, gösterim için (mp_live_ab12cd34)
  name        TEXT NOT NULL DEFAULT '',   -- Kullanıcının verdiği isim ("Muhasebe botu")
  plan        TEXT NOT NULL DEFAULT 'free', -- free | basic | pro
  calls_month INTEGER NOT NULL DEFAULT 0, -- Bu ay toplam çağrı
  calls_limit INTEGER NOT NULL DEFAULT 500, -- Aylık limit (plan bazlı)
  last_used_at INTEGER,
  created_at  INTEGER NOT NULL,
  revoked_at  INTEGER,                    -- NULL = aktif
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user    ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash    ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix  ON api_keys(key_prefix);

-- Kullanıcı başına max key sayısı uygulama katmanında kontrol edilir (5)
-- Aylık sayaç sıfırlama: CRON job (*/10 * * * * worker cron) ile ay başı reset
