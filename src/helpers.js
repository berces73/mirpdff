// ============================================================
// src/helpers.js — Paylaşılan yardımcı fonksiyonlar
// Çıkarıldı: _worker.js içindeki inline tanımlamalardan
// ============================================================

export const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

// ---- CORS ----
export function corsHeaders(env, requestOrigin) {
  const raw = (env.ALLOWED_ORIGIN || "").trim();
  const allowed = raw.split(",").map(o => o.trim()).filter(Boolean);
  const base = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-client-id",
    "access-control-max-age": "86400",
    "vary": "origin",
  };
  if (allowed.length > 0) {
    const origin = requestOrigin || allowed[0];
    if (allowed.includes(origin) || allowed.includes("*")) {
      base["access-control-allow-origin"] = origin;
      base["access-control-allow-credentials"] = "true";
    }
  }
  return base;
}

export function corsPreflight(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

// ---- JSON response ----
export function json(obj, status = 200, env, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(env),
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

// ---- IP ----
export function parseUA(ua) {
  if (!ua) return "Bilinmeyen cihaz";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mobile/i.test(ua)) return "Mobil";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Masaüstü";
}

export function getIp(request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "0.0.0.0";
}

// ---- Rate limit (KV sliding window — TOCTOU güvenli yaklaşım) ----
// KV'de atomic increment yoktur; sliding window + %80 eşiği ile race etkisi azaltılır.
// Gerçek koruma: auth için hesap kilitleme, upload için kredi sistemi.
export async function rateLimit(env, key, limit, windowSec) {
  if (!env.RATE_KV) return { ok: true };
  const now    = Math.floor(Date.now() / 1000);
  const win    = Math.floor(now / windowSec);
  const prevWin = win - 1;
  const position = (now % windowSec) / windowSec;
  const safeLimit = Math.max(1, Math.floor(limit * 0.8));

  const [curRaw, prevRaw] = await Promise.all([
    env.RATE_KV.get(`${key}:${win}`),
    env.RATE_KV.get(`${key}:${prevWin}`),
  ]);
  const cur  = Number(curRaw  || "0");
  const prev = Number(prevRaw || "0");
  const weighted = cur + prev * (1 - position);

  if (weighted >= safeLimit) {
    return { ok: false, retryAfter: (win + 1) * windowSec - now };
  }
  await env.RATE_KV.put(`${key}:${win}`, String(cur + 1), { expirationTtl: windowSec * 2 + 5 });
  return { ok: true };
}

// ---- Cookies ----
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function setCookie(name, value, opts = {}) {
  const o = {
    Path: opts.path || "/",
    HttpOnly: opts.httpOnly !== false,
    Secure: opts.secure !== false,
    SameSite: opts.sameSite || "Lax",
  };
  if (opts.maxAge != null) o["Max-Age"] = String(opts.maxAge);
  if (opts.expires != null) o["Expires"] = new Date(opts.expires).toUTCString();
  if (opts.domain) o["Domain"] = opts.domain;
  return `${name}=${value}; ` + Object.entries(o).map(([k, v]) => v === true ? k : `${k}=${v}`).join("; ");
}

// ---- Crypto helpers ----
export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(len = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function randomId() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 24);
}

export function timingSafeEq(a, b) {
  if (!a || !b) return false;
  try {
    const A = new TextEncoder().encode(String(a));
    const B = new TextEncoder().encode(String(b));
    if (A.length !== B.length) {
      crypto.timingSafeEqual(new Uint8Array([1]), new Uint8Array([1]));
      return false;
    }
    return crypto.timingSafeEqual(A, B);
  } catch {
    return false;
  }
}

// ---- Config guard ----
export function requireOrigin(env) {
  const o = String(env.APP_ORIGIN || "").trim();
  const PLACEHOLDER = "FILL_AC" + "TUAL";
  if (!o || !o.startsWith("http") || o.includes(PLACEHOLDER) || o.includes("example.com")) {
    throw new Error("MISCONFIGURED: APP_ORIGIN env değişkeni tanımlı değil veya placeholder değerinde.");
  }
  return o;
}

// ---- Tool config ----
export const ALLOWED_JOB_TOOLS = new Set(["compress-strong", "pdf-to-word", "ocr", "word-to-pdf", "excel-to-pdf", "ppt-to-pdf", "unlock"]);

export const TOOL_COSTS = {
  // Tarayıcı araçları: 0 kredi (CreditCounter.COSTS ile senkronize)
  // Sunucu araçları: 3 kredi her biri (15 kredi/gün = 5 işlem)
  "compress-strong": 3,
  "pdf-to-word":     3,   // CreditCounter.js ile senkronize
  "ocr":             3,   // CreditCounter.js ile senkronize
  "word-to-pdf":     3,
  "excel-to-pdf":    3,
  "ppt-to-pdf":      3,
  "unlock":          3,   // CreditCounter.js ile senkronize
};

export const TOOL_ENDPOINT = {
  "compress-strong": "/process/compress",
  "pdf-to-word":     "/process/pdf-to-word",
  "ocr":             "/process/ocr",
  "word-to-pdf":     "/process/word-to-pdf",
  "excel-to-pdf":    "/process/excel-to-pdf",
  "ppt-to-pdf":      "/process/ppt-to-pdf",
  "unlock":          "/process/unlock",
};

export const SECONDARY_TOOL_SET = new Set(["jpg-to-pdf", "pdf-to-jpg", "pdf-birlestir", "pdf-bol", "pdf-duzenle"]);
export const DEFAULT_JOB_TTL_SECONDS = 3600;

export function toolMaxMb(env, tool) {
  const globalMax = Number(env.MAX_UPLOAD_MB || "50");
  const ocrMax = Number(env.OCR_MAX_MB || "20");
  const wMax = Number(env.WORD_MAX_MB || "25");
  if (tool === "ocr") return Math.min(globalMax, ocrMax);
  if (tool === "pdf-to-word") return Math.min(globalMax, wMax);
  return globalMax;
}

export function getContentLength(request) {
  const v = request.headers.get("content-length");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ---- Auth helpers ----
export async function sessionOptional(request, env, verifyJWT) {
  const hdr = request.headers.get("authorization") || "";
  const tok = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : "";
  if (!tok) return null;
  try { return await verifyJWT(env, tok); } catch { return null; }
}

export function validatePassword(pw) {
  if (!pw) return ["Şifre boş olamaz."];
  const e = [];
  if (pw.length < 10) e.push("Şifre en az 10 karakter olmalı.");
  if (pw.length > 128) e.push("Şifre en fazla 128 karakter olabilir.");
  if (!/[A-Z]/.test(pw)) e.push("En az bir büyük harf gerekli.");
  if (!/[a-z]/.test(pw)) e.push("En az bir küçük harf gerekli.");
  if (!/[0-9]/.test(pw)) e.push("En az bir rakam gerekli.");
  // Yaygın/zayıf şifreler — HaveIBeenPwned top-100'den + Türkçe uyarlamalar
  const COMMON = new Set([
    "password1","Password1","12345678","Qwerty123","qwerty123",
    "mirpdf123","Mirpdf123!","1234567890","00000000","11111111",
    "Password12","Password123","password123","password12",
    "Passw0rd1","passw0rd1","P@ssword1","p@ssword1",
    "Aa123456!","aa123456!","Admin1234","admin1234",
    "Welcome1!","welcome1!","Welcome12","welcome12",
    "Abcd1234!","abcd1234!","Test1234!","test1234!",
    "Ankara123","ankara123","Istanbul1","istanbul1",
    "Turkiye1!","turkiye1!","Turkey123","turkey123",
    "1234abcd!","1234Abcd!","Abc12345!","abc12345!",
    "Qwerty1!","qwerty1!","Qwerty12!","qwerty12!",
    "123456789","1234567891","0987654321","9876543210",
    "Monkey123","monkey123","Dragon123","dragon123",
    "Letmein1!","letmein1!","Iloveyou1","iloveyou1",
    "Sunshine1","sunshine1","Princess1","princess1",
    "Football1","football1","Shadow123","shadow123",
    "Master123","master123","Hello1234","hello1234",
    "Charlie1!","charlie1!","Donald123","donald123",
    "Michael1!","michael1!","Superman1","superman1",
    "Batman123","batman123","Soccer123","soccer123",
    "Baseball1","baseball1","Trustno1!","trustno11",
    "Winter123","winter123","Summer123","summer123",
    "Spring123","spring123","Autumn123","autumn123",
    "January1!","january1!","February1","february1",
    "Company1!","company1!","Manager1!","manager1!",
    "Service1!","service1!","Support1!","support1!",
    "Office123","office123","Secret123","secret123",
    "Internet1","internet1","Computer1","computer1",
    "Network1!","network1!","System123","system123",
    "Mobile123","mobile123","Android1!","android1!",
    "Apple123!","apple123!","Google123","google123",
    "Facebook1","facebook1","Twitter1!","twitter1!",
    "Linkedin1","linkedin1","Youtube1!","youtube1!",
    "Netflix1!","netflix1!","Amazon123","amazon123",
    "Mirpdf1!2","MIRPDF123","Mirpdf12!","mirpdf12!",
    "Pdf12345!","pdf12345!","Pdftools1","pdftools1",
  ]);
  if (COMMON.has(pw)) e.push("Bu şifre çok yaygın, daha güçlü bir şifre seçin.");
  return e;
}
