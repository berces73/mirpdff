/**
 * oauth.js — Google OAuth 2.0 + Magic Link
 * Cloudflare Workers uyumlu, sıfır bağımlılık
 */

import { signJWT, hashPassword } from "./auth.js";
import { sha256Hex, randomToken } from "./helpers.js";
import { sendEmail, welcomeHtml, magicLinkHtml } from "./email.js";
import { json } from "./helpers.js";

// ─── Google OAuth ─────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL  = "https://www.googleapis.com/oauth2/v3/certs";

// Google'ın JWK'larını çekip id_token doğrula
async function verifyGoogleIdToken(idToken, clientId) {
  // Header'dan kid al
  const [headerB64] = idToken.split(".");
  const header = JSON.parse(atob(headerB64.replace(/-/g,"+").replace(/_/g,"/")));

  // JWKS'ten public key çek
  const jwksResp = await fetch(GOOGLE_JWKS_URL);
  const jwks = await jwksResp.json();
  const jwk  = jwks.keys?.find(k => k.kid === header.kid);
  if (!jwk) throw new Error("JWK bulunamadı");

  // Public key import et
  const key = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["verify"]
  );

  // İmzayı doğrula
  const [, payloadB64, sigB64] = idToken.split(".");
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig  = Uint8Array.from(atob(sigB64.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  if (!valid) throw new Error("İmza geçersiz");

  // Payload parse et
  const payload = JSON.parse(atob(payloadB64.replace(/-/g,"+").replace(/_/g,"/")));

  // Standart claim'leri doğrula
  if (payload.aud !== clientId) throw new Error("aud eşleşmiyor");
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com")
    throw new Error("iss geçersiz");
  if (Date.now() / 1000 > payload.exp) throw new Error("Token süresi dolmuş");

  return payload; // { sub, email, name, given_name, family_name, picture, email_verified }
}

// State üret ve KV'ye kaydet (CSRF koruması)
async function createOAuthState(env, redirectTo = "/") {
  const state = randomToken(32);
  const hash  = await sha256Hex(state);
  const ttl   = Number(env.OAUTH_STATE_TTL_SECONDS || 600);
  await env.RATE_KV.put(`oauth_state:${hash}`, JSON.stringify({ redirectTo, created: Date.now() }), { expirationTtl: ttl });
  return state;
}

// State doğrula
async function verifyOAuthState(env, state) {
  const hash = await sha256Hex(state);
  const raw  = await env.RATE_KV.get(`oauth_state:${hash}`);
  if (!raw) throw new Error("Geçersiz veya süresi dolmuş state");
  await env.RATE_KV.delete(`oauth_state:${hash}`);
  return JSON.parse(raw);
}

// ── Google OAuth Handler'ları ─────────────────────────────────────────────────

export async function handleGoogleStart(request, env) {
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response("Google OAuth yapılandırılmamış", { status: 503 });
  }
  const url      = new URL(request.url);
  const redirectTo = url.searchParams.get("redirect") || "/";
  const state    = await createOAuthState(env, redirectTo);
  const origin   = env.APP_ORIGIN || "https://mirpdf.com";
  const callbackUrl = `${origin}/api/auth/oauth/google/callback`;

  const params = new URLSearchParams({
    client_id:     env.GOOGLE_CLIENT_ID,
    redirect_uri:  callbackUrl,
    response_type: "code",
    scope:         "openid email profile",
    state,
    access_type:   "online",
    prompt:        "select_account",
  });

  return Response.redirect(`${GOOGLE_AUTH_URL}?${params}`, 302);
}

export async function handleGoogleCallback(request, env) {
  const url   = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const origin = env.APP_ORIGIN || "https://mirpdf.com";

  if (error || !code || !state) {
    return Response.redirect(`${origin}/login?error=oauth_cancelled`, 302);
  }

  let redirectTo = "/";
  try {
    const stateData = await verifyOAuthState(env, state);
    redirectTo = stateData.redirectTo || "/";
  } catch (_) {
    return Response.redirect(`${origin}/login?error=invalid_state`, 302);
  }

  // Code → token exchange
  const callbackUrl = `${origin}/api/auth/oauth/google/callback`;
  let idToken;
  try {
    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  callbackUrl,
        grant_type:    "authorization_code",
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.id_token) throw new Error(tokenData.error || "Token alınamadı");
    idToken = tokenData.id_token;
  } catch (e) {
    return Response.redirect(`${origin}/login?error=token_exchange_failed`, 302);
  }

  // id_token doğrula
  let googleUser;
  try {
    googleUser = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID);
  } catch (_) {
    return Response.redirect(`${origin}/login?error=token_invalid`, 302);
  }

  const { email, given_name, family_name, sub: googleSub, email_verified } = googleUser;
  if (!email) return Response.redirect(`${origin}/login?error=no_email`, 302);

  // DB'de kullanıcı bul veya oluştur
  const tsNow = Date.now();
  let user = await env.DB.prepare(
    "SELECT id,email,role,email_verified FROM users WHERE email=?"
  ).bind(email.toLowerCase()).first();

  if (!user) {
    // Yeni hesap oluştur (şifresiz — OAuth kullanıcısı) — D1 batch() ile atomic
    const id = crypto.randomUUID();
    const { saltB64, hashB64 } = await hashPassword(randomToken(32)); // rastgele şifre (kullanılmaz)
    const startCredits = Number(env.FREE_STARTING_CREDITS || 5);
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO users (id,email,pass_salt,pass_hash,role,email_verified,created_at,first_name,last_name) VALUES (?,?,?,?,'free',1,?,?,?)"
        ).bind(id, email.toLowerCase(), saltB64, hashB64, tsNow, given_name||null, family_name||null),
        env.DB.prepare("INSERT OR IGNORE INTO credits (user_id,balance,updated_at) VALUES (?,?,?)")
          .bind(id, startCredits, tsNow),
      ]);
    } catch (_) {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO users (id,email,pass_salt,pass_hash,role,email_verified,created_at) VALUES (?,?,?,?,'free',1,?)"
        ).bind(id, email.toLowerCase(), saltB64, hashB64, tsNow),
        env.DB.prepare("INSERT OR IGNORE INTO credits (user_id,balance,updated_at) VALUES (?,?,?)")
          .bind(id, startCredits, tsNow),
      ]);
    }

    // Hoş geldin e-postası
    try {
      await sendEmail(env, {
        to: email,
        subject: "🎉 Hesabın hazır — MirPDF'e hoş geldin!",
        html: welcomeHtml(origin, { firstName: given_name || null }),
      });
    } catch (_) {}

    user = { id, email: email.toLowerCase(), role: "free", email_verified: 1 };
  } else if (!user.email_verified) {
    // Mevcut hesap ama doğrulanmamış — Google doğruladı say
    await env.DB.prepare("UPDATE users SET email_verified=1 WHERE id=?").bind(user.id).run();
  }

  if (user.role === "disabled")
    return Response.redirect(`${origin}/login?error=account_disabled`, 302);

  // JWT üret
  const jwt = await signJWT(env, { sub: user.id, email: user.email, role: user.role });

  // JWT'yi cookie olarak set et ve account'a yönlendir
  // Ayrıca URL fragment'e de koy — frontend localStorage'a alır
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/account";
  return new Response("", {
    status: 302,
    headers: {
      "Location": `${origin}/oauth-callback.html#token=${encodeURIComponent(jwt)}&redirect=${encodeURIComponent(safeRedirect)}`,
      "Cache-Control": "no-store",
    },
  });
}

// ─── Magic Link ───────────────────────────────────────────────────────────────

export async function handleMagicLinkRequest(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";

  // Rate limit: IP başına 5/saat
  const rlKey = `rl:magic:${ip}`;
  const rlCount = Number(await env.RATE_KV.get(rlKey) || 0);
  if (rlCount >= 5) return json({ ok:false, error:"RATE_LIMIT", message:"Çok fazla istek. 1 saat bekleyin." }, 429, env);
  await env.RATE_KV.put(rlKey, String(rlCount + 1), { expirationTtl: 3600 });

  const body  = await request.json().catch(() => ({}));
  const email = (body?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@"))
    return json({ ok:false, error:"BAD_REQUEST", message:"Geçerli e-posta gerekli." }, 400, env);

  const origin = env.APP_ORIGIN || "https://mirpdf.com";
  const tsNow  = Date.now();
  const ttl    = Number(env.MAGIC_LINK_TTL_SECONDS || 900) * 1000;

  // Kullanıcı yoksa oluştur — D1 batch() ile atomic
  let user = await env.DB.prepare("SELECT id,email,role FROM users WHERE email=?").bind(email).first();
  if (!user) {
    const id = crypto.randomUUID();
    const { saltB64, hashB64 } = await hashPassword(randomToken(32));
    const startCredits = Number(env.FREE_STARTING_CREDITS || 5);
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO users (id,email,pass_salt,pass_hash,role,email_verified,created_at) VALUES (?,?,?,?,'free',0,?)"
        ).bind(id, email, saltB64, hashB64, tsNow),
        env.DB.prepare("INSERT OR IGNORE INTO credits (user_id,balance,updated_at) VALUES (?,?,?)")
          .bind(id, startCredits, tsNow),
      ]);
    } catch (_) {}
    user = { id, email, role: "free" };
  }

  if (user.role === "disabled")
    return json({ ok:false, error:"ACCOUNT_DISABLED", message:"Hesabınız devre dışı bırakıldı." }, 403, env);

  // Magic link token
  const tokenPlain = randomToken(32);
  const tokenHash  = await sha256Hex(tokenPlain);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO email_tokens (token_hash,user_id,email,created_at,expires_at) VALUES (?,?,?,?,?)"
  ).bind(tokenHash, user.id, email, tsNow, tsNow + ttl).run();

  // E-posta gönder
  await sendEmail(env, {
    to: email,
    subject: "📄 MirPDF giriş bağlantınız — 15 dakika geçerli",
    html: magicLinkHtml(origin, tokenPlain),
  });

  return json({ ok:true, data:{ sent:true } }, 200, env);
}

export async function handleMagicLinkVerify(request, env) {
  const body       = await request.json().catch(() => ({}));
  const tokenPlain = (body?.token || "").trim();
  if (!tokenPlain) return json({ ok:false, error:"BAD_REQUEST" }, 400, env);

  const tokenHash = await sha256Hex(tokenPlain);
  const rec = await env.DB.prepare(
    "SELECT user_id,email,expires_at FROM email_tokens WHERE token_hash=?"
  ).bind(tokenHash).first();

  if (!rec) return json({ ok:false, error:"INVALID_TOKEN", message:"Geçersiz bağlantı." }, 400, env);
  if (Date.now() > Number(rec.expires_at)) {
    await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash=?").bind(tokenHash).run();
    return json({ ok:false, error:"EXPIRED_TOKEN", message:"Bağlantı süresi dolmuş. Yeni bağlantı isteyin." }, 400, env);
  }

  // Token'ı sil (tek kullanımlık)
  await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash=?").bind(tokenHash).run();

  // Hesabı doğrulanmış say
  const user = await env.DB.prepare("SELECT id,email,role FROM users WHERE id=?").bind(rec.user_id).first();
  if (!user) return json({ ok:false, error:"USER_NOT_FOUND" }, 404, env);
  if (user.role === "disabled") return json({ ok:false, error:"ACCOUNT_DISABLED" }, 403, env);

  await env.DB.prepare("UPDATE users SET email_verified=1 WHERE id=?").bind(rec.user_id).run();

  const jwt = await signJWT(env, { sub: user.id, email: user.email, role: user.role });
  return json({ ok:true, data:{ token: jwt } }, 200, env);
}
