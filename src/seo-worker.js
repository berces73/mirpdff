// ============================================================
// src/seo-worker.js — Worker-side SEO page render + D1 CRUD
// ============================================================

import { requireOrigin } from "./helpers.js";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSeoPage(page, origin, shouldNoindex = false) {
  const title = esc(page.title || "");
  const desc = esc(page.description || "");
  const h1 = esc(page.h1 || page.title || "");
  const tool = esc(page.tool_name || "");
  const content = String(page.content || "");
  const canonical = `${origin}/seo/${encodeURIComponent(page.slug)}`;
  const schemaJson = page.schema_json ? String(page.schema_json).replace(/<\/script/gi, "<\\/script") : "";
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<meta name="description" content="${desc}"/>
<meta name="mirpdf:tool" content="${tool}"/>
<meta name="mirpdf:keyword" content="${esc(page.keyword || "")}"/>
<meta name="mirpdf:seo_slug" content="${esc(page.slug || "")}"/>
${shouldNoindex ? `<meta name="robots" content="noindex,follow"/>` : `<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"/>`}
<meta property="og:type" content="website"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${desc}"/>
${schemaJson ? `<script type="application/ld+json">${schemaJson}</script>` : ""}
<link rel="canonical" href="${canonical}"/>
<link rel="preconnect" href="${origin}" crossorigin>
<link rel="dns-prefetch" href="${origin}">
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:900px;margin:0 auto;padding:24px;line-height:1.55}
a{color:inherit}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.badge{font-size:12px;padding:4px 10px;border:1px solid #444;border-radius:999px;opacity:.8}
.btn{display:inline-block;margin-top:14px;padding:10px 14px;border-radius:10px;border:1px solid #444;text-decoration:none}
small{opacity:.8}
</style>
<script defer src="/assets/js/attribution.js"></script>
<script defer src="/assets/js/ads-slots.js"></script>
</head>
<body>
<div class="header">
  <a href="/" aria-label="Home">← Ana Sayfa</a>
  ${tool ? `<span class="badge">${tool}</span>` : ``}
</div>
<h1>${h1}</h1>
${desc ? `<p><small>${desc}</small></p>` : ``}
<article>${content}
<section class="card" style="margin-top:18px">
  <h2 style="margin:0 0 10px">Önerilen</h2>
  <div class="ad-slot"
       data-ad-client="ca-pub-REPLACE_PUBLISHER_ID"
       data-ad-slot="REPLACE_SLOT_ID"></div>
</section></article>
${tool ? `<a class="btn" href="/#tools" data-tool="${tool}">Aracı Aç</a>` : `<a class="btn" href="/#tools">Araçlara Git</a>`}
</body></html>`;
}

export async function seoGetBySlug(env, slug) {
  const { results } = await env.DB.prepare(
    `SELECT id, slug, title, description, h1, content, tool_name, keyword, schema_json, last_updated
     FROM seo_pages WHERE slug = ?1 LIMIT 1`
  ).bind(slug).all();
  return results?.[0] || null;
}

export async function seoList(env, limit = 200) {
  const { results } = await env.DB.prepare(
    `SELECT slug, title, description, tool_name, last_updated
     FROM seo_pages ORDER BY last_updated DESC LIMIT ?1`
  ).bind(limit).all();
  return results || [];
}

export async function seoUpsert(env, slug, data) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO seo_pages (id, slug, title, description, h1, content, tool_name, keyword, schema_json, last_updated)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
     ON CONFLICT(slug) DO UPDATE SET
       title=excluded.title, description=excluded.description, h1=excluded.h1,
       content=excluded.content, tool_name=excluded.tool_name,
       keyword=excluded.keyword, schema_json=excluded.schema_json, last_updated=excluded.last_updated`
  ).bind(
    crypto.randomUUID(), slug,
    String(data.title || ""), String(data.description || ""), String(data.h1 || ""),
    String(data.content || ""), String(data.tool_name || ""), String(data.keyword || ""),
    String(data.schema_json || ""), now
  ).run();
  return await seoGetBySlug(env, slug);
}

export async function seoDelete(env, slug) {
  await env.DB.prepare(`DELETE FROM seo_pages WHERE slug=?1`).bind(slug).run();
  return true;
}

export async function renderSitemapSeo(env, origin) {
  const pages = await seoList(env, 5000);
  const urls = pages.map(p => {
    const raw = p.last_updated;
    const iso = raw && /^\d+$/.test(String(raw))
      ? new Date(Number(raw) * 1000).toISOString().split("T")[0]
      : raw ? String(raw).slice(0, 10) : "";
    const lastmod = iso ? `<lastmod>${iso}</lastmod>` : "";
    return `<url><loc>${origin}/seo/${encodeURIComponent(p.slug)}</loc>${lastmod}<changefreq>weekly</changefreq></url>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export async function maybeGenerateSeoSitemap(env) {
  try {
    if (!env.CACHE_INDEX || !env.PDF_R2) return;
    const key = "seo:sitemap:last_run";
    const last = await env.CACHE_INDEX.get(key);
    const now = Date.now();
    if (last && now - Number(last) < 23 * 3600 * 1000) return;
    const origin = requireOrigin(env);
    const xml = await renderSitemapSeo(env, origin);
    await env.PDF_R2.put("sitemap-seo.xml", xml, { httpMetadata: { contentType: "application/xml; charset=utf-8" } });
    await env.CACHE_INDEX.put(key, String(now));
  } catch {}
}
