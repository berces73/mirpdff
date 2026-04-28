# ⛔ ARŞİV — DEPLOY EDİLMEZ

Bu klasör **arşivlenmiş** eski frontend taslağıdır.

## Deploy edilen kaynak: `public/`

- **Tüm düzenlemeleri `public/` altında yapın**
- Bu klasördeki dosyalar **hiçbir zaman deploy edilmez**
- `public/articles/` ← blog içerikleri buradadır
- `public/tools/` ← tool sayfaları buradadır

### Neden bu klasör hâlâ duruyor?
Eski referans için saklandı. İleride tamamen silinebilir.

---
# ⚠️ ÖNEMLI: Bu klasör artık aktif kaynak değil

**Deploy edilen kaynak: `public/` klasörü**

Bu `frontend/` klasörü eski/taslak halindedir ve aktif olarak güncellenmemektedir.

- Tüm HTML, CSS ve JS değişikliklerini `public/` altında yapın
- Bu klasördeki dosyalar deploy edilmez
- SEO/head değişiklikleri için `public/tools/`, `public/articles/` vb. kullanın

---
# /frontend — ARŞİV / KULLANILMIYOR

Bu klasör eski bir gelişim aşamasından kalmıştır.

**Deploy edilen klasör: `/public/`**
`wrangler.toml` → `pages_build_output_dir = "public"`

Bu dizindeki dosyalar production'a yansımaz.
