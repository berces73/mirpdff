-- ============================================================
-- migration-v22-missing-subsystems.sql
-- Newsletter + Referral + Web Push tabloları
-- Çalıştır: wrangler d1 execute mirpdf-db --file=d1/migration-v22-missing-subsystems.sql
-- ============================================================

-- ── Newsletter Aboneleri ──────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  status         TEXT    NOT NULL DEFAULT 'active'   CHECK(status IN ('active','unsubscribed','bounced')),
  source         TEXT    NOT NULL DEFAULT 'web',     -- 'footer', 'modal', 'blog', 'account'
  subscribed_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_email  ON newsletter_subscribers(email);

-- ── Referral Kodları ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL UNIQUE,
  code       TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code    ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id);

-- ── Referral Kullanım Geçmişi ────────────────────────────
CREATE TABLE IF NOT EXISTS referral_uses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id  TEXT    NOT NULL,
  referred_id  TEXT    NOT NULL UNIQUE,   -- her kullanıcı 1 kez kullanabilir
  code         TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending'  CHECK(status IN ('pending','rewarded','expired')),
  used_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  rewarded_at  TEXT,
  FOREIGN KEY(referrer_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(referred_id)  REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_uses_referrer  ON referral_uses(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referred  ON referral_uses(referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_status    ON referral_uses(status);

-- ── Web Push Subscription'ları ───────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_push_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_topic   ON push_subscriptions(topic);
