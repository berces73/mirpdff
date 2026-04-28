// src/api-keys.js — MirPDF Self-Serve API Key Yönetimi
//
// Endpoints (tümü auth gerektirir):
//   POST   /api/developer/keys          → yeni key üret
//   GET    /api/developer/keys          → key listesi
//   DELETE /api/developer/keys/:id      → key revoke
//   POST   /api/developer/keys/verify   → (internal) key doğrula + sayaç artır

const MAX_KEYS_PER_USER = 5;

// Plan limitlerı (aylık)
const PLAN_LIMITS = {
  free:  500,
  basic: 5000,
  pro:   50000,
};

// ── Yardımcı ──────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Yeni API key üret ─────────────────────────────────────────────────────────

export async function handleCreateKey(request, env, session) {
  const userId = session.sub;

  // Mevcut aktif key sayısı kontrol
  const { results } = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM api_keys WHERE user_id=? AND revoked_at IS NULL"
  ).bind(userId).all();
  if ((results[0]?.cnt || 0) >= MAX_KEYS_PER_USER) {
    return jsonResp({ ok: false, error: `Maksimum ${MAX_KEYS_PER_USER} aktif API anahtarı oluşturabilirsiniz.` }, 400);
  }

  // Kullanıcı planını al
  const user = await env.DB.prepare(
    "SELECT role FROM users WHERE id=?"
  ).bind(userId).first();
  const plan = user?.role === "pro" ? "pro" : user?.role === "basic" ? "basic" : "free";
  const callsLimit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  // Key formatı: mp_live_<32 random hex>
  const rawRandom = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const rawKey  = `mp_live_${rawRandom}`;
  const prefix  = rawKey.slice(0, 15); // "mp_live_" + 7 kar
  const keyHash = await sha256hex(rawKey);

  const body = await request.json().catch(() => ({}));
  const name = (body.name || "API Anahtarım").slice(0, 64);

  const id = uuid();
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name, plan, calls_month, calls_limit, created_at)
     VALUES (?,?,?,?,?,?,0,?,?)`
  ).bind(id, userId, keyHash, prefix, name, plan, callsLimit, now).run();

  // Düz key sadece bir kez döner, bir daha gösterilmez
  return jsonResp({
    ok: true,
    key: rawKey,          // Kullanıcıya bir kez gösterilir
    id,
    prefix,
    name,
    plan,
    calls_limit: callsLimit,
    created_at: now,
    warning: "Bu anahtarı kaydedin — bir daha gösterilmeyecek.",
  }, 201);
}

// ── Key listesi ───────────────────────────────────────────────────────────────

export async function handleListKeys(env, session) {
  const { results } = await env.DB.prepare(
    `SELECT id, key_prefix, name, plan, calls_month, calls_limit, last_used_at, created_at, revoked_at
     FROM api_keys WHERE user_id=? ORDER BY created_at DESC`
  ).bind(session.sub).all();

  return jsonResp({ ok: true, keys: results ?? [] });
}

// ── Key revoke ────────────────────────────────────────────────────────────────

export async function handleRevokeKey(env, session, keyId) {
  const now = Date.now();
  const result = await env.DB.prepare(
    "UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL"
  ).bind(now, keyId, session.sub).run();

  if (!result.meta?.changes) {
    return jsonResp({ ok: false, error: "Anahtar bulunamadı veya zaten iptal edilmiş." }, 404);
  }
  return jsonResp({ ok: true, revoked: true });
}

// ── API key doğrulama (internal — Worker içi) ──────────────────────────────────
// Bir istekte X-API-Key header'ı ile gelen key'i doğrular.
// Başarılıysa { userId, plan, keyId } döner, başarısızsa null.

export async function verifyApiKey(request, env) {
  const rawKey = (request.headers.get("X-API-Key") || "").trim();
  if (!rawKey.startsWith("mp_live_")) return null;

  const keyHash = await sha256hex(rawKey);

  const row = await env.DB.prepare(
    `SELECT id, user_id, plan, calls_month, calls_limit, revoked_at
     FROM api_keys WHERE key_hash=?`
  ).bind(keyHash).first();

  if (!row) return null;
  if (row.revoked_at) return null;                     // iptal edilmiş
  if (row.calls_month >= row.calls_limit) return null; // limit aşıldı

  // Sayaç artır + last_used güncelle (fire-and-forget)
  const now = Date.now();
  env.DB.prepare(
    "UPDATE api_keys SET calls_month=calls_month+1, last_used_at=? WHERE id=?"
  ).bind(now, row.id).run().catch(() => {});

  return { userId: row.user_id, plan: row.plan, keyId: row.id };
}

// ── Aylık sayaç sıfırlama (CRON'dan çağrılır) ─────────────────────────────────

export async function resetMonthlyCounters(env) {
  await env.DB.prepare("UPDATE api_keys SET calls_month=0").run();
  return { ok: true, reset: true };
}
