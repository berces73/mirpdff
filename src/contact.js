// ============================================================
// src/contact.js — /api/contact POST handler
// Resend ile destek@mirpdf.com'a iletir.
// Rate limit: 5 mesaj/saat/IP
// ============================================================

import { json, getIp, rateLimit } from "./helpers.js";
import { sendEmail } from "./email.js";

const ALLOWED_SUBJECTS = new Set([
  "Genel Mesaj",
  "Teknik Destek",
  "Ödeme / Fatura",
  "Kurumsal Görüşme",
  "KVKK Başvurusu",
  "Diğer",
]);

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function handleContact(request, env) {
  const ip = getIp(request);
  const rl = await rateLimit(env, `rl:contact:${ip}`, 5, 3600);
  if (!rl.ok)
    return json({ ok: false, error: "RATE_LIMIT", retryAfter: rl.retryAfter }, 429, env);

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "BAD_JSON" }, 400, env);

  const name    = String(body.name    || "").trim().slice(0, 100);
  const email   = String(body.email   || "").trim().toLowerCase().slice(0, 200);
  const subject = String(body.subject || "Genel Mesaj").trim();
  const message = String(body.message || "").trim().slice(0, 3000);

  // Validasyon
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ ok: false, error: "BAD_EMAIL", message: "Geçerli bir e-posta adresi girin." }, 400, env);

  if (!message || message.length < 10)
    return json({ ok: false, error: "BAD_MESSAGE", message: "Mesajınız en az 10 karakter olmalı." }, 400, env);

  const safeSubject = ALLOWED_SUBJECTS.has(subject) ? subject : "Genel Mesaj";
  const to = env.CONTACT_EMAIL || "destek@mirpdf.com";

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
  <h2 style="color:#0d0f1a;margin:0 0 16px">[MirPDF] Yeni İletişim Mesajı</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:8px;font-weight:600;color:#64748b;width:120px">Konu</td><td style="padding:8px">${escHtml(safeSubject)}</td></tr>
    <tr style="background:#fff"><td style="padding:8px;font-weight:600;color:#64748b">Ad</td><td style="padding:8px">${escHtml(name || "Belirtilmedi")}</td></tr>
    <tr><td style="padding:8px;font-weight:600;color:#64748b">E-posta</td><td style="padding:8px"><a href="mailto:${escHtml(email)}">${escHtml(email)}</a></td></tr>
    <tr style="background:#fff"><td style="padding:8px;font-weight:600;color:#64748b;vertical-align:top">Mesaj</td><td style="padding:8px;white-space:pre-wrap">${escHtml(message)}</td></tr>
  </table>
  <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">IP: ${escHtml(ip)} · ${new Date().toISOString()}</p>
</div>`;

  const result = await sendEmail(env, {
    to,
    subject: `[MirPDF İletişim] ${safeSubject} — ${name || email}`,
    html,
  });

  if (!result.ok) {
    console.error("contact sendEmail failed", result.reason);
    return json({ ok: false, error: "SEND_FAILED", message: "Mesaj gönderilemedi, lütfen tekrar dene." }, 502, env);
  }

  return json({ ok: true }, 200, env);
}
