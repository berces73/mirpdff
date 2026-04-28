// ============================================================
// PDF PLATFORM V4.2 — _worker.js (modüler / refactored)
// ============================================================

// ─── Durable Object export ──────────────────────────────────────────────────
import { CreditCounter } from "./src/CreditCounter.js";
export { CreditCounter };

// ─── Core ───────────────────────────────────────────────────────────────────
import { parseUA,
  json, corsHeaders, corsPreflight,
  getIp, rateLimit,
  parseCookies, setCookie,
  sha256Hex, randomToken, randomId,
  timingSafeEq, requireOrigin,
  validatePassword,
  ALLOWED_JOB_TOOLS, TOOL_COSTS,
  DEFAULT_JOB_TTL_SECONDS,
} from "./src/helpers.js";

import { requireAuth, signJWT, verifyJWT, hashPassword, verifyPassword } from "./src/auth.js";
import { getClientId, creditDO } from "./src/clientid.js";
import { createDownloadToken, verifyDownloadToken } from "./src/download.js";

// ─── Rate limit / abuse ─────────────────────────────────────────────────────
import {
  rateLimitKV, multiLayerRateLimit, completeAbuseCheck, verifyTurnstile, getIpFromRequest,
} from "./src/ratelimit.js";

// ─── Feature modules ────────────────────────────────────────────────────────
import { handleTrack, trackEvent }              from "./src/analytics.js";
import { renderSeoPage, seoGetBySlug, seoList, seoUpsert, seoDelete, renderSitemapSeo, maybeGenerateSeoSitemap } from "./src/seo-worker.js";
import { requireAdmin, handleAdminAuth, handleAdmin } from "./src/admin.js";
import {
  handleToolUpload, handleJobSubmit, handleProcessorCallback,
  handleJobStatus, handleJobResult, dispatchToProcessor,
  runCleanup, circuitRecordSuccess, circuitRecordFailure,
} from "./src/jobs.js";
import { handleBatchSubmit, handleBatchStatus } from "./src/batch.js";
import { handleBatchZip }                       from "./src/zip.js";
import { handleContact }                        from "./src/contact.js";
import { handleNewsletterSubscribe, handleNewsletterUnsubscribe } from "./src/newsletter.js";
import { handleReferralMy, handleReferralApply }                  from "./src/referral.js";
import { handlePushSubscribe, handlePushUnsubscribe, handlePushSend } from "./src/push.js";
import { handleListWebhooks, handleCreateWebhook, handleDeleteWebhook, handleToggleWebhook, handleTestWebhook, deliverWebhook } from "./src/webhooks.js";
import { createCheckoutSession, handleStripeWebhook, isStripePriceConfigured } from "./src/stripe.js";
import { sendEmail, verifyEmailHtml, verifyEmailChangeHtml, resetPasswordHtml, welcomeHtml, lowCreditsHtml, passwordChangedHtml } from "./src/email.js";
import { handleGoogleStart, handleGoogleCallback, handleMagicLinkRequest, handleMagicLinkVerify } from "./src/oauth.js";
import { runMonitoringChecks, listMonitoringEvents }     from "./src/monitoring.js";
import { runAlertCheck }                        from "./src/alerts.js";
import {
  handleCreateKey, handleListKeys, handleRevokeKey,
  verifyApiKey, resetMonthlyCounters,
} from "./src/api-keys.js";
import { updateInternalLinksAI }               from "./src/internalLinksAI.js";
import { rotateAnalyticsLogs }                 from "./src/observability.js";

// ─────────────────────────────────────────────────────────────────────────────
// Edge cache helpers (public GET + SWR)
// ─────────────────────────────────────────────────────────────────────────────
const TRACKING_PARAMS = new Set([
  "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
  "gclid","fbclid","msclkid","yclid","igshid","mc_cid","mc_eid",
]);

function buildPublicCacheKey(request) {
  const u = new URL(request.url);
  for (const k of Array.from(u.searchParams.keys())) {
    if (TRACKING_PARAMS.has(k) || k.startsWith("utm_")) u.searchParams.delete(k);
  }
  return new Request(u.toString(), { method: "GET" });
}

function safeWriteAnalytics(env, point) {
  try { if (env?.ANALYTICS && typeof env.ANALYTICS.writeDataPoint === "function") env.ANALYTICS.writeDataPoint(point); } catch {}
}

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

async function indexCacheEntry(env, cacheUrl) {
  try {
    if (!env?.CACHE_INDEX) return;
    const u = new URL(cacheUrl);
    const id = djb2(u.toString());
    await env.CACHE_INDEX.put(`idx:${u.pathname}:${id}`, u.toString(), { expirationTtl: 7 * 24 * 3600 });
  } catch {}
}

async function listIndexedByPrefix(env, prefixPath, limit = 200) {
  if (!env?.CACHE_INDEX) return [];
  const norm = prefixPath.startsWith("/") ? prefixPath : `/${prefixPath}`;
  const { keys } = await env.CACHE_INDEX.list({ prefix: `idx:${norm}`, limit });
  if (!keys?.length) return [];
  const urls = [];
  for (const k of keys) { const v = await env.CACHE_INDEX.get(k.name); if (v) urls.push({ key: k.name, url: v }); }
  return urls;
}

export async function edgeCachePublicGET(request, env, ctx, { ttl = 3600, swr = 86400 } = {}, fetchFn) {
  if (request.method !== "GET") return fetchFn();
  if (request.headers.get("authorization")) return fetchFn();
  if (request.headers.get("cookie")) return fetchFn();

  const cache    = caches.default;
  const cacheKey = buildPublicCacheKey(request);
  const cached   = await cache.match(cacheKey);
  if (cached) {
    const h = new Headers(cached.headers);
    h.set("x-edge-cache", "HIT");
    safeWriteAnalytics(env, { indexes: [new URL(request.url).hostname], blobs: [new URL(request.url).pathname, "HIT"], doubles: [1] });
    return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: h });
  }

  const res = await fetchFn();
  if (!res || res.status !== 200) return res;
  if (res.headers.get("set-cookie")) return res;

  const headers = new Headers(res.headers);
  headers.set("cache-control", `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${swr}`);
  headers.set("vary", headers.get("vary") ? `${headers.get("vary")}, Accept-Encoding` : "Accept-Encoding");
  headers.set("x-edge-cache", "MISS");
  safeWriteAnalytics(env, { indexes: [new URL(request.url).hostname], blobs: [new URL(request.url).pathname, "MISS"], doubles: [1] });

  const toStore = new Response(res.clone().body, { status: res.status, statusText: res.statusText, headers });
  ctx?.waitUntil?.(cache.put(cacheKey, toStore.clone()));
  ctx?.waitUntil?.(indexCacheEntry(env, cacheKey.url));
  return toStore;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSR Internal Linking
// ─────────────────────────────────────────────────────────────────────────────
const TOOL_RELATIONSHIPS = {
  "pdf-birlestir":    { primary: ["pdf-sikistir","pdf-bol","pdf-duzenle"],            secondary: ["pdf-dondur","sayfa-sirala","pdf-kilitle"] },
  "pdf-sikistir":     { primary: ["pdf-birlestir","pdf-bol","pdf-den-jpg"],           secondary: ["pdf-duzenle","pdf-to-word"] },
  "pdf-bol":          { primary: ["pdf-birlestir","pdf-sikistir","sayfa-sil"],        secondary: ["pdf-dondur","pdf-den-jpg"] },
  "pdf-den-jpg":      { primary: ["jpg-den-pdf","pdf-sikistir"],                      secondary: ["pdf-duzenle","pdf-bol"] },
  "jpg-den-pdf":      { primary: ["pdf-den-jpg","pdf-birlestir","pdf-sikistir"],      secondary: ["pdf-duzenle","pdf-kilitle"] },
  "pdf-duzenle":      { primary: ["pdf-sikistir","pdf-birlestir"],                    secondary: ["pdf-imzala","filigran-ekle"] },
  "pdf-imzala":       { primary: ["pdf-kilitle","pdf-duzenle"],                       secondary: ["filigran-ekle","pdf-sikistir"] },
  "pdf-kilitle":      { primary: ["pdf-imzala","pdf-sikistir"],                       secondary: ["pdf-duzenle","pdf-birlestir"] },
  "pdf-kilit-ac":     { primary: ["pdf-birlestir","pdf-duzenle"],                     secondary: ["pdf-bol","pdf-sikistir"] },
  "pdf-dondur":       { primary: ["pdf-birlestir","pdf-sikistir"],                    secondary: ["pdf-duzenle","sayfa-sirala"] },
  "sayfa-sil":        { primary: ["pdf-bol","pdf-birlestir"],                         secondary: ["sayfa-sirala","pdf-sikistir"] },
  "sayfa-sirala":     { primary: ["pdf-bol","pdf-birlestir"],                         secondary: ["sayfa-sil","pdf-dondur"] },
  "filigran-ekle":    { primary: ["pdf-imzala","pdf-kilitle"],                        secondary: ["pdf-duzenle","qr-kod-ekle"] },
  "qr-kod-ekle":      { primary: ["pdf-duzenle","filigran-ekle"],                     secondary: ["pdf-imzala","pdf-kilitle"] },
  "ocr":              { primary: ["pdf-duzenle","pdf-to-word"],                       secondary: ["pdf-birlestir","pdf-sikistir"] },
  "pdf-to-word":      { primary: ["ocr","pdf-duzenle"],                               secondary: ["pdf-birlestir","pdf-sikistir"] },
  "pdf-numaralandir": { primary: ["pdf-duzenle","pdf-birlestir"],                     secondary: ["sayfa-sirala","filigran-ekle"] },
};
const TOOL_META = {
  "pdf-birlestir":    { name: "PDF Birleştir",   icon: "📄" },
  "pdf-sikistir":     { name: "PDF Sıkıştır",    icon: "🗜️" },
  "pdf-bol":          { name: "PDF Böl",          icon: "✂️" },
  "pdf-den-jpg":      { name: "PDF'den JPG",      icon: "🖼️" },
  "jpg-den-pdf":      { name: "JPG'den PDF",      icon: "📸" },
  "pdf-duzenle":      { name: "PDF Düzenle",      icon: "✏️" },
  "pdf-imzala":       { name: "PDF İmzala",       icon: "✍️" },
  "pdf-kilitle":      { name: "PDF Kilitle",      icon: "🔒" },
  "pdf-kilit-ac":     { name: "PDF Kilit Aç",    icon: "🔓" },
  "pdf-dondur":       { name: "PDF Döndür",       icon: "🔄" },
  "sayfa-sil":        { name: "Sayfa Sil",        icon: "🗑️" },
  "sayfa-sirala":     { name: "Sayfa Sırala",     icon: "📑" },
  "filigran-ekle":    { name: "Filigran Ekle",    icon: "💧" },
  "qr-kod-ekle":      { name: "QR Kod Ekle",      icon: "📱" },
  "ocr":              { name: "OCR",              icon: "🔍" },
  "pdf-to-word":      { name: "PDF'den Word",     icon: "📝" },
  "pdf-numaralandir": { name: "PDF Numaralandır", icon: "🔢" },
};

function buildRelatedToolsHTML(origin, toolSlug) {
  const rel = TOOL_RELATIONSHIPS[toolSlug];
  if (!rel) return "";
  const card = (slug, isPrimary) => {
    const m = TOOL_META[slug] || { name: slug, icon: "📄" };
    return `<a href="${origin}/tools/${slug}.html" class="tool-card ${isPrimary ? "primary" : "secondary"}" rel="related">
      <span class="tool-icon">${m.icon}</span><span class="tool-name">${m.name}</span>
      ${isPrimary ? '<span class="tool-arrow">→</span>' : ""}
    </a>`;
  };
  return `<section class="related-tools" aria-label="İlgili Araçlar">
    <h2>Sıradaki İşleminiz Ne Olabilir?</h2>
    <div class="tools-grid primary">${rel.primary.map(s => card(s, true)).join("")}</div>
    <details class="secondary-tools"><summary>Diğer İlgili Araçlar</summary>
    <div class="tools-grid secondary">${rel.secondary.map(s => card(s, false)).join("")}</div></details>
  </section>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh token helpers
// ─────────────────────────────────────────────────────────────────────────────
async function issueRefreshToken(env, userId, request) {
  const token     = crypto.randomUUID().replaceAll("-","") + crypto.randomUUID().replaceAll("-","");
  const tokenHash = await sha256Hex(token);
  const tsNow     = Date.now();
  const ttlSec    = Number(env.REFRESH_TTL_SECONDS || 30*24*3600);
  const exp       = tsNow + ttlSec*1000;
  const ip        = getIp(request);
  const ua        = (request.headers.get("user-agent") || "").slice(0, 180);
  await env.DB.prepare(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId, tokenHash, tsNow, exp, ip, ua).run();
  return { token, exp };
}
async function rotateRefreshToken(env, oldToken, userId, request) {
  const oldHash = await sha256Hex(oldToken);
  await env.DB.prepare("UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND token_hash=? AND revoked_at IS NULL")
    .bind(Date.now(), userId, oldHash).run();
  return issueRefreshToken(env, userId, request);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled (cron)
// ─────────────────────────────────────────────────────────────────────────────
export const scheduled = async (event, env, ctx) => {
  ctx.waitUntil(runCleanup(env));
  ctx.waitUntil(runMonitoringChecks(env));
  ctx.waitUntil(runAlertCheck(env));
  ctx.waitUntil(maybeGenerateSeoSitemap(env));
  ctx.waitUntil(rotateAnalyticsLogs(env)); // analytics_events + deletion_log retention
  if (event?.cron && (event.cron === "0 3 1 * *" || event.cron === String(env.INTERNAL_LINKS_CRON || ""))) {
    ctx.waitUntil(updateInternalLinksAI(env));
    ctx.waitUntil(resetMonthlyCounters(env)); // API key aylık sayaç sıfırla
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Queue consumer
// ─────────────────────────────────────────────────────────────────────────────
export async function queue(batch, env, ctx) {
  for (const msg of batch.messages) {
    try {
      await dispatchToProcessor(env, msg.body || {});
      msg.ack();
    } catch (e) {
      env?.ENVIRONMENT !== "production" && console.error(JSON.stringify({ level:"error", event:"queue_consumer_error", error: String(e?.message||e), jobId: msg.body?.jobId, ts: new Date().toISOString() }));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fetch handler
// ─────────────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ── Admin route guard ──────────────────────────────────────────────────
    if (path.startsWith("/admin/") || path === "/admin") {
      if (path === "/admin/login" || path === "/admin/login/") {
        const s = await env.ASSETS?.fetch(request);
        if (s && s.status !== 404) {
          const h = new Headers(s.headers); h.set("x-robots-tag","noindex, nofollow"); h.set("cache-control","no-store");
          return new Response(s.body, { status: s.status, headers: h });
        }
      }

      const provided = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i,"").trim();
      let adminAuthed = false;
      try {
        if (provided && env.JWT_SECRET) {
          const p = await verifyJWT(env, provided);
          if (p?.adm === true && p?.role === "admin") adminAuthed = true;
        }
      } catch {}
      if (!adminAuthed) {
        const expected = (env.ADMIN_SECRET_TOKEN || "").trim();
        if (expected && provided && timingSafeEq(provided, expected)) adminAuthed = true;
      }

      if (!adminAuthed) {
        const accept = request.headers.get("accept") || "";
        if (accept.includes("text/html"))
          return new Response("", { status: 302, headers: { Location: "/admin/login", "cache-control": "no-store" } });
        return new Response("401 Unauthorized", {
          status: 401,
          headers: { "content-type":"text/plain; charset=utf-8", "www-authenticate":'Bearer realm="MirPDF Admin"', "cache-control":"no-store", "x-robots-tag":"noindex, nofollow" },
        });
      }

      const s = await env.ASSETS?.fetch(request);
      if (!s || s.status === 404)
        return new Response("Admin page not found.", { status: 404, headers: { "cache-control":"no-store","x-robots-tag":"noindex, nofollow" } });
      const h = new Headers(s.headers); h.set("x-robots-tag","noindex, nofollow"); h.set("cache-control","no-store");
      return new Response(s.body, { status: s.status, headers: h });
    }

    // ── A/B testing ────────────────────────────────────────────────────────
    if (path === "/api/config" && request.method === "GET") {
      return json({
        ok: true,
        turnstileSiteKey:     env.TURNSTILE_SITE_KEY || "",
        googleClientId:       env.GOOGLE_CLIENT_ID || "",
        googleOAuthEnabled:   !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        requireEmailVerified: String(env.REQUIRE_EMAIL_VERIFIED||"0") === "1",
      }, 200, env);
    }

    if (path === "/api/ab-test" && request.method === "GET") {
      const experiment = url.searchParams.get("variant") || "";
      const userId     = url.searchParams.get("userId") || "anon";
      const experiments = {
        cta_color:       { variants:["red","green"],                weights:[50,50] },
        pricing_display: { variants:["grid","list"],                weights:[50,50] },
        paywall_copy:    { variants:["short","detailed"],           weights:[50,50] },
        ads_variant:     { variants:["affiliate","adsense","none"], weights:[40,20,40] },
      };
      const cfg = experiments[experiment];
      if (!cfg) return json({ ok:false, error:"INVALID_EXPERIMENT" }, 400, env);
      const seed = `${experiment}:${userId}`;
      let h2 = 0;
      for (let i = 0; i < seed.length; i++) h2 = (h2*31 + seed.charCodeAt(i)) >>> 0;
      const bucket = h2 % 100;
      let acc = 0, pick = cfg.variants[0];
      for (let i = 0; i < cfg.variants.length; i++) { acc += Number(cfg.weights?.[i]??0); if (bucket < acc) { pick = cfg.variants[i]; break; } }
      safeWriteAnalytics(env, { indexes:[url.hostname], blobs:["ab",experiment,pick], doubles:[1] });
      return json({ ok:true, variant:pick }, 200, env);
    }

    // ── Analytics stats (public — aggregate only) ──────────────────────────
    if (path === "/api/analytics/stats" && request.method === "GET") {
      // Rate limit: IP başına dakikada 10 — DB yoğun sorgu, botları engelle
      const _statsIp = getIp(request);
      const _statsRl = await rateLimit(env, `rl:stats:${_statsIp}`, 10, 60);
      if (!_statsRl.ok) return json({ ok: false, error: "RATE_LIMIT" }, 429, env);
      try {
        const now = Date.now();

        // Zaman dilimi hesapla — jobs.created_at = unixepoch() SECONDS (D1'de integer)
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
        const yearStart  = new Date(); yearStart.setMonth(0,1); yearStart.setHours(0,0,0,0);

        const tsToday = Math.floor(todayStart.getTime() / 1000);
        const tsMonth = Math.floor(monthStart.getTime() / 1000);
        const tsYear  = Math.floor(yearStart.getTime() / 1000);

        // jobs tablosundan tüm zaman dilimleri için toplam işlem sayısı
        const [today, month, year, allTime] = await Promise.all([
          env.DB.prepare(`SELECT COUNT(*) as c FROM jobs WHERE status='done' AND created_at >= ?1`).bind(tsToday).first(),
          env.DB.prepare(`SELECT COUNT(*) as c FROM jobs WHERE status='done' AND created_at >= ?1`).bind(tsMonth).first(),
          env.DB.prepare(`SELECT COUNT(*) as c FROM jobs WHERE status='done' AND created_at >= ?1`).bind(tsYear).first(),
          env.DB.prepare(`SELECT COUNT(*) as c FROM jobs WHERE status='done'`).first(),
        ]);

        // Benzersiz kullanıcı sayısı (bu ay)
        const uniqueUsers = await env.DB.prepare(
          `SELECT COUNT(DISTINCT client_id) as c FROM jobs WHERE status='done' AND created_at >= ?1`
        ).bind(tsMonth).first();

        // Tool bazlı bu ay
        const toolRows = await env.DB.prepare(
          `SELECT tool, COUNT(*) as cnt FROM jobs WHERE status='done' AND created_at >= ?1 GROUP BY tool ORDER BY cnt DESC LIMIT 10`
        ).bind(tsMonth).all();

        const topTools = {};
        for (const r of (toolRows.results || [])) {
          topTools[r.tool] = r.cnt;
        }

        const data = {
          today:        today?.c    || 0,
          this_month:   month?.c    || 0,
          this_year:    year?.c     || 0,
          all_time:     allTime?.c  || 0,
          unique_users_month: uniqueUsers?.c || 0,
          top_tools:    topTools,
          // legacy fields
          compress_month:    topTools['compress'] || topTools['compress-strong'] || 0,
          merge_month:       topTools['merge']    || topTools['pdf-merge'] || 0,
          pdf_to_word_month: topTools['pdf-to-word'] || 0,
          ocr_month:         topTools['ocr'] || 0,
        };

        // Cache-Control: 5 dakika
        const resp = json({ ok: true, data }, 200, env);
        const headers = new Headers(resp.headers);
        headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(resp.body, { status: resp.status, headers });
      } catch(e) {
        return json({ ok: true, data: { today:0, this_month:0, this_year:0, all_time:0 } }, 200, env);
      }
    }

    // ── Analytics collect ──────────────────────────────────────────────────
    if (path === "/api/analytics/collect" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { body = null; }
      const ev = String(body?.event || "").slice(0,64);
      if (!ev) return json({ ok:false, error:"BAD_EVENT" }, 400, env);
      const props = body?.properties && typeof body.properties==="object" ? body.properties : {};
      const tool  = typeof props.tool==="string" ? props.tool.slice(0,64) : "";
      const plan  = typeof props.plan==="string" ? props.plan.slice(0,32) : "";
      safeWriteAnalytics(env, { indexes:[url.hostname], blobs:["ev",ev,tool||"-",plan||"-"], doubles:[1] });
      return json({ ok:true }, 200, env);
    }

    // ── SSR tool pages ─────────────────────────────────────────────────────
    if (request.method === "GET" && path.startsWith("/tools/")) {
      const slug = path.replace("/tools/","").replace(".html","");
      if (TOOL_RELATIONSHIPS[slug]) {
        const origin = requireOrigin(env);
        const s      = await env.ASSETS?.fetch(request);
        if (s && s.ok) {
          let html = await s.text();
          html = html.replace("</main>", `${buildRelatedToolsHTML(origin, slug)}</main>`);
          return new Response(html, { headers: { "content-type":"text/html; charset=utf-8", "cache-control":"public, max-age=3600" } });
        }
      }
    }

    // ── Sitemap / robots ───────────────────────────────────────────────────
    if (request.method === "GET" && path === "/sitemap.xml") {
      const origin   = requireOrigin(env);
      const allTools = Object.keys(TOOL_RELATIONSHIPS);
      const today    = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }); // YYYY-MM-DD
      const urlTag   = (loc, priority = "0.8") =>
        `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
      const toolUrls = allTools.map(t => urlTag(`${origin}/tools/${t}.html`)).join("\n");
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlTag(origin+"/", "1.0")}\n${urlTag(origin+"/pricing.html", "0.9")}\n${urlTag(origin+"/login.html", "0.6")}\n${urlTag(origin+"/register.html", "0.6")}\n${toolUrls}\n</urlset>`,
        { headers: { "content-type":"application/xml; charset=utf-8","cache-control":"public, max-age=3600" } }
      );
    }
    if (request.method === "GET" && path === "/robots.txt") {
      const origin = requireOrigin(env);
      return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
        { headers: { "content-type":"text/plain; charset=utf-8","cache-control":"public, max-age=3600" } });
    }

    if (request.method === "OPTIONS") return corsPreflight(env);

    try {
      if (path === "/health") return json({ ok:true, service:"pdf-platform-worker", ts:Date.now() }, 200, env);

      // ── AUTH ──────────────────────────────────────────────────────────────
      // ── Google OAuth ──────────────────────────────────────────────────────────
      if (path === "/api/auth/oauth/google" && request.method === "GET")
        return handleGoogleStart(request, env);
      if (path === "/api/auth/oauth/google/callback" && request.method === "GET")
        return handleGoogleCallback(request, env);

      // ── Magic Link ─────────────────────────────────────────────────────────
      if (path === "/api/auth/magic/request" && request.method === "POST")
        return handleMagicLinkRequest(request, env);
      if (path === "/api/auth/magic/verify" && request.method === "POST")
        return handleMagicLinkVerify(request, env);

      if (path === "/api/auth/register" && request.method === "POST") {
        const ip  = getIp(request);
        const rl  = await rateLimit(env, `rl:auth:register:${ip}`, Number(env.RL_AUTH_REGISTER_PER_HOUR||"5"), 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const body      = await request.json().catch(()=>null);
        const email     = (body?.email||"").trim().toLowerCase();
        const password  = body?.password||"";
        const firstName = (body?.firstName||"").trim().slice(0,64);
        const lastName  = (body?.lastName||"").trim().slice(0,64);

        // Turnstile doğrulama (TURNSTILE_SECRET_KEY tanımlıysa zorunlu)
        if (env.TURNSTILE_SECRET_KEY) {
          const tsToken = body?.turnstileToken||"";
          if (!tsToken) return json({ ok:false, error:"CAPTCHA_REQUIRED", message:"Captcha doğrulaması gerekli." }, 400, env);
          try {
            const tsResp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: `secret=${encodeURIComponent(env.TURNSTILE_SECRET_KEY)}&response=${encodeURIComponent(tsToken)}&remoteip=${encodeURIComponent(ip)}`,
            });
            const tsData = await tsResp.json().catch(()=>({}));
            if (!tsData.success) return json({ ok:false, error:"CAPTCHA_FAILED", message:"Captcha doğrulaması başarısız." }, 400, env);
          } catch (_) {
            return json({ ok:false, error:"CAPTCHA_ERROR", message:"Captcha kontrol edilemedi." }, 500, env);
          }
        }

        const pwErrors = validatePassword(password);
        const emailOk  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
        if (!email || !emailOk || pwErrors.length > 0)
          return json({ ok:false, error:"BAD_REQUEST", message: pwErrors.length ? pwErrors.join(" ") : "Geçerli bir e-posta adresi girin." }, 400, env);
        if (!firstName || !lastName)
          return json({ ok:false, error:"BAD_REQUEST", message:"Ad ve soyad gerekli." }, 400, env);
        const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
        if (exists) return json({ ok:false, error:"CONFLICT", message:"Bu email zaten kayıtlı." }, 409, env);
        const { saltB64, hashB64 } = await hashPassword(password);
        const id    = crypto.randomUUID();
        const tsNow = Date.now();
        const start = Number(env.FREE_STARTING_CREDITS||env.FREE_DAILY_CREDITS||5);
        // D1 batch(): users + credits tek atomic işlemde — biri başarısız olursa ikisi de geri alınır
        try {
          await env.DB.batch([
            env.DB.prepare("INSERT INTO users (id,email,pass_salt,pass_hash,role,created_at,first_name,last_name) VALUES (?,?,?,?,'free',?,?,?)")
              .bind(id, email, saltB64, hashB64, tsNow, firstName||null, lastName||null),
            env.DB.prepare("INSERT OR IGNORE INTO credits (user_id,balance,updated_at) VALUES (?,?,?)")
              .bind(id, start, tsNow),
          ]);
        } catch (_) {
          // Eski şema fallback (first_name/last_name sütunu yoksa)
          await env.DB.batch([
            env.DB.prepare("INSERT INTO users (id,email,pass_salt,pass_hash,role,created_at) VALUES (?,?,?,?,'free',?)")
              .bind(id, email, saltB64, hashB64, tsNow),
            env.DB.prepare("INSERT OR IGNORE INTO credits (user_id,balance,updated_at) VALUES (?,?,?)")
              .bind(id, start, tsNow),
          ]);
        }
        try {
          const doObj = env.CREDIT_COUNTER.get(env.CREDIT_COUNTER.idFromName(id));
          await doObj.fetch("https://do/grant", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({amount:start}) });
        } catch {}
        try {
          const origin     = requireOrigin(env);
          const tokenPlain = randomToken(24);
          const tokenHash  = await sha256Hex(tokenPlain);
          const ttl        = Number(env.EMAIL_VERIFY_TTL_SECONDS||"86400")*1000;
          await env.DB.prepare("INSERT OR REPLACE INTO email_tokens (token_hash,user_id,email,created_at,expires_at) VALUES (?,?,?,?,?)")
            .bind(tokenHash, id, email, tsNow, tsNow+ttl).run();
          await sendEmail(env, {
            to: email,
            subject: "📄 MirPDF hesabını doğrula — linkin burada",
            html: verifyEmailHtml(origin, tokenPlain),
          });
        } catch {}
        const token = await signJWT(env, { sub:id, email, role:"free" });
        const rt = await issueRefreshToken(env, id, request);
        const cookieStr = setCookie("refresh_token", rt.token, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/api/auth",
          maxAge: Number(env.REFRESH_TTL_SECONDS||30*24*3600),
        });
        return json({ ok:true, data:{ token } }, 200, env, { "Set-Cookie": cookieStr });
      }

      if (path === "/api/auth/login" && request.method === "POST") {
        const ip = getIp(request);
        const rl = await rateLimit(env, `rl:auth:login:${ip}`, Number(env.RL_AUTH_LOGIN_PER_HOUR||"20"), 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const body     = await request.json().catch(()=>null);
        const email    = (body?.email||"").trim().toLowerCase();
        const password = body?.password||"";
        if (!email||!password) return json({ ok:false, error:"BAD_REQUEST", message:"Email/şifre gerekli." }, 400, env);

        const row = await env.DB.prepare(
          "SELECT id,email,pass_salt,pass_hash,role,email_verified,failed_login_attempts,locked_until FROM users WHERE email=?"
        ).bind(email).first();
        if (!row) {
          // Zamanlama saldırısı engeli: email bulunamasa da verifyPassword çalışmalı
          // Yoksa saldırgan yanıt süresinden kayıtlı email'leri tespit edebilir
          await verifyPassword(password, "dGVzdHNhbHQ", "dGVzdGhhc2g");
          return json({ ok:false, error:"UNAUTHORIZED", message:"Hatalı e-posta veya şifre." }, 401, env);
        }

        // Hesap devre dışı mı?
        if (row.role === "disabled")
          return json({ ok:false, error:"ACCOUNT_DISABLED", message:"Bu hesap devre dışı bırakıldı. Destek için iletişime geçin." }, 403, env);

        // Hesap kilitli mi?
        const now = Date.now();
        if (row.locked_until && now < Number(row.locked_until)) {
          const remaining = Math.ceil((Number(row.locked_until) - now) / 60000);
          return json({ ok:false, error:"ACCOUNT_LOCKED", message:`Hesabınız geçici olarak kilitlendi. ${remaining} dakika sonra tekrar deneyin.`, retryAfter: remaining * 60 }, 423, env);
        }

        const ok = await verifyPassword(password, row.pass_salt, row.pass_hash);
        if (!ok) {
          // Başarısız deneme sayacını artır
          const attempts = (Number(row.failed_login_attempts) || 0) + 1;
          const MAX_ATTEMPTS = 5;
          const LOCK_DURATIONS = [0, 0, 0, 0, 5*60*1000, 15*60*1000, 60*60*1000]; // 5dk, 15dk, 1saat
          const lockDuration = LOCK_DURATIONS[Math.min(attempts, LOCK_DURATIONS.length - 1)] || 60*60*1000;
          const lockedUntil = attempts >= MAX_ATTEMPTS ? (now + lockDuration) : null;

          await env.DB.prepare(
            "UPDATE users SET failed_login_attempts=?, locked_until=?, last_failed_login=? WHERE id=?"
          ).bind(attempts, lockedUntil, now, row.id).run();

          if (lockedUntil) {
            const minutes = Math.ceil(lockDuration / 60000);
            return json({ ok:false, error:"ACCOUNT_LOCKED", message:`Çok fazla başarısız deneme. Hesabınız ${minutes} dakika kilitlendi.` }, 423, env);
          }
          const left = MAX_ATTEMPTS - attempts;
          return json({ ok:false, error:"UNAUTHORIZED", message:`Hatalı e-posta veya şifre. ${left} deneme hakkınız kaldı.` }, 401, env);
        }

        // Başarılı giriş — sayacı sıfırla
        await env.DB.prepare(
          "UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE id=?"
        ).bind(row.id).run();

        if (!row.email_verified) {
          // Hatırlatma e-postası — kayıt tarihinden 24+ saat geçmişse (best-effort)
          try {
            const userCreated = await env.DB.prepare("SELECT created_at FROM users WHERE id=?").bind(row.id).first();
            const notifKey = `verify_reminder_${row.id}`;
            const lastNotif = await env.RATE_KV?.get(notifKey).catch(()=>null);
            if (!lastNotif && userCreated && (Date.now() - Number(userCreated.created_at)) > 24*60*60*1000) {
              const origin = requireOrigin(env);
              const tokenPlain = randomToken(24);
              const tokenHash  = await sha256Hex(tokenPlain);
              const tsNow = Date.now();
              const ttl = Number(env.EMAIL_VERIFY_TTL_SECONDS||"86400")*1000;
              await env.DB.prepare("INSERT OR REPLACE INTO email_tokens (token_hash,user_id,email,created_at,expires_at) VALUES (?,?,?,?,?)")
                .bind(tokenHash, row.id, row.email, tsNow, tsNow+ttl).run();
              await sendEmail(env, {
                to: row.email,
                subject: "📄 MirPDF — E-posta adresinizi hâlâ doğrulamadınız",
                html: verifyEmailHtml(origin, tokenPlain),
              });
              await env.RATE_KV?.put(notifKey, "1", { expirationTtl: 7*24*3600 }).catch(()=>{});
            }
          } catch (_) {}
          if (String(env.REQUIRE_EMAIL_VERIFIED||"0")==="1")
            return json({ ok:false, error:"EMAIL_NOT_VERIFIED", message:"Email doğrulanmadan giriş yapılamaz." }, 403, env);
        }

        const rememberMe = body?.remember === true;
        const ttl = rememberMe ? 30*24*3600 : undefined;
        const token     = await signJWT(env, { sub:row.id, email:row.email, role:row.role }, ttl);
        const rt        = await issueRefreshToken(env, row.id, request);
        const cookieOpts = { httpOnly:true, secure:true, sameSite:"Lax", path:"/api/auth" };
        if (rememberMe) cookieOpts.maxAge = Number(env.REFRESH_TTL_SECONDS||30*24*3600);
        const cookieStr = setCookie("refresh_token", rt.token, cookieOpts);
        return json({ ok:true, data:{ token } }, 200, env, { "Set-Cookie":cookieStr });
      }

      if (path === "/api/auth/logout" && request.method === "POST") {
        const cookies = parseCookies(request.headers.get("cookie")||"");
        const rtRaw   = cookies["refresh_token"]||"";
        if (rtRaw) {
          try {
            const rtHash = await sha256Hex(rtRaw);
            await env.DB.prepare("UPDATE refresh_tokens SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL").bind(Date.now(),rtHash).run();
          } catch {}
        }
        const hdr = request.headers.get("authorization")||"";
        const at  = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : "";
        if (at) {
          try {
            const payload = await verifyJWT(env, at);
            await env.DB.prepare("UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(Date.now(),payload.sub).run();
          } catch {}
        }
        return new Response(JSON.stringify({ ok:true }), {
          status:200, headers:{ "content-type":"application/json","set-cookie":"refresh_token=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0","cache-control":"no-store" },
        });
      }

      if (path === "/api/auth/refresh" && request.method === "POST") {
        const ip = getIp(request);
        const rl = await rateLimit(env, `rl:auth:refresh:${ip}`, Number(env.RL_AUTH_REFRESH_PER_HOUR||"60"), 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const cookies = parseCookies(request.headers.get("Cookie")||"");
        const body    = await request.json().catch(()=>null);
        const refresh = (body?.refresh_token||cookies.refresh_token||"").trim();
        if (!refresh) return json({ ok:false, error:"BAD_REQUEST", message:"refresh_token gerekli" }, 400, env);
        const hash = await sha256Hex(refresh);
        const row  = await env.DB.prepare("SELECT user_id,expires_at,revoked_at FROM refresh_tokens WHERE token_hash=? LIMIT 1").bind(hash).first();
        if (!row||row.revoked_at||Number(row.expires_at)<Date.now())
          return json({ ok:false, error:"UNAUTHORIZED", message:"Refresh token geçersiz" }, 401, env);
        const u = await env.DB.prepare("SELECT id,email,role FROM users WHERE id=?").bind(row.user_id).first();
        if (!u) return json({ ok:false, error:"UNAUTHORIZED" }, 401, env);
        const rt        = await rotateRefreshToken(env, refresh, u.id, request);
        const token     = await signJWT(env, { sub:u.id, email:u.email, role:u.role });
        const rememberMe = body?.remember === true;
        const cookieOpts = { httpOnly:true, secure:true, sameSite:"Lax", path:"/api/auth" };
        if (rememberMe) cookieOpts.maxAge = Number(env.REFRESH_TTL_SECONDS||30*24*3600);
        const cookieStr = setCookie("refresh_token", rt.token, cookieOpts);
        return json({ ok:true, data:{ token } }, 200, env, { "Set-Cookie":cookieStr });
      }

      // ── GDPR: Veri Dışa Aktarma ─────────────────────────────────────────────
      if (path === "/api/auth/export-data" && request.method === "POST") {
        const ip = getIp(request);
        const rl = await rateLimit(env, `rl:auth:export:${ip}`, 3, 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const session = await requireAuth(request, env);

        // Profil
        const user = await env.DB.prepare(
          "SELECT id,email,first_name,last_name,role,email_verified,created_at FROM users WHERE id=?"
        ).bind(session.sub).first();

        // Kredi bakiyesi
        const credits = await env.DB.prepare("SELECT balance FROM credits WHERE user_id=?").bind(session.sub).first();

        // İşlem geçmişi
        const txRows = await env.DB.prepare(
          "SELECT kind,amount,created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 500"
        ).bind(session.sub).all();

        // PDF işlem geçmişi
        const jobRows = await env.DB.prepare(
          "SELECT tool,status,output_bytes,created_at FROM jobs WHERE client_id=? ORDER BY created_at DESC LIMIT 500"
        ).bind(session.sub).all();

        const exportData = {
          exported_at: new Date().toISOString(),
          profile: {
            email:          user?.email,
            first_name:     user?.first_name,
            last_name:      user?.last_name,
            role:           user?.role,
            email_verified: !!user?.email_verified,
            member_since:   user?.created_at ? new Date(user.created_at).toISOString() : null,
          },
          credits: { balance: credits?.balance ?? 0 },
          transactions: (txRows.results||[]).map(t => ({
            kind:    t.kind,
            amount:  t.amount,
            date:    new Date(t.created_at).toISOString(),
          })),
          pdf_operations: (jobRows.results||[]).map(j => ({
            tool:        j.tool,
            status:      j.status,
            output_kb:   j.output_bytes ? Math.round(j.output_bytes/1024) : null,
            date:        new Date(j.created_at * 1000).toISOString(), // jobs.created_at is unix seconds
          })),
        };

        return new Response(JSON.stringify(exportData, null, 2), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-disposition": `attachment; filename="mirpdf-data-export-${new Date().toISOString().slice(0,10)}.json"`,
            "cache-control": "no-store",
          },
        });
      }

      if (path === "/api/auth/delete-account" && request.method === "POST") {
        const session = await requireAuth(request, env);
        const body    = await request.json().catch(() => ({}));
        const confirm = body?.confirm === true;
        const typedEmail = (body?.email || "").trim().toLowerCase();
        // Kullanıcı kendi email'ini yazarak onaylamalı
        const u = await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(session.sub).first();
        if (!u) return json({ ok: false, error: "NOT_FOUND" }, 404, env);
        if (!confirm || typedEmail !== u.email.toLowerCase()) {
          return json({ ok: false, error: "WRONG_EMAIL", message: "E-posta adresi eşleşmiyor." }, 400, env);
        }
        // Cascade: jobs, credits, transactions, email_tokens, refresh_tokens, api_keys vs. ON DELETE CASCADE ile siliniyor
        await env.DB.prepare("DELETE FROM users WHERE id=?").bind(session.sub).run();
        return json({ ok: true, deleted: true }, 200, env);
      }

      if (path === "/api/auth/request-verify" && request.method === "POST") {
        const ip = getIp(request);
        const rl = await rateLimit(env, `rl:auth:verify:${ip}`, Number(env.RL_AUTH_VERIFY_PER_HOUR||"10"), 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const body  = await request.json().catch(()=>null);
        const email = (body?.email||"").trim().toLowerCase();
        if (!email) return json({ ok:false, error:"BAD_REQUEST", message:"Email gerekli." }, 400, env);
        const u = await env.DB.prepare("SELECT id,email_verified FROM users WHERE email=?").bind(email).first();
        if (!u) return json({ ok:true, data:{ sent:true } }, 200, env);
        if (u.email_verified) return json({ ok:true, data:{ sent:false, already:true } }, 200, env);
        const origin     = requireOrigin(env);
        const tokenPlain = randomToken(24);
        const tokenHash  = await sha256Hex(tokenPlain);
        const tsNow      = Date.now();
        const ttl        = Number(env.EMAIL_VERIFY_TTL_SECONDS||"86400")*1000;
        await env.DB.prepare("INSERT OR REPLACE INTO email_tokens (token_hash,user_id,email,created_at,expires_at) VALUES (?,?,?,?,?)")
          .bind(tokenHash, u.id, email, tsNow, tsNow+ttl).run();
        const sent = await sendEmail(env, { to:email, subject:"📄 MirPDF hesabını doğrula — linkin burada", html:verifyEmailHtml(origin,tokenPlain) });
        return json({ ok:true, data:{ sent:!!sent.ok } }, 200, env);
      }

      if (path === "/api/auth/verify" && request.method === "POST") {
        const ip = getIp(request);
        const rl = await rateLimit(env, `rl:auth:verify:${ip}`, Number(env.RL_AUTH_VERIFY_PER_HOUR||"20"), 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const body       = await request.json().catch(()=>null);
        const tokenPlain = (body?.token||"").trim();
        if (!tokenPlain) return json({ ok:false, error:"BAD_REQUEST", message:"Token gerekli." }, 400, env);
        const tokenHash = await sha256Hex(tokenPlain);
        const rec = await env.DB.prepare("SELECT user_id,expires_at FROM email_tokens WHERE token_hash=?").bind(tokenHash).first();
        if (!rec) return json({ ok:false, error:"INVALID_TOKEN" }, 400, env);
        if (Date.now() > Number(rec.expires_at)) {
          await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash=?").bind(tokenHash).run();
          return json({ ok:false, error:"EXPIRED_TOKEN" }, 400, env);
        }
        await env.DB.prepare("UPDATE users SET email_verified=1 WHERE id=?").bind(rec.user_id).run();
        await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash=?").bind(tokenHash).run();
        // Kullanıcı bilgilerini al — JWT + hoş geldin e-postası için
        const verifiedUser = await env.DB.prepare("SELECT id,email,role,first_name FROM users WHERE id=?").bind(rec.user_id).first().catch(()=>null);
        // Hoş geldin e-postası (doğrulama sonrası, best-effort)
        try {
          if (verifiedUser?.email) {
            const origin = requireOrigin(env);
            await sendEmail(env, {
              to: verifiedUser.email,
              subject: "🎉 Hesabın hazır — MirPDF'e hoş geldin!",
              html: welcomeHtml(origin, { firstName: verifiedUser?.first_name || null }),
            });
          }
        } catch (_) {}
        // Doğrulama sonrası JWT ver — kullanıcı otomatik giriş yapar
        let verifyToken = null;
        try {
          if (verifiedUser) {
            verifyToken = await signJWT(env, { sub: verifiedUser.id, email: verifiedUser.email, role: verifiedUser.role });
          }
        } catch (_) {}
        return json({ ok:true, data: verifyToken ? { token: verifyToken } : {} }, 200, env);
      }

      if (path === "/api/auth/forgot" && request.method === "POST") {
        const ip = getIp(request);
        const rl = await rateLimit(env, `rl:auth:forgot:${ip}`, Number(env.RL_AUTH_FORGOT_PER_HOUR||"10"), 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const body  = await request.json().catch(()=>null);
        const email = (body?.email||"").trim().toLowerCase();
        if (!email) return json({ ok:false, error:"BAD_REQUEST", message:"Email gerekli." }, 400, env);
        const u = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
        if (!u) return json({ ok:true, data:{ sent:true } }, 200, env);
        const origin     = requireOrigin(env);
        const tokenPlain = randomToken(24);
        const tokenHash  = await sha256Hex(tokenPlain);
        const tsNow      = Date.now();
        const ttl        = Number(env.RESET_TTL_SECONDS||"3600")*1000;
        await env.DB.prepare("INSERT OR REPLACE INTO password_resets (token_hash,user_id,email,created_at,expires_at) VALUES (?,?,?,?,?)")
          .bind(tokenHash, u.id, email, tsNow, tsNow+ttl).run();
        await sendEmail(env, { to:email, subject:"MirPDF şifre sıfırlama — linkin burada", html:resetPasswordHtml(origin,tokenPlain) });
        return json({ ok:true, data:{ sent:true } }, 200, env);
      }

      if (path === "/api/auth/reset" && request.method === "POST") {
        const ip = getIp(request);
        const rl = await rateLimit(env, `rl:auth:reset:${ip}`, Number(env.RL_AUTH_RESET_PER_HOUR||"20"), 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const body        = await request.json().catch(()=>null);
        const tokenPlain  = (body?.token||"").trim();
        const newPassword = body?.password||"";
        const pwErrors    = validatePassword(String(newPassword));
        if (!tokenPlain||pwErrors.length>0)
          return json({ ok:false, error:"BAD_REQUEST", message:pwErrors.length?pwErrors.join(" "):"Token gerekli." }, 400, env);
        const tokenHash = await sha256Hex(tokenPlain);
        const rec = await env.DB.prepare("SELECT user_id,expires_at,used_at FROM password_resets WHERE token_hash=?").bind(tokenHash).first();
        if (!rec) return json({ ok:false, error:"INVALID_TOKEN" }, 400, env);
        if (rec.used_at) return json({ ok:false, error:"TOKEN_USED" }, 400, env);
        if (Date.now() > Number(rec.expires_at)) {
          await env.DB.prepare("DELETE FROM password_resets WHERE token_hash=?").bind(tokenHash).run();
          return json({ ok:false, error:"EXPIRED_TOKEN" }, 400, env);
        }
        // Eski şifre == yeni şifre kontrolü
        const isSame = await verifyPassword(newPassword, rec.old_salt || "", rec.old_hash || "").catch(() => false);
        // (best-effort: mevcut hash'i al)
        const curUser = await env.DB.prepare("SELECT pass_salt,pass_hash,email FROM users WHERE id=?").bind(rec.user_id).first();
        if (curUser) {
          const sameAsOld = await verifyPassword(newPassword, curUser.pass_salt, curUser.pass_hash);
          if (sameAsOld) return json({ ok:false, error:"SAME_PASSWORD", message:"Yeni şifre eski şifreyle aynı olamaz." }, 400, env);
        }

        const { saltB64, hashB64 } = await hashPassword(newPassword);
        await env.DB.prepare("UPDATE users SET pass_salt=?,pass_hash=?,updated_at=? WHERE id=?").bind(saltB64,hashB64,Date.now(),rec.user_id).run();
        await env.DB.prepare("UPDATE password_resets SET used_at=? WHERE token_hash=?").bind(Date.now(),tokenHash).run();

        // Şifre değişikliği bildirim e-postası (güvenlik uyarısı)
        try {
          if (curUser?.email) {
            const origin = requireOrigin(env);
            await sendEmail(env, {
              to: curUser.email,
              subject: "MirPDF şifreniz değiştirildi",
              html: passwordChangedHtml(origin),
            });
          }
        } catch (_) {}

        return json({ ok:true }, 200, env);
      }

      if (path === "/api/auth/change-password" && request.method === "POST") {
        const ip = getIp(request);
        const rl = await rateLimit(env, `rl:auth:change:${ip}`, Number(env.RL_AUTH_CHANGE_PER_HOUR||"20"), 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const user     = await requireAuth(request, env);
        const body     = await request.json().catch(()=>null);
        const current  = body?.currentPassword||"";
        const next     = body?.newPassword||"";
        const pwErrors = validatePassword(String(next));
        if (!current||pwErrors.length>0)
          return json({ ok:false, error:"BAD_REQUEST", message:pwErrors.length?pwErrors.join(" "):"Mevcut şifre gerekli." }, 400, env);
        const u = await env.DB.prepare("SELECT id,pass_salt,pass_hash FROM users WHERE id=?1").bind(user.sub).first();
        if (!u) return json({ ok:false, error:"UNAUTHORIZED" }, 401, env);
        const ok = await verifyPassword(current, u.pass_salt, u.pass_hash);
        if (!ok) return json({ ok:false, error:"INVALID_CREDENTIALS", message:"Mevcut şifre hatalı." }, 403, env);

        // Yeni şifre eski şifreyle aynı olamaz
        const sameAsOld = await verifyPassword(next, u.pass_salt, u.pass_hash);
        if (sameAsOld) return json({ ok:false, error:"SAME_PASSWORD", message:"Yeni şifre eski şifreyle aynı olamaz." }, 400, env);

        const { saltB64, hashB64 } = await hashPassword(next);
        await env.DB.prepare("UPDATE users SET pass_salt=?1,pass_hash=?2,updated_at=?3 WHERE id=?4").bind(saltB64,hashB64,Date.now(),user.sub).run();

        // Şifre değişince mevcut JWT hariç TÜM refresh token'ları iptal et
        await env.DB.prepare(
          "UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL"
        ).bind(Date.now(), user.sub).run();

        // Bildirim e-postası
        try {
          const uRow = await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(user.sub).first();
          if (uRow?.email) {
            const origin = requireOrigin(env);
            await sendEmail(env, {
              to: uRow.email,
              subject: "MirPDF şifreniz değiştirildi",
              html: passwordChangedHtml(origin),
            });
          }
        } catch (_) {}

        return json({ ok:true, sessionsRevoked:true }, 200, env);
      }

      // ── /api/me ───────────────────────────────────────────────────────────
      if (path === "/api/me" && request.method === "GET") {
        const session = await requireAuth(request, env);
        let balance = null;
        let credits = null;
        try {
          const doObj = env.CREDIT_COUNTER.get(env.CREDIT_COUNTER.idFromName(session.sub));
          const r = await doObj.fetch("https://do/status");
          const j = await r.json().catch(()=>({}));
          const currentCredits = j?.data?.credits ?? j?.credits ?? j?.data?.balance ?? j?.balance ?? null;
          balance = currentCredits;
          credits = currentCredits;
        } catch {}
        const row = await env.DB.prepare(
          "SELECT role,email_verified,stripe_customer_id,first_name,last_name FROM users WHERE id=?"
        ).bind(session.sub).first().catch(()=>null);
        return json({ ok:true, data:{
          ...session,
          role: row?.role||session.role,
          email_verified: !!row?.email_verified,
          stripe_customer_id: row?.stripe_customer_id||null,
          first_name: row?.first_name||null,
          last_name:  row?.last_name||null,
          balance,
          credits,
        }}, 200, env);
      }

      // ── Profil güncelleme ─────────────────────────────────────────────────
      if (path === "/api/profile" && request.method === "PATCH") {
        const session = await requireAuth(request, env);
        const body = await request.json().catch(()=>({}));
        const firstName = (body?.firstName||"").trim().slice(0,64);
        const lastName  = (body?.lastName||"").trim().slice(0,64);
        if (!firstName && !lastName)
          return json({ ok:false, error:"BAD_REQUEST", message:"En az bir alan gerekli." }, 400, env);
        const updates = [];
        const binds   = [];
        if (firstName) { updates.push("first_name=?"); binds.push(firstName); }
        if (lastName)  { updates.push("last_name=?");  binds.push(lastName); }
        binds.push(session.sub);
        await env.DB.prepare(`UPDATE users SET ${updates.join(",")} WHERE id=?`).bind(...binds).run();
        return json({ ok:true }, 200, env);
      }

      // ── E-posta değiştirme (yeni adrese doğrulama gönder) ─────────────────
      if (path === "/api/auth/change-email" && request.method === "POST") {
        const ip = getIp(request);
        const rl = await rateLimit(env, `rl:auth:change-email:${ip}`, 5, 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const session  = await requireAuth(request, env);
        const body     = await request.json().catch(()=>({}));
        const newEmail = (body?.newEmail||"").trim().toLowerCase();
        const password = body?.password||"";
        if (!newEmail || !newEmail.includes("@"))
          return json({ ok:false, error:"BAD_REQUEST", message:"Geçerli bir e-posta gerekli." }, 400, env);
        // Şifre doğrula
        const u = await env.DB.prepare("SELECT pass_salt,pass_hash FROM users WHERE id=?").bind(session.sub).first();
        if (!u) return json({ ok:false, error:"UNAUTHORIZED" }, 401, env);
        const pwOk = await verifyPassword(password, u.pass_salt, u.pass_hash);
        if (!pwOk) return json({ ok:false, error:"INVALID_CREDENTIALS", message:"Şifre hatalı." }, 403, env);
        // Yeni e-posta başka hesapta kullanılıyor mu?
        const exists = await env.DB.prepare("SELECT id FROM users WHERE email=? AND id!=?").bind(newEmail,session.sub).first();
        if (exists) return json({ ok:false, error:"CONFLICT", message:"Bu e-posta zaten kullanımda." }, 409, env);
        // Doğrulama tokeni oluştur - email_tokens tablosunu yeniden kullan
        const origin     = requireOrigin(env);
        const tokenPlain = randomToken(24);
        const tokenHash  = await sha256Hex(tokenPlain);
        const tsNow      = Date.now();
        const ttl        = 24 * 60 * 60 * 1000;
        // Pending e-posta değişikliğini token metadata'sında sakla
        await env.DB.prepare(
          "INSERT OR REPLACE INTO email_tokens (token_hash,user_id,email,created_at,expires_at) VALUES (?,?,?,?,?)"
        ).bind(tokenHash, session.sub, newEmail, tsNow, tsNow+ttl).run();
        await sendEmail(env, {
          to: newEmail,
          subject: "📄 MirPDF — Yeni e-posta adresinizi doğrulayın",
          html: verifyEmailChangeHtml(origin, tokenPlain),
        });
        return json({ ok:true, data:{ sent:true } }, 200, env);
      }

      // ── E-posta değişikliği doğrulama (token'ı onayla) ───────────────────
      if (path === "/api/auth/confirm-email-change" && request.method === "POST") {
        const ip = getIp(request);
        const rl = await rateLimit(env, `rl:auth:confirm-email:${ip}`, 10, 3600);
        if (!rl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:rl.retryAfter }, 429, env);
        const body       = await request.json().catch(()=>({}));
        const tokenPlain = (body?.token||"").trim();
        if (!tokenPlain) return json({ ok:false, error:"BAD_REQUEST" }, 400, env);
        const tokenHash = await sha256Hex(tokenPlain);
        const rec = await env.DB.prepare("SELECT user_id,email,expires_at FROM email_tokens WHERE token_hash=?").bind(tokenHash).first();
        if (!rec) return json({ ok:false, error:"INVALID_TOKEN" }, 400, env);
        if (Date.now() > Number(rec.expires_at)) {
          await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash=?").bind(tokenHash).run();
          return json({ ok:false, error:"EXPIRED_TOKEN" }, 400, env);
        }
        // E-posta güncelle, doğrulanmış say
        await env.DB.prepare("UPDATE users SET email=?,email_verified=1 WHERE id=?").bind(rec.email,rec.user_id).run();
        await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash=?").bind(tokenHash).run();
        return json({ ok:true, data:{ email: rec.email } }, 200, env);
      }

      // ── Aktif oturumlar (cihaz listesi) ───────────────────────────────────
      if (path === "/api/auth/sessions" && request.method === "GET") {
        const session = await requireAuth(request, env);
        const rows = await env.DB.prepare(
          "SELECT id,ip,user_agent,created_at,expires_at FROM refresh_tokens WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 20"
        ).bind(session.sub, Date.now()).all();
        const sessions = (rows?.results||[]).map(r => ({
          id:         r.id,
          ip:         r.ip||"—",
          device:     parseUA(r.user_agent||""),
          created_at: r.created_at,
          expires_at: r.expires_at,
        }));
        return json({ ok:true, data:{ sessions } }, 200, env);
      }

      // ── Belirli oturumu kapat (uzaktan revoke) ────────────────────────────
      if (path.startsWith("/api/auth/sessions/") && request.method === "DELETE") {
        const session   = await requireAuth(request, env);
        const sessionId = path.replace("/api/auth/sessions/","");
        if (!sessionId) return json({ ok:false, error:"BAD_REQUEST" }, 400, env);
        await env.DB.prepare(
          "UPDATE refresh_tokens SET revoked_at=? WHERE id=? AND user_id=?"
        ).bind(Date.now(), sessionId, session.sub).run();
        return json({ ok:true }, 200, env);
      }

      // ── Tüm diğer oturumları kapat ────────────────────────────────────────
      if (path === "/api/auth/sessions/revoke-all" && request.method === "POST") {
        const session = await requireAuth(request, env);
        await env.DB.prepare(
          "UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL"
        ).bind(Date.now(), session.sub).run();
        return json({ ok:true }, 200, env);
      }

      // ── Credits ───────────────────────────────────────────────────────────
      if (path === "/api/credits/status" && request.method === "GET") {
        const { clientId, setCookie:sc } = await getClientId(request, env);
        const r = await creditDO(env,clientId).fetch("https://do/status");
        const j = await r.json().catch(()=>({}));
        return json({ ok:true, remaining:Number(j?.data?.credits??0) }, 200, env, sc?{"set-cookie":sc}:undefined);
      }
      if (path === "/api/credits/balance" && request.method === "GET") {
        const { clientId, setCookie:sc } = await getClientId(request, env);
        const r = await creditDO(env,clientId).fetch("https://do/status");
        const j = await r.json().catch(()=>({}));
        return json({ ok:true, remaining:Number(j?.data?.credits??0) }, 200, env, sc?{"set-cookie":sc}:undefined);
      }

      if (path === "/api/credits/consume" && request.method === "POST") {
        const { clientId, setCookie:sc } = await getClientId(request, env);
        // B1 FIX: session opsiyonel — giriş yapmış kullanıcıda low-credit e-postası için
        let session = null;
        try { session = await requireAuth(request, env); } catch {}
        const body  = await request.json().catch(()=>({}));
        const tool  = String(body?.tool||"");
        const opId  = body?.opId ? String(body.opId) : null;
        const dObj  = creditDO(env,clientId);
        const extra = sc?{"set-cookie":sc}:undefined;
        // cost: DO kendi tablosunu (CreditCounter.COSTS) kullanır — body.cost fallback
        // tabloda olmayan araçlar için TOOL_COSTS'tan al, o da yoksa 1
        const clientCost = TOOL_COSTS[tool] ?? 1;
        if (opId) {
          const lr = await dObj.fetch("https://do/lock-op",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({opId,ttlMs:10*60_000})});
          const lj = await lr.json().catch(()=>({}));
          if (!lr.ok||!lj.ok) return json({ ok:false, error:{code:"OP_PENDING"} }, 409, env, extra);
        }
        const cr = await dObj.fetch("https://do/consume",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tool,cost:clientCost,opId})});
        const cj = await cr.json().catch(()=>({}));
        if (!cr.ok||!cj.ok) return json({ ok:false, error:{code:"CREDIT_EXHAUSTED"} }, 402, env, extra);
        const sr = await dObj.fetch("https://do/status");
        const sj = await sr.json().catch(()=>({}));
        const remaining = Number(sj?.data?.credits??0);
        // Kredi bitmek üzere bildirimi (1 kredi kaldıysa, giriş yapmış kullanıcıya)
        if (remaining === 1) {
          try {
            const sessionRow = session?.sub
              ? await env.DB.prepare("SELECT email, role FROM users WHERE id=?").bind(session.sub).first()
              : null;
            const notifKey = `low_credit_notif_${session?.sub || clientId}`;
            const lastNotif = await env.RATE_KV?.get(notifKey).catch(()=>null);
            if (sessionRow?.email && sessionRow.role !== "pro" && !lastNotif) {
              const origin = requireOrigin(env);
              await sendEmail(env, {
                to: sessionRow.email,
                subject: "⚡ MirPDF'de 1 kredin kaldı",
                html: lowCreditsHtml(origin, { remaining: 1 }),
              });
              // 7 gün spam yapma
              await env.RATE_KV?.put(notifKey, "1", { expirationTtl: 7 * 24 * 3600 }).catch(()=>{});
            }
          } catch (_) {}
        }
        return json({ ok:true, remaining }, 200, env, extra);
      }

      if (path === "/api/credits/finalize" && request.method === "POST") {
        const { clientId, setCookie:sc } = await getClientId(request, env);
        const body = await request.json().catch(()=>({}));
        const opId = body?.opId ? String(body.opId) : null;
        if (!opId) return json({ ok:false, error:{code:"BAD_OPID"} }, 400, env, sc?{"set-cookie":sc}:undefined);
        const dObj = creditDO(env,clientId);
        await dObj.fetch("https://do/finalize-op",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({opId,ok:true})});
        const sr = await dObj.fetch("https://do/status"); const sj = await sr.json().catch(()=>({}));
        return json({ ok:true, remaining:Number(sj?.data?.credits??0) }, 200, env, sc?{"set-cookie":sc}:undefined);
      }

      if (path === "/api/credits/refund" && request.method === "POST") {
        const { clientId, setCookie:sc } = await getClientId(request, env);
        const body = await request.json().catch(()=>({}));
        const tool = String(body?.tool||"");
        const opId = body?.opId ? String(body.opId) : null;
        const jobId = String(body?.jobId || "").trim();
        if (!jobId) return json({ ok:false, error:{code:"JOB_ID_REQUIRED"} }, 400, env, sc?{"set-cookie":sc}:undefined);
        const job = await env.DB.prepare(
          "SELECT job_id, client_id, tool, cost, status FROM jobs WHERE job_id=?1 AND client_id=?2"
        ).bind(jobId, clientId).first().catch(()=>null);
        if (!job) return json({ ok:false, error:{code:"NOT_FOUND"} }, 404, env, sc?{"set-cookie":sc}:undefined);
        if (String(job.status || "") !== "failed") {
          return json({ ok:false, error:{code:"REFUND_NOT_ALLOWED"} }, 409, env, sc?{"set-cookie":sc}:undefined);
        }
        const dObj = creditDO(env,clientId);
        await dObj.fetch("https://do/refund",{
          method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({ tool: job?.tool || tool, cost: Number(job?.cost || 1), jobId }),
        });
        if (opId) await dObj.fetch("https://do/finalize-op",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({opId,ok:false})});
        const sr = await dObj.fetch("https://do/status"); const sj = await sr.json().catch(()=>({}));
        return json({ ok:true, remaining:Number(sj?.data?.credits??0) }, 200, env, sc?{"set-cookie":sc}:undefined);
      }

      if (path === "/api/credits/history" && request.method === "GET") {
        const session = await requireAuth(request, env);
        const rows = await env.DB.prepare("SELECT id,kind,amount,stripe_session_id,created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(session.sub).all();
        return json({ ok:true, data:{ items:rows.results||[] } }, 200, env);
      }

      // ── Billing ───────────────────────────────────────────────────────────
      if (path === "/api/billing/plans" && request.method === "GET") {
        return await edgeCachePublicGET(request, env, ctx, { ttl:3600, swr:86400 }, async () => {
          const plans = [
            { id:"credits100",            type:"pack", credits:100,  priceId:isStripePriceConfigured(env.STRIPE_PRICE_CREDITS100) ? env.STRIPE_PRICE_CREDITS100 : null },
            { id:"credits500",            type:"pack", credits:500,  priceId:isStripePriceConfigured(env.STRIPE_PRICE_CREDITS500) ? env.STRIPE_PRICE_CREDITS500 : null },
            { id:"sub_basic",             type:"sub",  annual:false, creditsPerMonth:Number(env.SUB_BASIC_MONTHLY_CREDITS||"2000"), priceId:isStripePriceConfigured(env.STRIPE_SUB_PRICE_BASIC) ? env.STRIPE_SUB_PRICE_BASIC : null },
            { id:"sub_basic_annual",      type:"sub",  annual:true,  creditsPerMonth:Number(env.SUB_BASIC_MONTHLY_CREDITS||"2000"), priceId:isStripePriceConfigured(env.STRIPE_SUB_PRICE_BASIC_ANNUAL) ? env.STRIPE_SUB_PRICE_BASIC_ANNUAL : null },
            { id:"sub_pro",               type:"sub",  annual:false, creditsPerMonth:Number(env.SUB_PRO_MONTHLY_CREDITS||"10000"),   priceId:isStripePriceConfigured(env.STRIPE_SUB_PRICE_PRO) ? env.STRIPE_SUB_PRICE_PRO : null },
            { id:"sub_pro_annual",        type:"sub",  annual:true,  creditsPerMonth:Number(env.SUB_PRO_MONTHLY_CREDITS||"10000"),   priceId:isStripePriceConfigured(env.STRIPE_SUB_PRICE_PRO_ANNUAL) ? env.STRIPE_SUB_PRICE_PRO_ANNUAL : null },
            { id:"sub_muhasebeci",        type:"sub",  annual:false, creditsPerMonth:Number(env.SUB_PRO_MONTHLY_CREDITS||"10000"),   priceId:isStripePriceConfigured(env.STRIPE_SUB_PRICE_MUHASEBECI) ? env.STRIPE_SUB_PRICE_MUHASEBECI : null },
            { id:"sub_muhasebeci_annual", type:"sub",  annual:true,  creditsPerMonth:Number(env.SUB_PRO_MONTHLY_CREDITS||"10000"),   priceId:isStripePriceConfigured(env.STRIPE_SUB_PRICE_MUHASEBECI_ANNUAL) ? env.STRIPE_SUB_PRICE_MUHASEBECI_ANNUAL : null },
          ];
          return json({ ok:true, data:{ plans } }, 200, env);
        });
      }
      if (path === "/api/billing/checkout" && request.method === "POST") {
        const session     = await requireAuth(request, env);
        const body        = await request.json().catch(()=>({}));
        const plan        = (body?.plan||"basic").toLowerCase();
        const attribution = body?.attribution && typeof body.attribution==="object" ? body.attribution : null;
        try {
          const checkout = await createCheckoutSession(env, { userId:session.sub, email:session.email, plan, origin:url.origin, attribution });
          return json({ ok:true, data:checkout }, 200, env);
        } catch (err) {
          const message = String(err?.message || "Ödeme başlatılamadı.");
          const status = /Desteklenmeyen plan|henüz aktif değil/i.test(message) ? 400 : 502;
          const code = status === 400 ? "PLAN_UNAVAILABLE" : "CHECKOUT_FAILED";
          return json({ ok:false, error:code, message }, status, env);
        }
      }
      if (path === "/api/billing/webhook" && request.method === "POST") return handleStripeWebhook(request, env);
      if (path === "/api/billing/portal" && request.method === "POST") {
        const session    = await requireAuth(request, env);
        const row        = await env.DB.prepare("SELECT stripe_customer_id FROM users WHERE id=?").bind(session.sub).first();
        const customerId = row?.stripe_customer_id;
        if (!customerId) return json({ ok:false, error:"NO_SUBSCRIPTION", message:"Aktif abonelik bulunamadı." }, 404, env);
        if (!env.STRIPE_SECRET_KEY) return json({ ok:false, error:"CONFIG" }, 500, env);
        const origin = requireOrigin(env);
        const resp   = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
          method:"POST", headers:{"Authorization":`Bearer ${env.STRIPE_SECRET_KEY}`,"Content-Type":"application/x-www-form-urlencoded"},
          body:`customer=${encodeURIComponent(customerId)}&return_url=${encodeURIComponent(origin+"/account")}`,
        });
        const j = await resp.json().catch(()=>null);
        if (!resp.ok) return json({ ok:false, error:"STRIPE_ERROR", message:j?.error?.message||"Portal açılamadı." }, 502, env);
        return json({ ok:true, data:{ url:j.url } }, 200, env);
      }

      // ── Admin session auth ────────────────────────────────────────────────
      if (path === "/api/admin/auth" && request.method === "POST") {
        const _adminIp = getIp(request);
        // Katman 1: IP başına saatte 10 deneme
        const _adminRl = await rateLimit(env, `rl:admin:auth:${_adminIp}`, 10, 3600);
        if (!_adminRl.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:_adminRl.retryAfter }, 429, env);
        // Katman 2: Global saatte 30 deneme — botnet/proxy saldırısı engeli
        const _adminRlGlobal = await rateLimit(env, `rl:admin:auth:global`, 30, 3600);
        if (!_adminRlGlobal.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:_adminRlGlobal.retryAfter }, 429, env);
        // Katman 3: UA hash başına saatte 5 deneme — aynı botun farklı IP'lerden gelmesi
        const _adminUa = await sha256Hex((request.headers.get("user-agent") || "").slice(0, 200));
        const _adminRlUa = await rateLimit(env, `rl:admin:auth:ua:${_adminUa}`, 5, 3600);
        if (!_adminRlUa.ok) return json({ ok:false, error:"RATE_LIMIT", retryAfter:_adminRlUa.retryAfter }, 429, env);
        return handleAdminAuth(request, env);
      }

      // ── Tool upload ───────────────────────────────────────────────────────
      if ((path==="/api/compress"||path==="/api/pdf-sikistir") && request.method==="POST")
        return handleToolUpload(request,env,ctx,{tool:"compress-strong",mapOptions:(f)=>({compression_level:f.get("level")||"recommended"})});
      if (path==="/api/pdf-to-word" && request.method==="POST")
        return handleToolUpload(request,env,ctx,{tool:"pdf-to-word",mapOptions:(f)=>({format:f.get("format")||"docx"})});
      if (path==="/api/ocr" && request.method==="POST")
        return handleToolUpload(request,env,ctx,{tool:"ocr",mapOptions:(f)=>({lang:f.get("lang")||"tur+eng"})});

      // ── Word / Excel / PPT → PDF ───────────────────────────
      if (path==="/api/word-to-pdf" && request.method==="POST")
        return handleToolUpload(request,env,ctx,{tool:"word-to-pdf",mapOptions:(_form,file)=>({ filename:file?.name||"", mimeType:file?.type||"" })});
      if (path==="/api/excel-to-pdf" && request.method==="POST")
        return handleToolUpload(request,env,ctx,{tool:"excel-to-pdf",mapOptions:(_form,file)=>({ filename:file?.name||"", mimeType:file?.type||"" })});
      if (path==="/api/ppt-to-pdf" && request.method==="POST")
        return handleToolUpload(request,env,ctx,{tool:"ppt-to-pdf",mapOptions:(_form,file)=>({ filename:file?.name||"", mimeType:file?.type||"" })});

      // ── Batch ──────────────────────────────────────────────────────────────
      if (path==="/api/batch-submit" && request.method==="POST") return handleBatchSubmit(request,env,ctx);
      const mBatchStatus = path.match(/^\/api\/batches\/([0-9a-f-]{36})\/status$/);
      if (mBatchStatus && request.method==="GET") return handleBatchStatus(request,env,mBatchStatus[1]);
      const mBatchZip = path.match(/^\/api\/batches\/([0-9a-f-]{36})\/zip$/);
      if (mBatchZip && request.method==="GET") return handleBatchZip(request,env,mBatchZip[1]);

      // ── Analytics track ───────────────────────────────────────────────────
      if (path==="/api/track" && request.method==="POST") return handleTrack(request,env);

      // ── Contact form ──────────────────────────────────────────────────────
      if (path==="/api/contact" && request.method==="POST") return handleContact(request,env);

      // u2500u2500 Newsletter u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500
      if (path === "/api/newsletter/subscribe" && request.method === "POST") return handleNewsletterSubscribe(request, env);
      if (path === "/api/newsletter/unsubscribe" && (request.method === "GET" || request.method === "POST")) return handleNewsletterUnsubscribe(request, env);
      // u2500u2500 Referral u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500
      if (path === "/api/referral/my" && request.method === "GET") return handleReferralMy(request, env);
      if (path === "/api/referral/apply" && request.method === "POST") return handleReferralApply(request, env);
      // u2500u2500 Push u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500
      if (path === "/api/push/subscribe" && request.method === "POST") return handlePushSubscribe(request, env);
      if (path === "/api/push/unsubscribe" && request.method === "POST") return handlePushUnsubscribe(request, env);
      if (path === "/api/push/send" && request.method === "POST") return handlePushSend(request, env);
      // u2500u2500 Webhooks u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500
      if (path === "/api/webhooks" && request.method === "GET") return handleListWebhooks(request, env);
      if (path === "/api/webhooks" && request.method === "POST") return handleCreateWebhook(request, env);
      { const mW=path.match(/^\/api\/webhooks\/([0-9a-f-]{36})$/); if(mW&&request.method==="DELETE") return handleDeleteWebhook(request,env,mW[1]); }
      { const mW=path.match(/^\/api\/webhooks\/([0-9a-f-]{36})\/toggle$/); if(mW&&request.method==="POST") return handleToggleWebhook(request,env,mW[1]); }
      { const mW=path.match(/^\/api\/webhooks\/([0-9a-f-]{36})\/test$/); if(mW&&request.method==="POST") return handleTestWebhook(request,env,mW[1]); }

      // ── Processor temp endpoints ─────────────────────────────────────────
      if (path==="/api/temp-download" && request.method==="GET") {
        const auth = (request.headers.get("authorization")||"").replace("Bearer ","").trim();
        if (!timingSafeEq(auth,env.PROCESSOR_SECRET||"")) return json({ok:false,error:"UNAUTHORIZED"},401,env);
        const key = (url.searchParams.get("key")||"").trim();
        if (!key||!/^((uploads|outputs|jobs)\/.+)$/.test(key)) return json({ok:false,error:"BAD_KEY"},400,env);
        const obj = await env.PDF_R2.get(key);
        if (!obj) return json({ok:false,error:"NOT_FOUND"},404,env);
        const headers = new Headers({ "cache-control":"no-store" });
        obj.writeHttpMetadata(headers);
        if (!headers.get("content-type")) headers.set("content-type","application/octet-stream");
        return new Response(obj.body,{headers});
      }
      if (path==="/api/temp-upload" && (request.method==="PUT"||request.method==="POST")) {
        const auth = (request.headers.get("authorization")||"").replace("Bearer ","").trim();
        if (!timingSafeEq(auth,env.PROCESSOR_SECRET||"")) return json({ok:false,error:"UNAUTHORIZED"},401,env);
        const key = (url.searchParams.get("key")||"").trim();
        if (!key||!/^(outputs|jobs)\/.+/.test(key)) return json({ok:false,error:"BAD_KEY"},400,env);
        const contentType = request.headers.get("content-type") || "application/octet-stream";
        await env.PDF_R2.put(key,request.body,{ httpMetadata:{ contentType } });
        return json({ok:true},200,env);
      }

      // ── Jobs ──────────────────────────────────────────────────────────────
      if (path==="/api/jobs/submit" && request.method==="POST") return handleJobSubmit(request,env,ctx);
      if ((path==="/api/jobs/callback"||path==="/api/job/update") && request.method==="POST") return handleProcessorCallback(request,env);

      const mLegacyJob = path.match(/^\/api\/job\/([0-9a-f-]{36})$/);
      if (mLegacyJob && request.method==="GET") {
        const jobId = mLegacyJob[1];
        const res   = await handleJobStatus(request,env,jobId);
        try {
          const data = await res.clone().json();
          return json({jobId:data.job_id||jobId,status:data.status,error:data.error||null,download_url:data.download_url||null},res.status,{"cache-control":"no-store"});
        } catch { return res; }
      }

      const mStatus = path.match(/^\/api\/jobs\/([0-9a-f-]{36})\/status$/);
      if (mStatus && request.method==="GET") return handleJobStatus(request,env,mStatus[1]);

      const mResult = path.match(/^\/api\/jobs\/([0-9a-f-]{36})\/result$/);
      if (mResult && request.method==="GET") return handleJobResult(request,env,ctx,mResult[1],edgeCachePublicGET,corsHeaders);

      // ── Admin API ─────────────────────────────────────────────────────────
      if (path.startsWith("/api/admin/")) return handleAdmin(request,env,path);

      // ── Jobs history (authenticated user) ───────────────────────────────
      if (path === "/api/jobs/history" && request.method === "GET") {
        const session = await requireAuth(request, env);
        const limit   = Math.min(Number(url.searchParams.get("limit") || "20"), 50);
        const { results } = await env.DB.prepare(
          "SELECT job_id, tool, status, output_bytes, error_message, created_at, updated_at " +
          "FROM jobs WHERE client_id=? ORDER BY created_at DESC LIMIT ?"
        ).bind(session.sub, limit).all();
        // Her tamamlanmış iş için imzalı download_url üret
        const DOWNLOAD_TTL = 3600;
        const withUrls = await Promise.all((results || []).map(async (row) => {
          if (row.status !== "done") return { ...row, download_url: null };
          try {
            const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL;
            const t   = await createDownloadToken(env, { jobId: row.job_id, clientId: session.sub, exp });
            return { ...row, download_url: `/api/jobs/${encodeURIComponent(row.job_id)}/result?t=${encodeURIComponent(t)}` };
          } catch { return { ...row, download_url: null }; }
        }));
        return json({ ok: true, data: withUrls }, 200, env);
      }

      // ── Developer API Keys ────────────────────────────────────────────────
      if (path === "/api/developer/keys") {
        const session = await requireAuth(request, env).catch(() => null);
        if (!session) return json({ ok: false, error: "Giriş yapmanız gerekiyor." }, 401, env);
        if (request.method === "GET")  return handleListKeys(env, session);
        if (request.method === "POST") return handleCreateKey(request, env, session);
        return json({ ok: false, error: "Method not allowed" }, 405, env);
      }
      const mRevokeKey = path.match(/^\/api\/developer\/keys\/([0-9a-f-]{36})$/);
      if (mRevokeKey && request.method === "DELETE") {
        const session = await requireAuth(request, env).catch(() => null);
        if (!session) return json({ ok: false, error: "Giriş yapmanız gerekiyor." }, 401, env);
        return handleRevokeKey(env, session, mRevokeKey[1]);
      }

      return json({ ok:false, error:"NOT_FOUND" }, 404, env);
    } catch (err) {
      return json({ ok:false, error:"INTERNAL_ERROR", message:String(err?.message||err) }, 500, env);
    }
  },
};
