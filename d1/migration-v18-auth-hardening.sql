-- migration-v18-auth-hardening.sql
-- Hesap kilitleme, ad/soyad ve şifre sıfırlama bildirimi için

-- 1. users tablosuna hesap kilitleme sütunları ekle
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until INTEGER;            -- epoch ms, NULL = kilitli değil
ALTER TABLE users ADD COLUMN last_failed_login INTEGER;       -- son başarısız giriş zamanı

-- 2. users tablosuna ad/soyad ekle
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;

-- 3. İndeks: kilitli hesapları hızlı sorgula
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;
