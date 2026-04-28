// ============================================================
// src/admin.js — Admin API (Bearer token korumalı)
// ============================================================

import { json, timingSafeEq } from "./helpers.js";
import { signJWT, verifyJWT } from "./auth.js";
import { listMonitoringEvents } from "./monitoring.js";
import { seoGetBySlug, seoList, seoUpsert, seoDelete } from "./seo-worker.js";

// ---- requireAdmin: JWT admin token VEYA raw ADMIN_SECRET_TOKEN ----
export async function requireAdmin(request, env) {
  const h = request.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) return { ok: false, status: 401, error: "unauthorized" };
  const token = h.slice(7).trim();
  if (!token) return { ok: false, status: 401, error: "unauthorized" };

  // 1. JWT admin session token (tercih edilen)
  try {
    if (env.JWT_SECRET) {
      const payload = await verifyJWT(env, token);
      if (payload?.adm === true && payload?.role === "admin") return { ok: true };
    }
  } catch {}

  // 2. Raw ADMIN_SECRET_TOKEN (timing-safe, sadece Bearer header)
  const expected = (env.ADMIN_SECRET_TOKEN || "").trim();
  if (expected && timingSafeEq(token, expected)) return { ok: true };

  return { ok: false, status: 403, error: "forbidden" };
}

// ---- /api/admin/auth → kısa ömürlü admin JWT ----
export async function handleAdminAuth(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  // Not: rate limit burada değil, caller'dan gelir

  const body = await request.json().catch(() => ({}));
  const provided = String(body?.token || "").trim();
  const expected = (env.ADMIN_SECRET_TOKEN || "").trim();

  if (!expected || !timingSafeEq(provided, expected)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401, env);
  }

  const adminToken = await signJWT(env, { sub: "admin", role: "admin", adm: true }, 7200);
  return json({ ok: true, data: { token: adminToken, expiresIn: 7200 } }, 200, env);
}

// ---- Cache purge ----
const TRACKING_PARAMS = new Set([
  "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
  "gclid","fbclid","msclkid","yclid","igshid","mc_cid","mc_eid",
]);
function buildCacheKey(rawUrl) {
  const u = new URL(rawUrl);
  for (const k of Array.from(u.searchParams.keys())) {
    if (TRACKING_PARAMS.has(k) || k.startsWith("utm_")) u.searchParams.delete(k);
  }
  return new Request(u.toString(), { method: "GET" });
}

async function adminCachePurge(request, env) {
  const body   = await request.json().catch(() => ({}));
  const url    = body?.url    ? String(body.url)    : null;
  const prefix = body?.prefix ? String(body.prefix) : null;

  const cache  = caches.default;
  const purged = [];

  if (url) {
    await cache.delete(buildCacheKey(url));
    if (env.CACHE_INDEX) {
      const u  = new URL(url);
      const id = djb2(u.toString());
      await env.CACHE_INDEX.delete(`idx:${u.pathname}:${id}`).catch(() => {});
    }
    purged.push({ type: "url", url });
  }

  if (prefix && env.CACHE_INDEX) {
    const norm = prefix.startsWith("/") ? prefix : `/${prefix}`;
    const { keys } = await env.CACHE_INDEX.list({ prefix: `idx:${norm}` });
    for (const k of keys || []) {
      const storedUrl = await env.CACHE_INDEX.get(k.name);
      if (storedUrl) {
        await cache.delete(buildCacheKey(storedUrl));
        await env.CACHE_INDEX.delete(k.name);
        purged.push({ type: "prefix", url: storedUrl });
      }
    }
  }

  return { purged, count: purged.length };
}

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// ---- Dashboard ----
async function adminDashboard(env) {
  const sinceIso  = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const sinceMs   = Date.now() - 24 * 3600 * 1000;
  const sinceJobs = Math.floor(sinceMs / 1000);
  const monthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);

  // Jobs 24h
  const { results: jobRows } = await env.DB.prepare(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status='done'   THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
     FROM jobs WHERE created_at >= ?1`
  ).bind(sinceJobs).all();

  // Top events 24h
  const { results: events } = await env.DB.prepare(
    `SELECT event, COUNT(*) as c FROM analytics_events
     WHERE created_at >= ?1 GROUP BY event ORDER BY c DESC LIMIT 20`
  ).bind(sinceIso).all();

  // Users özeti
  let users = { total: 0, pro: 0, today: 0, recent: [] };
  try {
    const todayStart = Math.floor(new Date().setHours(0,0,0,0) / 1000);
    const { results: uStats } = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM users) as total,
              (SELECT COUNT(*) FROM users WHERE role='pro' OR role='basic') as pro,
              (SELECT COUNT(*) FROM users WHERE created_at >= ?1) as today`
    ).bind(todayStart).all();
    const { results: recent } = await env.DB.prepare(
      `SELECT id, email, role, email_verified, created_at FROM users ORDER BY created_at DESC LIMIT 10`
    ).all();
    users = { ...(uStats[0] || {}), recent: recent || [] };
  } catch(_) {}

  // Revenue
  let revenue = { month_total: 0, all_time_total: 0, month_count: 0 };
  try {
    const { results: rev } = await env.DB.prepare(
      `SELECT SUM(CASE WHEN created_at >= ?1 THEN amount ELSE 0 END) as month_total,
              SUM(amount) as all_time_total,
              COUNT(CASE WHEN created_at >= ?1 THEN 1 END) as month_count
       FROM revenue_events`
    ).bind(monthStart).all();
    if (rev[0]) revenue = rev[0];
  } catch(_) {}

  // Recent transactions
  let transactions = { recent: [] };
  try {
    const { results: txs } = await env.DB.prepare(
      `SELECT id, user_id, kind, amount, created_at FROM transactions ORDER BY created_at DESC LIMIT 10`
    ).all();
    transactions = { recent: txs || [] };
  } catch(_) {}

  return {
    window:       "24h",
    jobs:         jobRows[0] || {},
    topEvents:    events || [],
    users,
    revenue,
    transactions,
  };
}

// ---- Health ----
async function adminHealth(env) {
  const { results: db } = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM users) as users,
            (SELECT COUNT(*) FROM jobs) as jobs,
            (SELECT COUNT(*) FROM subscriptions) as subscriptions,
            (SELECT COUNT(*) FROM analytics_events) as events`
  ).all();
  return { ok: true, db: db[0] || {} };
}

// ---- Webhook failures ----
async function adminWebhookFailures(env) {
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT event_type, status, error, created_at FROM webhook_failures
     WHERE created_at >= ?1 ORDER BY created_at DESC LIMIT 200`
  ).bind(sinceIso).all();
  return { window: "24h", failures: results || [] };
}

// ---- Main admin router ----
export async function handleAdmin(request, env, path) {
  const a = await requireAdmin(request, env);
  if (!a.ok) return json({ ok: false, error: a.error }, a.status, env);

  if (path === "/api/admin/dashboard") return json(await adminDashboard(env), 200, env);
  if (path === "/api/admin/health")    return json(await adminHealth(env), 200, env);
  if (path === "/api/admin/monitoring") return json({ events: await listMonitoringEvents(env, { limit: 200 }) }, 200, env);
  if (path === "/api/admin/webhook-failures") return json(await adminWebhookFailures(env), 200, env);

  if (path === "/api/admin/cache/purge" && request.method === "POST") {
    return json({ ok: true, data: await adminCachePurge(request, env) }, 200, env);
  }

  // SEO pages CRUD
  if (path === "/api/admin/seo-pages" && request.method === "GET") {
    const u = new URL(request.url);
    const limit = Math.min(500, Math.max(1, Number(u.searchParams.get("limit") || 200)));
    return json({ ok: true, data: { pages: await seoList(env, limit) } }, 200, env);
  }

  const mSeo = path.match(/^\/api\/admin\/seo-pages\/(.+)$/);
  if (mSeo) {
    const slug = decodeURIComponent(mSeo[1]);
    if (request.method === "GET") {
      const page = await seoGetBySlug(env, slug);
      return page
        ? json({ ok: true, data: { page } }, 200, env)
        : json({ ok: false, error: "NOT_FOUND" }, 404, env);
    }
    if (request.method === "PUT") {
      const body = await request.json().catch(() => ({}));
      return json({ ok: true, data: { page: await seoUpsert(env, slug, body || {}) } }, 200, env);
    }
    if (request.method === "DELETE") {
      await seoDelete(env, slug);
      return json({ ok: true, data: { deleted: true } }, 200, env);
    }
  }

  // SEO batch generation
  if (path === "/api/admin/generate-seo/priority" && request.method === "POST") {
    const { priorityTools, generateSeoPages } = await import("../scripts/generate-seo-pages.js");
    return json({ ok: true, data: await generateSeoPages(env, priorityTools, "priority") }, 200, env);
  }
  if (path === "/api/admin/generate-seo/secondary" && request.method === "POST") {
    const { secondaryTools, generateSeoPages } = await import("../scripts/generate-seo-pages.js");
    return json({ ok: true, data: await generateSeoPages(env, secondaryTools, "secondary") }, 200, env);
  }

  // ── Kullanıcı Listesi ─────────────────────────────────────────────────────
  if (path === "/api/admin/users" && request.method === "GET") {
    const u   = new URL(request.url);
    const q   = (u.searchParams.get("q")||"").trim();
    const role= u.searchParams.get("role")||"";
    const page= Math.max(1, Number(u.searchParams.get("page")||1));
    const limit= Math.min(100, Number(u.searchParams.get("limit")||50));
    const offset= (page-1)*limit;

    let sql = "SELECT id,email,first_name,last_name,role,email_verified,created_at,failed_login_attempts,locked_until FROM users";
    const binds = [];
    const where = [];
    if (q) { where.push("(email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)"); binds.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    if (role) { where.push("role=?"); binds.push(role); }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    binds.push(limit, offset);

    const rows  = await env.DB.prepare(sql).bind(...binds).all();
    const total = await env.DB.prepare("SELECT COUNT(*) as n FROM users" + (where.length ? " WHERE " + where.join(" AND ") : "")).bind(...binds.slice(0,-2)).first();
    return json({ ok:true, data:{ users: rows.results||[], total: total?.n||0, page, limit } }, 200, env);
  }

  // ── Kullanıcı Detay ────────────────────────────────────────────────────────
  const mUser = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/);
  if (mUser) {
    const uid = mUser[1];

    if (request.method === "GET") {
      const user = await env.DB.prepare(
        "SELECT id,email,first_name,last_name,role,email_verified,created_at,stripe_customer_id,failed_login_attempts,locked_until FROM users WHERE id=?"
      ).bind(uid).first();
      if (!user) return json({ ok:false, error:"NOT_FOUND" }, 404, env);
      const credits = await env.DB.prepare("SELECT balance FROM credits WHERE user_id=?").bind(uid).first();
      const txCount = await env.DB.prepare("SELECT COUNT(*) as n FROM transactions WHERE user_id=?").bind(uid).first();
      const jobCount= await env.DB.prepare("SELECT COUNT(*) as n FROM jobs WHERE client_id=?").bind(uid).first();
      return json({ ok:true, data:{ ...user, balance: credits?.balance??0, tx_count: txCount?.n??0, job_count: jobCount?.n??0 } }, 200, env);
    }

    // Kullanıcı düzenle (rol, email_verified, kilit aç)
    if (request.method === "PATCH") {
      const body = await request.json().catch(()=>({}));
      const sets = []; const binds = [];
      if (body.role !== undefined)           { sets.push("role=?");                    binds.push(body.role); }
      if (body.email_verified !== undefined) { sets.push("email_verified=?");          binds.push(body.email_verified ? 1 : 0); }
      if (body.unlock === true)              { sets.push("failed_login_attempts=0, locked_until=NULL"); }
      if (body.first_name !== undefined)     { sets.push("first_name=?");              binds.push(body.first_name); }
      if (body.last_name !== undefined)      { sets.push("last_name=?");               binds.push(body.last_name); }
      if (!sets.length) return json({ ok:false, error:"BAD_REQUEST" }, 400, env);
      binds.push(uid);
      await env.DB.prepare(`UPDATE users SET ${sets.join(",")} WHERE id=?`).bind(...binds).run();
      return json({ ok:true }, 200, env);
    }

    // Kullanıcı sil (hard delete — ON DELETE CASCADE ile ilişkili veriler silinir)
    if (request.method === "DELETE") {
      const body = await request.json().catch(()=>({}));
      if (!body.confirm) return json({ ok:false, error:"CONFIRM_REQUIRED", message:"confirm:true gerekli." }, 400, env);
      await env.DB.prepare("DELETE FROM users WHERE id=?").bind(uid).run();
      return json({ ok:true, deleted:true }, 200, env);
    }
  }

  // ── Kullanıcı Devre Dışı Bırak / Aktifleştir ──────────────────────────────
  const mDisable = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/(disable|enable)$/);
  if (mDisable && request.method === "POST") {
    const uid    = mDisable[1];
    const action = mDisable[2];
    // "disabled" rolü ata — giriş engellenecek
    await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(action === "disable" ? "disabled" : "free", uid).run();
    if (action === "disable") {
      // Aktif oturumları da kapat
      await env.DB.prepare("UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(Date.now(),uid).run();
    }
    return json({ ok:true, action }, 200, env);
  }

  // ── Admin: şifre sıfırlama linki gönder ───────────────────────────────────
  const mResetPw = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/send-reset$/);
  if (mResetPw && request.method === "POST") {
    const uid  = mResetPw[1];
    const user = await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(uid).first();
    if (!user) return json({ ok:false, error:"NOT_FOUND" }, 404, env);
    const { randomToken, sha256Hex } = await import("./helpers.js");
    const { sendEmail, resetPasswordHtml } = await import("./email.js");
    const origin     = env.APP_ORIGIN || "https://mirpdf.com";
    const tokenPlain = randomToken(24);
    const tokenHash  = await sha256Hex(tokenPlain);
    const tsNow = Date.now();
    const ttl   = 3600 * 1000;
    await env.DB.prepare("INSERT OR REPLACE INTO password_resets (token_hash,user_id,email,created_at,expires_at) VALUES (?,?,?,?,?)")
      .bind(tokenHash, uid, user.email, tsNow, tsNow+ttl).run();
    await sendEmail(env, { to: user.email, subject: "MirPDF şifre sıfırlama — linkin burada", html: resetPasswordHtml(origin, tokenPlain) });
    return json({ ok:true, sent:true }, 200, env);
  }

  // ── Admin: e-posta manuel doğrula ─────────────────────────────────────────
  const mVerify = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/verify-email$/);
  if (mVerify && request.method === "POST") {
    await env.DB.prepare("UPDATE users SET email_verified=1 WHERE id=?").bind(mVerify[1]).run();
    return json({ ok:true }, 200, env);
  }

  // ── Aktivite Logları ───────────────────────────────────────────────────────
  if (path === "/api/admin/activity" && request.method === "GET") {
    const u     = new URL(request.url);
    const uid   = u.searchParams.get("user_id")||"";
    const limit = Math.min(200, Number(u.searchParams.get("limit")||50));
    let sql = "SELECT job_id,client_id,tool,status,created_at,output_bytes FROM jobs";
    const binds = [];
    if (uid) { sql += " WHERE client_id=?"; binds.push(uid); }
    sql += " ORDER BY created_at DESC LIMIT ?"; binds.push(limit);
    const rows = await env.DB.prepare(sql).bind(...binds).all();
    return json({ ok:true, data:{ logs: rows.results||[] } }, 200, env);
  }

  return json({ ok: false, error: "NOT_FOUND" }, 404, env);
}
