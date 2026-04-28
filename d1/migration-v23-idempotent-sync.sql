-- ============================================================
-- migration-v23-idempotent-sync.sql
-- Mevcut production DB'yi master schema ile senkronize eder.
-- Her komut idempotent (IF NOT EXISTS / IF COLUMN EXISTS yok
-- diye ALTER TABLE güvenle çalışır, var olan DB'yi bozmaz).
--
-- Çalıştır:
--   wrangler d1 execute mirpdf-db \
--     --file=d1/migration-v23-idempotent-sync.sql \
--     --remote --config wrangler.worker.toml
-- ============================================================

-- 1. users — yeni kolonlar (varsa hata vermez, yoksa ekler)
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name             TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until          INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login     INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at            INTEGER NOT NULL DEFAULT 0;

-- index
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe       ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;

-- 2. transactions — ek index
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_time ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_created   ON transactions(user_id, created_at DESC);

-- 3. jobs — expires_at ve credits_deducted
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS credits_deducted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expires_at       INTEGER NOT NULL DEFAULT (unixepoch() + 3600);

CREATE INDEX IF NOT EXISTS idx_jobs_client               ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status               ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_expires              ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_client_created       ON jobs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_updated       ON jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created       ON jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_client_batch_created ON jobs(client_id, batch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_client_status_updated ON jobs(client_id, status, updated_at);

-- 4. email_tokens — email kolonu (migration-v21'de eklenmişti, idempotent)
ALTER TABLE email_tokens ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_exp  ON email_tokens(expires_at);

-- 5. password_resets — email kolonu
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_pwreset_exp  ON password_resets(expires_at);

-- 6. refresh_tokens — UNIQUE index
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user        ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_exp         ON refresh_tokens(expires_at);

-- 7. api_keys tablosu (migration-v17'de oluşturulduysa idempotent)
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL,
  key_hash     TEXT    NOT NULL UNIQUE,
  key_prefix   TEXT    NOT NULL,
  name         TEXT    NOT NULL DEFAULT '',
  plan         TEXT    NOT NULL DEFAULT 'free',
  calls_month  INTEGER NOT NULL DEFAULT 0,
  calls_limit  INTEGER NOT NULL DEFAULT 500,
  last_used_at INTEGER,
  created_at   INTEGER NOT NULL,
  revoked_at   INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user   ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- 8. seo_pages
CREATE TABLE IF NOT EXISTS seo_pages (
  id           TEXT  PRIMARY KEY,
  slug         TEXT  UNIQUE NOT NULL,
  title        TEXT  NOT NULL,
  description  TEXT,
  h1           TEXT,
  content      TEXT  NOT NULL,
  tool_name    TEXT,
  keyword      TEXT,
  schema_json  TEXT,
  last_updated TEXT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seo_pages_updated ON seo_pages(last_updated DESC);

-- 9. analytics_events ek indexler
CREATE INDEX IF NOT EXISTS idx_analytics_client_event_created ON analytics_events(client_id, event, created_at);

-- 10. monitoring_events
CREATE TABLE IF NOT EXISTS monitoring_events (
  id         TEXT  PRIMARY KEY,
  kind       TEXT  NOT NULL,
  severity   TEXT  NOT NULL,
  message    TEXT  NOT NULL,
  metadata   TEXT,
  created_at TEXT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_created ON monitoring_events(created_at);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_kind    ON monitoring_events(kind);

-- 11. deletion_log
CREATE TABLE IF NOT EXISTS deletion_log (
  log_id     TEXT  PRIMARY KEY,
  job_id     TEXT,
  file_key   TEXT,
  bucket     TEXT,
  reason     TEXT  NOT NULL,
  metadata   TEXT,
  created_at TEXT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deletion_log_job     ON deletion_log(job_id);
CREATE INDEX IF NOT EXISTS idx_deletion_log_created ON deletion_log(created_at);

-- 12. newsletter_subscribers (migration-v22)
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  status         TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','unsubscribed','bounced')),
  source         TEXT    NOT NULL DEFAULT 'web',
  subscribed_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_email  ON newsletter_subscribers(email);

-- 13. referral_codes + referral_uses (migration-v22)
CREATE TABLE IF NOT EXISTS referral_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL UNIQUE,
  code       TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code    ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id);

CREATE TABLE IF NOT EXISTS referral_uses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id  TEXT    NOT NULL,
  referred_id  TEXT    NOT NULL UNIQUE,
  code         TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','rewarded','expired')),
  used_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  rewarded_at  TEXT,
  FOREIGN KEY(referrer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(referred_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referrer ON referral_uses(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referred ON referral_uses(referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_status   ON referral_uses(status);

-- 14. push_subscriptions (migration-v22)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint   TEXT    NOT NULL UNIQUE,
  p256dh     TEXT,
  auth_key   TEXT,
  user_id    TEXT,
  topic      TEXT    NOT NULL DEFAULT 'general',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user     ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_topic    ON push_subscriptions(topic);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
