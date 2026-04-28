// ============================================================
// src/download.js — İmzalı download URL token (R2 çıktıları için)
// ============================================================

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function createDownloadToken(env, { jobId, clientId, exp }) {
  const secret = env.DOWNLOAD_SIGNING_SECRET || env.JWT_SECRET;
  if (!secret) throw new Error("DOWNLOAD_SIGNING_SECRET/JWT_SECRET tanımlı değil");
  const payload = `${jobId}.${clientId}.${exp}`;
  const sig = await hmacSha256Hex(secret, payload);
  return `${clientId}.${exp}.${sig}`;
}

export async function verifyDownloadToken(env, { jobId, clientId, token }) {
  const secret = env.DOWNLOAD_SIGNING_SECRET || env.JWT_SECRET;
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!token || typeof token !== "string") return { ok: false, reason: "missing_token" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "bad_token" };
  const [cid, expStr, sig] = parts;
  const boundClientId = clientId || cid;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: "bad_exp" };
  const now = Math.floor(Date.now() / 1000);
  if (now > exp) return { ok: false, reason: "expired" };
  const payload = `${jobId}.${boundClientId}.${exp}`;
  const expected = await hmacSha256Hex(secret, payload);
  if (expected !== sig) return { ok: false, reason: "bad_sig" };
  return { ok: true, exp, clientId: boundClientId };
}
