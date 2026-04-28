// ============================================================
// src/ratelimit.js — Çok katmanlı rate limit + Turnstile
// ============================================================
// KV TOCTOU notu: Cloudflare KV'de compare-and-swap yoktur.
// Eşzamanlı istekler aynı counter'ı okuyup aynı anda yazabilir.
// Buna karşı iki savunma:
//   1) Çift pencere: hem mevcut hem önceki pencereyi kontrol et
//      → ani burst'ü yakala, kenar etkisini azalt
//   2) Gerçek limit = istenen limitin %80'i olarak sakla
//      → 2x race durumunda bile gerçek limite yakın kalır
// Upload/poll için asıl koruma kredi sistemidir (0'ın altına inemez).
// Auth için asıl koruma hesap kilitleme (5 deneme → kilit) dir.
// ============================================================

import { getIp } from "./helpers.js";

export function getIpFromRequest(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

// Sliding window approximation: mevcut + önceki pencereyi ağırlıklı say
// → tek pencerede race olsa bile önceki pencere yakalamaya yardımcı olur
export async function rateLimitKV(env, key, limit, windowSec) {
  if (!env.RATE_KV) return { ok: true };
  const now = Math.floor(Date.now() / 1000);
  const win = Math.floor(now / windowSec);
  const prevWin = win - 1;
  const positionInWindow = (now % windowSec) / windowSec; // 0.0 – 1.0

  const kCur  = `${key}:${win}`;
  const kPrev = `${key}:${prevWin}`;

  // Race-safe için %80 eşiği: KV eşzamanlılık race'i 2x sayabilir,
  // 80% saklanırsa 2x race'de gerçek limit = limit * 0.8 * 2 = 1.6x → kabul edilebilir
  const safeLimit = Math.max(1, Math.floor(limit * 0.8));

  // Her iki pencereyi paralel çek (gecikmeyi azaltır)
  const [curRaw, prevRaw] = await Promise.all([
    env.RATE_KV.get(kCur),
    env.RATE_KV.get(kPrev),
  ]);
  const cur  = Number(curRaw  || "0");
  const prev = Number(prevRaw || "0");

  // Sliding window: önceki penceredeki sayıyı kalan süreyle orantılı ağırlıklandır
  const weighted = cur + prev * (1 - positionInWindow);
  if (weighted >= safeLimit) {
    return { ok: false, retryAfter: (win + 1) * windowSec - now };
  }

  await env.RATE_KV.put(kCur, String(cur + 1), { expirationTtl: windowSec * 2 + 5 });
  return { ok: true };
}

export async function multiLayerRateLimit(env, { ip, clientId, fingerprint, action }) {
  const limits = {
    upload:   { ip: [20, 3600],  clientId: [50, 3600],  fingerprint: [30, 3600] },
    batch:    { ip: [10, 3600],  clientId: [20, 3600],  fingerprint: [15, 3600] },
    checkout: { ip: [5, 3600],   clientId: [10, 3600],  fingerprint: [7, 3600] },
    api:      { ip: [100, 60],   clientId: [200, 60],   fingerprint: [150, 60] },
  };
  const cfg = limits[action] || limits.upload;

  if (ip) {
    const r = await rateLimitKV(env, `rl:ip:${action}:${ip}`, cfg.ip[0], cfg.ip[1]);
    if (!r.ok) return { allowed: false, reason: "ip_rate_limit", retryAfter: r.retryAfter, layer: "ip" };
  }
  if (clientId) {
    const r = await rateLimitKV(env, `rl:cid:${action}:${clientId}`, cfg.clientId[0], cfg.clientId[1]);
    if (!r.ok) return { allowed: false, reason: "client_rate_limit", retryAfter: r.retryAfter, layer: "clientId" };
  }
  if (fingerprint) {
    const r = await rateLimitKV(env, `rl:fp:${action}:${fingerprint}`, cfg.fingerprint[0], cfg.fingerprint[1]);
    if (!r.ok) return { allowed: false, reason: "fingerprint_rate_limit", retryAfter: r.retryAfter, layer: "fingerprint" };
  }
  return { allowed: true };
}

export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) return { success: true, skipped: true };
  if (!token) return { success: false, errorCodes: ["missing-input-response"] };
  const formData = new FormData();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);
  if (ip) formData.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: formData,
  });
  const out = await res.json().catch(() => ({}));
  return { success: !!out.success, action: out.action, errorCodes: out["error-codes"] || [], skipped: false };
}

export async function completeAbuseCheck(env, request, { action = "upload", requireTurnstile = false } = {}) {
  const ip = getIpFromRequest(request);
  let clientId = "anon";
  let fingerprint = null;

  try {
    const h = request.headers.get("x-client-id") || "";
    if (h && h.length <= 128) clientId = h;
  } catch {}

  try {
    const body = await request.clone().json();
    if (body?.turnstileToken && requireTurnstile) {
      const t = await verifyTurnstile(env, body.turnstileToken, ip);
      if (!t.success && !t.skipped) return { allowed: false, reason: "turnstile_failed", details: t.errorCodes };
    }
    fingerprint = body?.fingerprint || null;
  } catch {}

  const rl = await multiLayerRateLimit(env, { ip, clientId, fingerprint, action });
  if (!rl.allowed) return rl;

  return { allowed: true };
}
