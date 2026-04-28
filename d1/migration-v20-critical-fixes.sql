-- migration-v20-critical-fixes.sql
-- Kritik bug düzeltmeleri (v12 → v13)
--
-- Bug 1: expires_at NOT NULL ama INSERT'te yoktu → DEFAULT ekle
-- Bug 2: output_bytes sütunu hiç yoktu → ekle
--
-- D1'de ALTER TABLE ADD COLUMN hata vermez (IF NOT EXISTS yok ama
-- sütun zaten varsa "duplicate column" hatası verir — IGNORE için try/catch ile uygula)

-- output_bytes: daha önce hiç eklenmemişti
ALTER TABLE jobs ADD COLUMN output_bytes INTEGER DEFAULT 0;

-- expires_at: mevcut kayıtlarda NULL olabilir, güncelle
UPDATE jobs SET expires_at = created_at + ttl_seconds WHERE expires_at IS NULL;
