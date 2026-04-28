// ============================================================
// src/clientid.js — İmzalı anonim clientId cookie yönetimi
// ============================================================

import { parseCookies, randomId } from "./helpers.js";
import { verifyJWT } from "./auth.js";

function base64url(bytes) {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hmacSha256(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}

export async function signClientId(env, id) {
  const secret = env.CLIENT_ID_SECRET;
  if (!secret) return null;
  const sigBytes = await hmacSha256(secret, id);
  return `${id}.${base64url(sigBytes)}`;
}

export async function verifyClientId(env, token) {
  const secret = env.CLIENT_ID_SECRET;
  if (!secret) return null;
  const [id, sig] = String(token || "").split(".");
  if (!id || !sig || id.length > 64) return null;
  const expect = await signClientId(env, id);
  if (!expect) return null;
  try {
    const a = new TextEncoder().encode(expect);
    const b = new TextEncoder().encode(`${id}.${sig}`);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    return id;
  } catch {
    return null;
  }
}

export async function getClientId(request, env) {
  // Prefer authenticated user as clientId
  try {
    const hdr = request.headers.get("authorization") || "";
    const tok = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : "";
    if (tok) {
      const sess = await verifyJWT(env, tok);
      if (sess?.sub) return { clientId: String(sess.sub), setCookie: null };
    }
  } catch {}

  const cookies = parseCookies(request.headers.get("cookie") || "");
  if (cookies.cid) {
    const id = await verifyClientId(env, cookies.cid);
    if (id) return { clientId: id, setCookie: null };
  }

  const hdr = (request.headers.get("x-client-id") || "").trim();
  if (hdr && hdr.length <= 64 && String(env.ALLOW_INSECURE_CLIENT_ID_HEADER || "") === "1") {
    return { clientId: hdr, setCookie: null };
  }

  const id = randomId();
  const signed = await signClientId(env, id);
  if (!signed) return { clientId: "anon", setCookie: null };

  const cookie = `cid=${signed}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure`;
  return { clientId: id, setCookie: cookie };
}

export function creditDO(env, clientId) {
  const id = env.CREDIT_COUNTER.idFromName(clientId);
  return env.CREDIT_COUNTER.get(id);
}
