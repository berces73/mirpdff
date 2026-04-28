// ============================================================
// src/push.js — Web Push bildirim sistemi
//
// POST /api/push/subscribe    — subscription kaydet
// POST /api/push/unsubscribe  — subscription sil
// POST /api/push/send         — (admin) bildirim gönder
//
// NOT: Web Push, VAPID key çifti gerektirir.
// Üretim için: npx web-push generate-vapid-keys
// Env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// ============================================================

import { json, getIp, rateLimit } from "./helpers.js";
import { requireAuth } from "./auth.js";

/* ── VAPID imzası (CF Workers'da SubtleCrypto ile) ── */
async function signVapid(env, endpoint, ttl) {
  const audience = new URL(endpoint);
  const base = `${audience.protocol}//${audience.host}`;
  const header = btoa(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({
    aud: base,
    exp: now + (ttl || 12 * 3600),
    sub: env.VAPID_SUBJECT || "mailto:destek@mirpdf.com",
  }));
  const data = `${header}.${payload}`;

  // VAPID private key (base64url encoded raw EC key)
  const rawKey = Uint8Array.from(
    atob(env.VAPID_PRIVATE_KEY.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey(
    "raw", rawKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(data)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

/* ── Kayıt ── */
export async function handlePushSubscribe(request, env) {
  const ip = getIp(request);
  const rl = await rateLimit(env, `rl:push:sub:${ip}`, 10, 3600);
  if (!rl.ok) return json({ ok: false, error: "RATE_LIMIT" }, 429, env);

  const body = await request.json().catch(() => null);
  if (!body?.subscription?.endpoint)
    return json({ ok: false, error: "BAD_SUBSCRIPTION" }, 400, env);

  const endpoint = body.subscription.endpoint;
  const p256dh   = body.subscription.keys?.p256dh || null;
  const auth     = body.subscription.keys?.auth    || null;

  /* Oturum açıksa user_id bağla */
  let userId = null;
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (token) {
    try {
      const session = await env.AUTH.verifyToken?.(token, env);
      userId = session?.sub || null;
    } catch { /* anonim */ }
  }

  /* Upsert */
  await env.DB.prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth_key, user_id, topic)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh=excluded.p256dh,
      auth_key=excluded.auth_key,
      user_id=COALESCE(excluded.user_id, push_subscriptions.user_id),
      updated_at=CURRENT_TIMESTAMP
  `).bind(endpoint, p256dh, auth, userId, body.topic || "general").run();

  /* Public VAPID key döndür */
  return json({ ok: true, vapidPublicKey: env.VAPID_PUBLIC_KEY || null }, 201, env);
}

/* ── Silme ── */
export async function handlePushUnsubscribe(request, env) {
  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return json({ ok: false, error: "BAD_ENDPOINT" }, 400, env);

  await env.DB
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .bind(endpoint).run();

  return json({ ok: true }, 200, env);
}

/* ── Admin: bildirim gönder ── */
export async function handlePushSend(request, env) {
  /* Admin token doğrula */
  const adminToken = (request.headers.get("x-admin-token") || "").trim();
  const expected   = env.ADMIN_SECRET || "";
  if (!adminToken || adminToken !== expected)
    return json({ ok: false, error: "UNAUTHORIZED" }, 401, env);

  const body    = await request.json().catch(() => null);
  const title   = String(body?.title   || "MirPDF").slice(0, 120);
  const message = String(body?.message || "").slice(0, 300);
  const url     = String(body?.url     || "https://mirpdf.com").slice(0, 500);
  const topic   = body?.topic || "general";

  const payload = JSON.stringify({ title, body: message, icon: "/assets/brand/favicon/favicon-192.png", badge: "/assets/brand/favicon/favicon-72.png", url, tag: topic });

  /* Tüm aktif subscription'ları al (max 1000) */
  const rows = await env.DB
    .prepare("SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE topic = ? OR topic = 'general' LIMIT 1000")
    .bind(topic).all();

  let sent = 0, failed = 0;
  const promises = (rows.results || []).map(async row => {
    try {
      const jwt = await signVapid(env, row.endpoint, 12 * 3600);
      const res = await fetch(row.endpoint, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/octet-stream",
          "Authorization": `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
          "TTL":           "86400",
        },
        body: payload,
      });
      if (res.status === 410 || res.status === 404) {
        /* Geçersiz subscription — sil */
        await env.DB
          .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
          .bind(row.endpoint).run();
        failed++;
      } else if (res.ok || res.status === 201) {
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  });

  await Promise.allSettled(promises);
  return json({ ok: true, sent, failed }, 200, env);
}
