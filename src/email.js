/**
 * email.js — MirPDF E-posta Şablonları v2
 * Resend API üzerinden gönderim.
 *
 * Env:
 *   RESEND_API_KEY
 *   EMAIL_FROM   (örn. "MirPDF <no-reply@mirpdf.com>")
 *   APP_ORIGIN   (örn. "https://mirpdf.com")
 */

// ─── Gönderim ────────────────────────────────────────────────────────────────

export async function sendEmail(env, { to, subject, html }) {
  const key  = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!key || !from) return { ok: false, skipped: true, reason: "EMAIL_NOT_CONFIGURED" };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    return { ok: false, reason: `RESEND_${resp.status}`, detail: txt.slice(0, 200) };
  }
  return { ok: true };
}

// ─── Ortak Şablon Bileşenleri ────────────────────────────────────────────────

function emailWrapper(content) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MirPDF</title>
</head>
<body style="margin:0;padding:0;background:#f7f8fc;font-family:'Segoe UI',Arial,sans-serif;color:#0d0f1a">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fc;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e3e6f0;overflow:hidden">
        <!-- Header -->
        <tr>
          <td style="background:#0d0f1a;padding:20px 28px">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:32px;height:32px;background:#ffffff;border-radius:8px;text-align:center;vertical-align:middle;font-size:16px">📄</td>
                <td style="padding-left:10px;color:#ffffff;font-weight:800;font-size:18px;letter-spacing:-0.3px">MirPDF</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Content -->
        <tr>
          <td style="padding:32px 28px">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f7f8fc;border-top:1px solid #e3e6f0;padding:16px 28px;text-align:center">
            <p style="margin:0;font-size:12px;color:#94a3b8">
              MirPDF · <a href="https://mirpdf.com" style="color:#6366f1;text-decoration:none">mirpdf.com</a> · 
              <a href="https://mirpdf.com/legal/kvkk.html" style="color:#94a3b8;text-decoration:none">KVKK</a> · 
              <a href="https://mirpdf.com/legal/privacy.html" style="color:#94a3b8;text-decoration:none">Gizlilik</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function primaryButton(url, label) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0">
    <tr>
      <td style="background:#0d0f1a;border-radius:10px">
        <a href="${url}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;letter-spacing:-0.2px">${label}</a>
      </td>
    </tr>
  </table>`;
}

function fallbackLink(url) {
  return `<p style="margin:16px 0 0;font-size:12px;color:#94a3b8">Butona tıklayamıyorsan bu linki tarayıcına kopyala:<br>
    <a href="${url}" style="color:#6366f1;word-break:break-all;font-size:12px">${url}</a>
  </p>`;
}

function featureRow(icon, title, desc) {
  return `<tr>
    <td style="padding:8px 0;vertical-align:top">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="width:36px;vertical-align:top;padding-top:2px">
            <div style="width:28px;height:28px;background:#f0fdf4;border-radius:8px;text-align:center;line-height:28px;font-size:14px">${icon}</div>
          </td>
          <td style="padding-left:10px;vertical-align:top">
            <div style="font-weight:700;font-size:14px;color:#0d0f1a">${title}</div>
            <div style="font-size:13px;color:#64748b;margin-top:2px">${desc}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ─── 1. E-posta Doğrulama ────────────────────────────────────────────────────

export function verifyEmailHtml(origin, token) {
  const url = `${origin}/account/verify?token=${encodeURIComponent(token)}`;
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.3px">E-posta adresini doğrula</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#64748b;line-height:1.6">Hesabını aktifleştirmek için aşağıdaki butona tıkla.</p>
    <p style="margin:0;font-size:13px;color:#94a3b8">Bu bağlantı <strong>24 saat</strong> geçerlidir.</p>
    ${primaryButton(url, "E-postayı Doğrula →")}
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin:8px 0">
      <p style="margin:0;font-size:13px;color:#15803d">
        ✓ Doğrulamadan sonra <strong>5 ücretsiz kredi</strong> hesabına yüklenir.
      </p>
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8">Bu e-postayı beklemiyorsan güvenle yok sayabilirsin.</p>
    ${fallbackLink(url)}
  `);
}

// ─── 1b. E-posta Değişikliği Doğrulama ───────────────────────────────────────

export function verifyEmailChangeHtml(origin, token) {
  const url = `${origin}/account/verify?token=${encodeURIComponent(token)}&change=1`;
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.3px">Yeni e-postanı doğrula</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#64748b;line-height:1.6">E-posta adres değişikliğini onaylamak için aşağıdaki butona tıkla.</p>
    <p style="margin:0;font-size:13px;color:#94a3b8">Bu bağlantı <strong>24 saat</strong> geçerlidir.</p>
    ${primaryButton(url, "E-posta Değişikliğini Onayla →")}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8">Bu isteği sen yapmadıysan hesabının şifresini hemen değiştir.</p>
    ${fallbackLink(url)}
  `);
}

// ─── 2. Şifre Sıfırlama ──────────────────────────────────────────────────────

export function resetPasswordHtml(origin, token) {
  const url = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.3px">Şifre sıfırlama isteği</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#64748b;line-height:1.6">MirPDF hesabın için şifre sıfırlama talebinde bulunuldu.</p>
    <p style="margin:0;font-size:13px;color:#94a3b8">Bu bağlantı <strong>1 saat</strong> geçerlidir.</p>
    ${primaryButton(url, "Şifremi Sıfırla →")}
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:8px 0">
      <p style="margin:0;font-size:13px;color:#b91c1c">
        🔒 Bu isteği sen yapmadıysan hesabın güvende — bu e-postayı yok sayabilirsin.
      </p>
    </div>
    ${fallbackLink(url)}
  `);
}

// ─── 3. Hoş Geldin ───────────────────────────────────────────────────────────

export function welcomeHtml(origin, { firstName } = {}) {
  const name = firstName ? `, ${firstName}` : "";
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.3px">Hoş geldin${name}! 🎉</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6">
      MirPDF hesabın aktif. Hemen başlamak için aşağıdaki araçları kullanabilirsin — kayıt gerekmez, ücretsiz.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      ${featureRow("🗜️", "PDF Sıkıştır", "E-devlet için 2MB altına indir, kalite korunur")}
      ${featureRow("📎", "PDF Birleştir", "Birden fazla belgeyi tek dosyada topla")}
      ${featureRow("📝", "PDF → Word", "Düzenlenebilir Word dosyasına çevir (OCR dahil)")}
      ${featureRow("🔍", "OCR — Türkçe", "Taranmış PDF'den metin çıkar, ş/ğ/ı destekli")}
    </table>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;margin-bottom:24px">
      <p style="margin:0;font-size:14px;color:#1d4ed8;font-weight:600">
        ⚡ Hesabında <strong>5 ücretsiz kredi</strong> var.
      </p>
      <p style="margin:6px 0 0;font-size:13px;color:#3b82f6">
        OCR, Sıkıştır ve PDF→Word işlemleri kredi kullanır. Diğer tüm araçlar tamamen ücretsiz.
      </p>
    </div>

    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#0d0f1a;border-radius:10px">
          <a href="${origin}/#tools" style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none">Araçları Keşfet →</a>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;border-top:1px solid #e3e6f0;padding-top:16px">
      Sorun yaşarsan <a href="${origin}/contact" style="color:#6366f1;text-decoration:none">destek@mirpdf.com</a> adresine yazabilirsin. Ortalama yanıt süresi 24 saattir.
    </p>
  `);
}

// ─── 4. Ödeme Onayı (Kredi Paketi) ──────────────────────────────────────────

export function paymentSuccessHtml(origin, { credits, planName, amount } = {}) {
  return emailWrapper(`
    <div style="text-align:center;margin-bottom:24px">
      <div style="width:60px;height:60px;background:#d1fae5;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;line-height:60px">✓</div>
      <h2 style="margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-0.3px">Ödeme alındı!</h2>
      <p style="margin:0;font-size:15px;color:#64748b">Teşekkürler. Kredilerin hesabına eklendi.</p>
    </div>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center">
      <div style="font-size:36px;font-weight:800;color:#15803d;letter-spacing:-1px">${credits || "100"}</div>
      <div style="font-size:14px;color:#64748b;margin-top:4px">kredi hesabına yüklendi</div>
      ${planName ? `<div style="font-size:13px;color:#94a3b8;margin-top:4px">${planName}${amount ? ` · ${amount}` : ""}</div>` : ""}
    </div>

    <p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.6">
      Her kredi bir OCR, Sıkıştır veya PDF→Word işlemi için kullanılır. Diğer araçlar (Birleştir, Böl, Döndür vb.) kredisiz ve sınırsız.
    </p>

    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#0d0f1a;border-radius:10px">
          <a href="${origin}/#tools" style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none">Araçları Kullan →</a>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;border-top:1px solid #e3e6f0;padding-top:16px">
      Fatura ve işlem geçmişin için <a href="${origin}/account" style="color:#6366f1;text-decoration:none">Hesabım</a> sayfasını ziyaret edebilirsin.
      Sorun yaşarsan <a href="mailto:destek@mirpdf.com" style="color:#6366f1;text-decoration:none">destek@mirpdf.com</a> adresine yaz.
    </p>
  `);
}

// ─── 5. Pro Abonelik Onayı ───────────────────────────────────────────────────

export function proWelcomeHtml(origin, { monthlyCredits, planName } = {}) {
  return emailWrapper(`
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:40px;margin-bottom:8px">⭐</div>
      <h2 style="margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-0.3px">Pro planına hoş geldin!</h2>
      <p style="margin:0;font-size:15px;color:#64748b">${planName || "MirPDF Pro"} aboneliğin aktif.</p>
    </div>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin-bottom:24px">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${featureRow("∞", "Sınırsız kullanım", "Günlük kota yok, istediğin kadar işle")}
        ${featureRow("⚡", `${monthlyCredits || 5000} kredi/ay`, "OCR, Sıkıştır ve PDF→Word için aylık kredi")}
        ${featureRow("🚀", "Öncelikli kuyruk", "Yoğun saatlerde daha hızlı işlem")}
        ${featureRow("📦", "Toplu dönüştürme", "10 dosyayı aynı anda işle, ZIP olarak indir")}
        ${featureRow("🚫", "Reklamsız", "Kesintisiz, temiz arayüz")}
      </table>
    </div>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="background:#0d0f1a;border-radius:10px">
          <a href="${origin}/#tools" style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none">Pro Araçlarını Kullan →</a>
        </td>
      </tr>
    </table>

    <div style="background:#f7f8fc;border:1px solid #e3e6f0;border-radius:10px;padding:14px 16px;font-size:13px;color:#64748b;line-height:1.6">
      <strong style="color:#0d0f1a">İptal:</strong> İstediğin zaman, ek ücret olmadan iptal edebilirsin. 
      <a href="${origin}/account" style="color:#6366f1;text-decoration:none">Hesabım → Aboneliği Yönet</a> bölümünden yapabilirsin.<br><br>
      <strong style="color:#0d0f1a">Fatura:</strong> Stripe üzerinden her ay otomatik kesilir. Fatura e-posta adresine ayrıca gönderilir.
    </div>

    <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;border-top:1px solid #e3e6f0;padding-top:16px">
      Sorun yaşarsan <a href="mailto:destek@mirpdf.com" style="color:#6366f1;text-decoration:none">destek@mirpdf.com</a> adresine yaz. Ortalama yanıt: 12 saat.
    </p>
  `);
}

// ─── 6. Abonelik İptali ──────────────────────────────────────────────────────

export function subscriptionCancelledHtml(origin, { periodEnd } = {}) {
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.3px">Pro aboneliğin iptal edildi</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6">
      Pro aboneliğin iptal edildi.${periodEnd ? ` <strong style="color:#0d0f1a">${periodEnd}</strong> tarihine kadar Pro özelliklerini kullanmaya devam edebilirsin.` : ""}
    </p>

    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-bottom:24px">
      <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6">
        💡 Tekrar Pro'ya geçmek istersen <a href="${origin}/pricing" style="color:#92400e;font-weight:700">mirpdf.com/pricing</a> adresini ziyaret edebilirsin. Önceki verilerini ve kredi geçmişini koruyoruz.
      </p>
    </div>

    <p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.6">
      Ücretsiz plan ile birleştirme, bölme, döndürme gibi tüm tarayıcı tabanlı araçları kullanmaya devam edebilirsin.
    </p>

    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#f7f8fc;border:1.5px solid #e3e6f0;border-radius:10px">
          <a href="${origin}/pricing" style="display:inline-block;padding:13px 28px;color:#0d0f1a;font-weight:700;font-size:15px;text-decoration:none">Planları İncele →</a>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;border-top:1px solid #e3e6f0;padding-top:16px">
      İptal hatalıysa veya sorun yaşıyorsan <a href="mailto:destek@mirpdf.com" style="color:#6366f1;text-decoration:none">destek@mirpdf.com</a> adresine yaz.
    </p>
  `);
}

// ─── 7. Kredi Bitmek Üzere ───────────────────────────────────────────────────

export function lowCreditsHtml(origin, { remaining } = {}) {
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.3px">Kredin azaldı ⚡</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6">
      Hesabında yalnızca <strong style="color:#0d0f1a">${remaining || 1} kredi</strong> kaldı. OCR, PDF sıkıştırma ve PDF→Word işlemleri için kredi gerekiyor.
    </p>

    <div style="background:#f7f8fc;border:1px solid #e3e6f0;border-radius:12px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0d0f1a">Seçeneklerin:</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e3e6f0">
            <strong style="font-size:14px;color:#0d0f1a">Kredi Paketi</strong>
            <div style="font-size:13px;color:#64748b;margin-top:2px">100 kredi ₺29 · 500 kredi ₺99</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0">
            <strong style="font-size:14px;color:#6366f1">Pro Plan ⭐</strong>
            <div style="font-size:13px;color:#64748b;margin-top:2px">Aylık 5.000 kredi + sınırsız kullanım · ₺79/ay</div>
          </td>
        </tr>
      </table>
    </div>

    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#0d0f1a;border-radius:10px">
          <a href="${origin}/pricing" style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none">Kredi Al veya Pro'ya Geç →</a>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;border-top:1px solid #e3e6f0;padding-top:16px">
      Birleştir, böl, döndür gibi tarayıcı tabanlı araçlar her zaman ücretsizdir, kredi gerektirmez.
    </p>
  `);
}

// ─── 8. Şifre Değişikliği Güvenlik Bildirimi ────────────────────────────────

export function passwordChangedHtml(origin) {
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.3px">Şifreniz değiştirildi</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.6">
      MirPDF hesabınızın şifresi az önce başarıyla güncellendi.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin-bottom:24px">
      <p style="margin:0;font-size:13px;color:#b91c1c;line-height:1.6">
        🔒 <strong>Bu işlemi siz yapmadıysanız</strong> hesabınız tehlikede olabilir.
        Hemen <a href="${origin}/forgot-password" style="color:#b91c1c;font-weight:700">şifrenizi sıfırlayın</a>
        ve bize <a href="${origin}/contact" style="color:#b91c1c;font-weight:700">bildirin</a>.
      </p>
    </div>
    <p style="margin:0;font-size:13px;color:#94a3b8">
      Bu işlemi siz yaptıysanız güvende olduğunuzu bilmeniz yeterlidir.
    </p>
  `);
}

// ─── 9. Magic Link ────────────────────────────────────────────────────────────

export function magicLinkHtml(origin, token) {
  const url = `${origin}/magic-link.html?token=${encodeURIComponent(token)}`;
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.3px">Giriş bağlantınız hazır</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#64748b;line-height:1.6">
      Aşağıdaki butona tıklayarak MirPDF'e giriş yapın.
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#94a3b8">
      Bu bağlantı <strong>15 dakika</strong> geçerlidir ve yalnızca bir kez kullanılabilir.
    </p>
    ${primaryButton(url, "MirPDF'e Giriş Yap →")}
    <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin:8px 0">
      <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6">
        🔒 Bu e-postayı siz talep etmediyseniz güvenle yok sayabilirsiniz. Hesabınız güvende.
      </p>
    </div>
    ${fallbackLink(url)}
  `);
}
