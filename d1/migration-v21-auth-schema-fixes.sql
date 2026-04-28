-- migration-v21-auth-schema-fixes.sql
-- Kritik auth schema düzeltmeleri
--
-- Bug 1: email_tokens tablosunda "email" sütunu yoktu
--         → Worker'daki INSERT OR REPLACE hata veriyordu
--         → Email doğrulama tamamen çalışmıyordu
--
-- Bug 2: password_resets tablosunda "email" sütunu yoktu
--         → Şifre sıfırlama INSERT hata veriyordu
--         → Şifre sıfırlama tamamen çalışmıyordu

-- email_tokens — email sütunu ekle
ALTER TABLE email_tokens ADD COLUMN email TEXT;

-- password_resets — email sütunu ekle
ALTER TABLE password_resets ADD COLUMN email TEXT;

-- NOT: Schema'da password_resets duplicate CREATE vardı (temizlendi)
-- Canlı DB'de bu sorun yoktur (IF NOT EXISTS korudu)
