// ============================================================
// src/referral.js — Referans (davet) sistemi
//
// GET  /api/referral/my          — kullanıcının kodu + istatistikleri
// POST /api/referral/apply       — kayıt sırasında kodu uygula
// ============================================================

import { json } from "./helpers.js";
import { requireAuth } from "./auth.js";

const REFERRER_BONUS  = 10; // Davet edenin kazandığı kredi
const REFERRED_BONUS  = 5;  // Davet edilenin kazandığı kredi

/* ── Kısa benzersiz kod üret (6 karakter alfanumerik) ── */
async function generateCode(userId) {
  const data = new TextEncoder().encode(`ref:${userId}:${Date.now()}`);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  const hex  = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  // Kafa karıştırıcı karakterleri çıkar: 0/O, 1/I/l
  const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CHARSET[parseInt(hex.slice(i * 2, i * 2 + 2), 16) % CHARSET.length];
  }
  return code;
}

/* ── Kullanıcı referans kodunu getir / oluştur ── */
export async function handleReferralMy(request, env) {
  const session = await requireAuth(request, env).catch(() => null);
  if (!session) return json({ ok: false, error: "UNAUTHORIZED" }, 401, env);

  /* Mevcut kodu bul */
  let row = await env.DB
    .prepare("SELECT code FROM referral_codes WHERE user_id = ?")
    .bind(session.sub).first();

  if (!row) {
    /* Kod oluştur */
    let code, attempts = 0;
    do {
      code = await generateCode(session.sub + attempts);
      const conflict = await env.DB
        .prepare("SELECT 1 FROM referral_codes WHERE code = ?")
        .bind(code).first();
      if (!conflict) break;
      attempts++;
    } while (attempts < 10);

    await env.DB
      .prepare("INSERT INTO referral_codes (user_id, code) VALUES (?, ?)")
      .bind(session.sub, code).run();

    row = { code };
  }

  /* İstatistikler */
  const stats = await env.DB
    .prepare(`SELECT
        COUNT(*) AS total_invites,
        SUM(CASE WHEN status = 'rewarded' THEN 1 ELSE 0 END) AS rewarded_invites,
        SUM(CASE WHEN status = 'rewarded' THEN ? ELSE 0 END) AS total_earned
      FROM referral_uses
      WHERE referrer_id = ?`)
    .bind(REFERRER_BONUS, session.sub).first();

  const shareLink = `https://mirpdf.com/register?ref=${row.code}`;

  return json({
    ok: true,
    data: {
      code:            row.code,
      shareLink,
      referrerBonus:   REFERRER_BONUS,
      referredBonus:   REFERRED_BONUS,
      totalInvites:    stats?.total_invites   || 0,
      rewardedInvites: stats?.rewarded_invites || 0,
      totalEarned:     stats?.total_earned    || 0,
    },
  }, 200, env);
}

/* ── Kayıt sırasında referans kodu uygula ── */
export async function handleReferralApply(request, env) {
  const body = await request.json().catch(() => null);
  const code       = String(body?.code       || "").trim().toUpperCase();
  const newUserId  = String(body?.newUserId  || "").trim();

  if (!code || !newUserId)
    return json({ ok: false, error: "BAD_PARAMS" }, 400, env);

  /* Kod geçerli mi? */
  const refRow = await env.DB
    .prepare("SELECT user_id FROM referral_codes WHERE code = ?")
    .bind(code).first();

  if (!refRow)
    return json({ ok: false, error: "INVALID_CODE", message: "Geçersiz davet kodu." }, 404, env);

  const referrerId = refRow.user_id;

  /* Kendini davet edemez */
  if (referrerId === newUserId)
    return json({ ok: false, error: "SELF_REFERRAL" }, 400, env);

  /* Daha önce bu kod kullanıldı mı? */
  const already = await env.DB
    .prepare("SELECT 1 FROM referral_uses WHERE referred_id = ?")
    .bind(newUserId).first();
  if (already)
    return json({ ok: false, error: "ALREADY_USED" }, 409, env);

  /* Kullanımı kaydet */
  await env.DB
    .prepare("INSERT INTO referral_uses (referrer_id, referred_id, code, status) VALUES (?, ?, ?, 'pending')")
    .bind(referrerId, newUserId, code).run();

  /* Yeni kullanıcıya hemen bonus ver */
  await env.DB
    .prepare("UPDATE users SET credits = credits + ? WHERE id = ?")
    .bind(REFERRED_BONUS, newUserId).run();

  return json({ ok: true, bonus: REFERRED_BONUS, message: `+${REFERRED_BONUS} kredi hesabınıza eklendi!` }, 200, env);
}

/* ── Bir kullanıcı ilk işlemini tamamladığında referrer'ı ödüllendir ── */
/* Bu fonksiyon jobs.js veya stripe.js'den çağrılır */
export async function rewardReferrer(env, referredUserId) {
  const use = await env.DB
    .prepare("SELECT referrer_id, id FROM referral_uses WHERE referred_id = ? AND status = 'pending'")
    .bind(referredUserId).first();

  if (!use) return;

  await env.DB
    .prepare("UPDATE users SET credits = credits + ? WHERE id = ?")
    .bind(REFERRER_BONUS, use.referrer_id).run();

  await env.DB
    .prepare("UPDATE referral_uses SET status = 'rewarded', rewarded_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(use.id).run();
}
