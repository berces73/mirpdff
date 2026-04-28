-- ============================================================
-- MirPDF — D1 Master Schema  (tek yetkili kaynak)
-- Versiyon: v23 (tüm migration'lar birleştirildi)
--
-- Fresh deploy:
--   wrangler d1 execute mirpdf-db --file=d1/schema.sql --remote --config wrangler.worker.toml
--
-- Mevcut DB üzerinde:
--   Sırayla d1/migration-*.sql dosyalarını uygula (sadece eksik olanları)
--   veya d1/migration-v23-idempotent-sync.sql dosyasını çalıştır.
--
-- Tablo listesi (alfabetik):
--   analytics_events, api_keys, attribution_sessions, credits,
--   deletion_log, email_tokens, jobs, monitoring_events,
--   newsletter_subscribers, password_resets, processed_events,
--   push_subscriptions, referral_codes, referral_uses,
--   refresh_tokens, revenue_events, seo_pages, transactions,
--   users, webhook_failures
-- ============================================================

-- ── Users / Auth ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                     TEXT    PRIMARY KEY,
  email                  TEXT    UNIQUE NOT NULL,
  pass_salt              TEXT    NOT NULL,
  pass_hash              TEXT    NOT NULL,
  role                   TEXT    NOT NULL DEFAULT 'free',
  email_verified         INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id     TEXT,
  first_name             TEXT,
  last_name              TEXT,
  failed_login_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until           INTEGER,
  last_failed_login      INTEGER,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe       ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;

-- ── Credits ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credits (
  user_id    TEXT    PRIMARY KEY,
  balance    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Transactions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                TEXT    PRIMARY KEY,
  user_id           TEXT    NOT NULL,
  kind              TEXT    NOT NULL,
  amount            INTEGER NOT NULL,
  stripe_session_id TEXT,
  created_at        INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_time ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_created   ON transactions(user_id, created_at DESC);

-- ── Jobs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  job_id            TEXT    PRIMARY KEY,
  batch_id          TEXT,
  client_id         TEXT    NOT NULL,
  tool              TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'pending',
  input_key         TEXT,
  output_key        TEXT,
  output_bytes      INTEGER DEFAULT 0,
  error_message     TEXT,
  ttl_seconds       INTEGER NOT NULL DEFAULT 3600,
  cost              INTEGER NOT NULL DEFAULT 1,
  op_id             TEXT    UNIQUE,
  credits_deducted  INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL DEFAULT (unixepoch() + 3600)
);

CREATE INDEX IF NOT EXISTS idx_jobs_client               ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status               ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_expires              ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_batch_id             ON jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_jobs_client_batch         ON jobs(client_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_jobs_client_created       ON jobs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_updated       ON jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created       ON jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_client_batch_created ON jobs(client_id, batch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_client_status_updated ON jobs(client_id, status, updated_at);

-- ── Email Verification Tokens ─────────────────────────────────
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash  TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  email       TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_exp  ON email_tokens(expires_at);

-- ── Password Reset Tokens ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash  TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  email       TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_pwreset_exp  ON password_resets(expires_at);

-- ── Refresh Tokens ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  token_hash  TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  revoked_at  INTEGER,
  ip          TEXT,
  user_agent  TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user        ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_exp         ON refresh_tokens(expires_at);

-- ── API Keys ──────────────────────────────────────────────────
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

-- ── Stripe Webhook Idempotency ────────────────────────────────
CREATE TABLE IF NOT EXISTS processed_events (
  event_id    TEXT    PRIMARY KEY,
  event_type  TEXT    NOT NULL,
  received_at INTEGER NOT NULL,
  raw_sha256  TEXT
);

-- ── Stripe Webhook Failure Log ────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_failures (
  id         TEXT  PRIMARY KEY,
  event_id   TEXT,
  event_type TEXT,
  status     INTEGER,
  error      TEXT,
  created_at TEXT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_failures_created ON webhook_failures(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_type    ON webhook_failures(event_type);

-- ── Analytics Events ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id   TEXT  PRIMARY KEY,
  event      TEXT  NOT NULL,
  client_id  TEXT,
  user_id    TEXT,
  session_id TEXT,
  ip         TEXT,
  user_agent TEXT,
  tool       TEXT,
  job_id     TEXT,
  batch_id   TEXT,
  plan_type  TEXT,
  revenue    REAL,
  metadata   TEXT,
  created_at TEXT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_event                   ON analytics_events(event);
CREATE INDEX IF NOT EXISTS idx_events_client                  ON analytics_events(client_id);
CREATE INDEX IF NOT EXISTS idx_events_user                    ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_tool                    ON analytics_events(tool);
CREATE INDEX IF NOT EXISTS idx_events_created                 ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_event_created           ON analytics_events(event, created_at);
CREATE INDEX IF NOT EXISTS idx_events_tool_created            ON analytics_events(tool, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_client_event_created ON analytics_events(client_id, event, created_at);

-- ── Monitoring Events ─────────────────────────────────────────
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

-- ── KVKK/GDPR Deletion Log ────────────────────────────────────
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

-- ── Revenue Attribution ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS attribution_sessions (
  attribution_id TEXT    PRIMARY KEY,
  created_at     INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL,
  landing_path   TEXT,
  seo_slug       TEXT,
  keyword        TEXT,
  tool_name      TEXT,
  utm_source     TEXT,
  utm_medium     TEXT,
  utm_campaign   TEXT,
  utm_term       TEXT,
  utm_content    TEXT,
  referrer       TEXT,
  gclid          TEXT,
  fbclid         TEXT,
  msclkid        TEXT
);

CREATE INDEX IF NOT EXISTS idx_attr_seen    ON attribution_sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_attr_keyword ON attribution_sessions(keyword);

CREATE TABLE IF NOT EXISTS revenue_events (
  id               TEXT    PRIMARY KEY,
  created_at       INTEGER NOT NULL,
  kind             TEXT    NOT NULL,
  user_id          TEXT,
  stripe_object_id TEXT,
  attribution_id   TEXT,
  plan             TEXT,
  amount           INTEGER NOT NULL DEFAULT 0,
  currency         TEXT,
  keyword          TEXT,
  seo_slug         TEXT,
  tool_name        TEXT,
  utm_source       TEXT,
  utm_campaign     TEXT,
  utm_term         TEXT
);

CREATE INDEX IF NOT EXISTS idx_rev_created   ON revenue_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rev_keyword   ON revenue_events(keyword);
CREATE INDEX IF NOT EXISTS idx_rev_slug      ON revenue_events(seo_slug);
CREATE INDEX IF NOT EXISTS idx_rev_tool      ON revenue_events(tool_name);
CREATE INDEX IF NOT EXISTS idx_revenue_user  ON revenue_events(user_id);

-- ── Programmatic SEO Pages ────────────────────────────────────
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

-- ── Newsletter Subscribers ────────────────────────────────────
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

-- ── Referral Codes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL UNIQUE,
  code       TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code    ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id);

-- ── Referral Uses ─────────────────────────────────────────────
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

-- ── Web Push Subscriptions ────────────────────────────────────
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
