// ============================================================
// src/newsletter.js — /api/newsletter/* handlers
// POST /api/newsletter/subscribe   — e-posta listesine ekle
// GET  /api/newsletter/unsubscribe — token ile listeden çık
// POST /api/newsletter/unsubscribe — token ile listeden çık
// ============================================================

import { json, getIp, rateLimit } from "./helpers.js";
import { sendEmail } from "./email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── Basit token üret (kriptografik değil ama yeterli) ── */
async function makeToken(email, secret) {
  const data = new TextEncoder().encode(email + "|" + (secret || "mirpdf-nl"));
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/* ─────────────────────────────────────────────────────── */
export async function handleNewsletterSubscribe(request, env) {
  const ip = getIp(request);
  const rl = await rateLimit(env, `rl:nl:sub:${ip}`, 5, 3600);
  if (!rl.ok) return json({ ok: false, error: "RATE_LIMIT" }, 429, env);

  const body  = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const source = String(body?.source || "web").slice(0, 30); // "footer", "modal", "blog" etc.

  if (!EMAIL_RE.test(email))
    return json({ ok: false, error: "BAD_EMAIL", message: "Geçerli bir e-posta adresi girin." }, 400, env);

  /* Zaten kayıtlı mı? */
  const existing = await env.DB
    .prepare("SELECT id, status FROM newsletter_subscribers WHERE email = ?")
    .bind(email).first();

  if (existing) {
    if (existing.status === "active") {
      return json({ ok: true, already: true, message: "Bu adres zaten kayıtlı." }, 200, env);
    }
    /* unsubscribed ise tekrar aktifleştir */
    await env.DB
      .prepare("UPDATE newsletter_subscribers SET status='active', subscribed_at=CURRENT_TIMESTAMP, source=? WHERE email=?")
      .bind(source, email).run();
  } else {
    await env.DB
      .prepare("INSERT INTO newsletter_subscribers (email, status, source) VALUES (?, 'active', ?)")
      .bind(email, source).run();
  }

  /* Hoş geldin e-postası */
  const token = await makeToken(email, env.NEWSLETTER_SECRET);
  const unsubLink = `https://mirpdf.com/newsletter-unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;

  await sendEmail(env, {
    to: email,
    subject: "MirPDF bültenine hoş geldiniz! 🎉",
    html: `
<div style="font-family:'Figtree',sans-serif;max-width:600px;margin:0 auto;background:#f7f8fc;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:2rem;text-align:center">
    <h1 style="color:#fff;font-size:1.5rem;margin:0">Hoş Geldiniz! 🎉</h1>
  </div>
  <div style="padding:2rem">
    <p style="color:#374151;font-size:1rem;line-height:1.6">
      <strong>${email}</strong> adresiyle MirPDF bültenine abone oldunuz.
    </p>
    <p style="color:#6b7280;font-size:.9rem;line-height:1.6">
      PDF araçlarımız hakkındaki güncel haberler, ipuçları ve özel tekliflerden ilk siz haberdar olacaksınız.
    </p>
    <div style="text-align:center;margin:1.5rem 0">
      <a href="https://mirpdf.com" style="background:#6366f1;color:#fff;text-decoration:none;padding:.75rem 2rem;border-radius:12px;font-weight:700;display:inline-block">
        MirPDF'i Kullanmaya Başla →
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:1.5rem 0">
    <p style="color:#9ca3af;font-size:.78rem;text-align:center">
      Abonelikten çıkmak için <a href="${unsubLink}" style="color:#6366f1">buraya tıklayın</a>.
    </p>
  </div>
</div>`,
  }).catch(err => console.error("nl welcome email failed:", err));

  return json({ ok: true, message: "Abone oldunuz! Hoş geldin e-postası gönderildi." }, 201, env);
}

/* ─────────────────────────────────────────────────────── */
export async function handleNewsletterUnsubscribe(request, env) {
  const url   = new URL(request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = (url.searchParams.get("token") || "").trim();

  if (!EMAIL_RE.test(email) || !token)
    return json({ ok: false, error: "BAD_PARAMS" }, 400, env);

  const expected = await makeToken(email, env.NEWSLETTER_SECRET);
  if (token !== expected)
    return json({ ok: false, error: "INVALID_TOKEN" }, 403, env);

  await env.DB
    .prepare("UPDATE newsletter_subscribers SET status='unsubscribed' WHERE email=?")
    .bind(email).run();

  /* GET isteği ise HTML döndür */
  if (request.method === "GET") {
    const html = `<!doctype html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Abonelik İptal Edildi — MirPDF</title>
<link rel="icon" href="/assets/brand/favicon/favicon.ico">
<style>body{font-family:'Figtree',system-ui,sans-serif;background:#f7f8fc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:20px;padding:3rem 2.5rem;max-width:440px;width:calc(100vw - 3rem);text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.icon{font-size:3rem;margin-bottom:1rem}h1{font-size:1.4rem;color:#0d0f1a;margin-bottom:.75rem}
p{color:#64748b;line-height:1.6;margin-bottom:1.5rem}.btn{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:.7rem 1.75rem;border-radius:12px;font-weight:700}</style>
</head><body><div class="card"><div class="icon">✅</div>
<h1>Abonelik iptal edildi</h1>
<p><strong>${email}</strong> adresi bülten listemizden kaldırıldı. Üzgünüz, yeniden görmek dileğiyle!</p>
<a href="/" class="btn">Anasayfaya Dön</a></div></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html;charset=utf-8" } });
  }

  return json({ ok: true, message: "Abonelik iptal edildi." }, 200, env);
}
