-- migration-v19: jobs tablosu için eksik composite index
-- status='done' AND created_at >= ? sorgularını (admin dashboard, analytics) hızlandırır
-- _worker.js L336-339 ve admin.js L112 bu pattern'i kullanıyor

CREATE INDEX IF NOT EXISTS idx_jobs_status_created
  ON jobs(status, created_at DESC);

-- monitoring.js: WHERE status='pending' ve status='processing' AND updated_at < ?
-- idx_jobs_status_updated zaten mevcut (schema.sql L53), bu nedenle tekrar eklenmedi
