// ============================================================
// src/webhooks.js — Kullanıcıya dışa webhook gönderme sistemi
//
// GET    /api/webhooks               — kullanıcının webhook'larını listele
// POST   /api/webhooks               — yeni webhook endpoint kaydet
// DELETE /api/webhooks/:id           — webhook sil
// POST   /api/webhooks/:id/test      — test event gönder
// POST   /api/webhooks/:id/toggle    — aktif/pasif geçiş
//
// Dahili:
//   deliverWebhook(env, userId, event, payload) — worker içinden çağrılır
// ============================================================

import { json } from "./helpers.js";
import { requireAuth } from "./auth.js";

const MAX_WEBHOOKS_PER_USER = 5;

/* ── Olaylar ── */
export const WEBHOOK_EVENTS = [
  "job.completed",      // PDF işlemi başarıyla tamamlandı
  "job.failed",         // PDF işlemi başarısız oldu
  "credit.low",         // Kredi bakiyesi eşik altına düştü (≤5)
  "subscription.created",
  "subscription.cancelled",
];

/* ── HMAC-SHA256 imzası ── */
async function signPayload(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return "sha256=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,"0")).join("");
}

/* ── Liste ── */
export async function handleListWebhooks(request, env) {
  const session = await requireAuth(request, env).catch(() => null);
  if (!session) return json({ ok:false, error:"UNAUTHORIZED" }, 401, env);

  const { results } = await env.DB
    .prepare("SELECT id,url,events,active,failure_count,last_triggered_at,created_at FROM webhook_endpoints WHERE user_id=? ORDER BY created_at DESC")
    .bind(session.sub).all();

  return json({ ok:true, webhooks: results || [] }, 200, env);
}

/* ── Oluştur ── */
export async function handleCreateWebhook(request, env) {
  const session = await requireAuth(request, env).catch(() => null);
  if (!session) return json({ ok:false, error:"UNAUTHORIZED" }, 401, env);

  const body   = await request.json().catch(() => null);
  const url    = String(body?.url    || "").trim();
  const events = Array.isArray(body?.events) ? body.events : [];

  if (!url.startsWith("https://"))
    return json({ ok:false, error:"BAD_URL", message:"Webhook URL'si https:// ile başlamalıdır." }, 400, env);

  const invalidEvents = events.filter(e => !WEBHOOK_EVENTS.includes(e));
  if (invalidEvents.length)
    return json({ ok:false, error:"BAD_EVENTS", message:`Geçersiz olaylar: ${invalidEvents.join(", ")}` }, 400, env);

  if (!events.length)
    return json({ ok:false, error:"NO_EVENTS", message:"En az bir olay seçin." }, 400, env);

  /* Limit */
  const { results: existing } = await env.DB
    .prepare("SELECT COUNT(*) AS cnt FROM webhook_endpoints WHERE user_id=?")
    .bind(session.sub).all();
  if ((existing[0]?.cnt || 0) >= MAX_WEBHOOKS_PER_USER)
    return json({ ok:false, error:"LIMIT_REACHED", message:`En fazla ${MAX_WEBHOOKS_PER_USER} webhook ekleyebilirsiniz.` }, 400, env);

  /* Rastgele imzalama secret'ı üret */
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2,"0")).join("");

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO webhook_endpoints (id, user_id, url, events, secret, active) VALUES (?,?,?,?,?,1)"
  ).bind(id, session.sub, url, JSON.stringify(events), secret).run();

  return json({ ok:true, webhook:{ id, url, events, secret, active:1 } }, 201, env);
}

/* ── Sil ── */
export async function handleDeleteWebhook(request, env, id) {
  const session = await requireAuth(request, env).catch(() => null);
  if (!session) return json({ ok:false, error:"UNAUTHORIZED" }, 401, env);

  const row = await env.DB
    .prepare("SELECT id FROM webhook_endpoints WHERE id=? AND user_id=?")
    .bind(id, session.sub).first();
  if (!row) return json({ ok:false, error:"NOT_FOUND" }, 404, env);

  await env.DB.prepare("DELETE FROM webhook_endpoints WHERE id=?").bind(id).run();
  return json({ ok:true }, 200, env);
}

/* ── Toggle aktif/pasif ── */
export async function handleToggleWebhook(request, env, id) {
  const session = await requireAuth(request, env).catch(() => null);
  if (!session) return json({ ok:false, error:"UNAUTHORIZED" }, 401, env);

  const row = await env.DB
    .prepare("SELECT active FROM webhook_endpoints WHERE id=? AND user_id=?")
    .bind(id, session.sub).first();
  if (!row) return json({ ok:false, error:"NOT_FOUND" }, 404, env);

  const newActive = row.active ? 0 : 1;
  await env.DB
    .prepare("UPDATE webhook_endpoints SET active=? WHERE id=?")
    .bind(newActive, id).run();

  return json({ ok:true, active: newActive }, 200, env);
}

/* ── Test event gönder ── */
export async function handleTestWebhook(request, env, id) {
  const session = await requireAuth(request, env).catch(() => null);
  if (!session) return json({ ok:false, error:"UNAUTHORIZED" }, 401, env);

  const row = await env.DB
    .prepare("SELECT url, secret FROM webhook_endpoints WHERE id=? AND user_id=?")
    .bind(id, session.sub).first();
  if (!row) return json({ ok:false, error:"NOT_FOUND" }, 404, env);

  const testPayload = {
    event:     "test",
    webhook_id: id,
    timestamp: new Date().toISOString(),
    data:      { message: "Bu bir test olayıdır. Webhook'unuz doğru yapılandırılmış! 🎉" },
  };

  const result = await fireWebhook(row.url, row.secret, "test", testPayload);
  return json({ ok:true, ...result }, result.success ? 200 : 502, env);
}

/* ── Webhook at (internal) ── */
async function fireWebhook(url, secret, event, payload) {
  const body      = JSON.stringify(payload);
  const signature = await signPayload(secret, body);
  const start     = Date.now();

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":       "application/json",
        "X-MirPDF-Event":     event,
        "X-MirPDF-Signature": signature,
        "X-MirPDF-Timestamp": String(Math.floor(Date.now()/1000)),
        "User-Agent":         "MirPDF-Webhook/1.0",
      },
      body,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    return { success: res.ok, status: res.status, durationMs: Date.now() - start };
  } catch (err) {
    return { success: false, status: 0, error: err.message, durationMs: Date.now() - start };
  }
}

/* ─────────────────────────────────────────────────────────────
   deliverWebhook — worker içinden çağrılır
   Örnek: await deliverWebhook(env, userId, "job.completed", { jobId, tool, ... })
   ───────────────────────────────────────────────────────────── */
export async function deliverWebhook(env, userId, event, data) {
  if (!userId) return;

  const { results } = await env.DB
    .prepare(
      `SELECT id, url, secret, events FROM webhook_endpoints
       WHERE user_id=? AND active=1
         AND (events='["*"]' OR events LIKE '%' || ? || '%')`
    )
    .bind(userId, event).all();

  if (!results?.length) return;

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const deliveries = results
    .filter(wh => {
      /* Olay filtresi */
      try {
        const events = JSON.parse(wh.events || "[]");
        return events.includes(event) || events.includes("*");
      } catch { return true; }
    })
    .map(async wh => {
      const result = await fireWebhook(wh.url, wh.secret, event, { ...payload, webhook_id: wh.id });

      /* Başarısızlık sayacını güncelle */
      if (!result.success) {
        await env.DB.prepare(
          "UPDATE webhook_endpoints SET failure_count=failure_count+1, last_triggered_at=CURRENT_TIMESTAMP WHERE id=?"
        ).bind(wh.id).run();

        /* 10 ardışık başarısız → otomatik devre dışı */
        const updated = await env.DB
          .prepare("SELECT failure_count FROM webhook_endpoints WHERE id=?")
          .bind(wh.id).first();
        if ((updated?.failure_count || 0) >= 10) {
          await env.DB
            .prepare("UPDATE webhook_endpoints SET active=0 WHERE id=?")
            .bind(wh.id).run();
        }
      } else {
        await env.DB.prepare(
          "UPDATE webhook_endpoints SET failure_count=0, last_triggered_at=CURRENT_TIMESTAMP WHERE id=?"
        ).bind(wh.id).run();
      }
    });

  await Promise.allSettled(deliveries);
}
