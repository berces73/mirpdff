const KEY = "mirpdf_at";
const PERSIST_KEY = "mirpdf_at_persist";
const REFRESH_MARGIN = 120;

function preferredStorage() {
  try {
    if (sessionStorage.getItem(KEY)) return "session";
    if (localStorage.getItem(KEY) || localStorage.getItem(PERSIST_KEY) === "1") return "local";
  } catch (_) {}
  return "session";
}

export function saveToken(token, remember) {
  const useLocal = typeof remember === "boolean" ? remember : preferredStorage() === "local";
  try {
    if (useLocal) {
      localStorage.setItem(KEY, token);
      localStorage.setItem(PERSIST_KEY, "1");
      sessionStorage.removeItem(KEY);
    } else {
      sessionStorage.setItem(KEY, token);
      localStorage.removeItem(KEY);
      localStorage.removeItem(PERSIST_KEY);
    }
  } catch (_) {
    try { sessionStorage.setItem(KEY, token); } catch (_) {}
  }
}

export function getToken() {
  try {
    return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || null;
  } catch (_) {
    try { return sessionStorage.getItem(KEY) || null; } catch (_) { return null; }
  }
}

export function clearToken() {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
    localStorage.removeItem(PERSIST_KEY);
  } catch (_) {
    try { sessionStorage.removeItem(KEY); } catch (_) {}
  }
}
export function decodePayload(token) {
  try {
    const part = (token || "").split(".")[1];
    if (!part) return null;
    const pad = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(pad.padEnd(pad.length + (4 - pad.length % 4) % 4, "="));
    return JSON.parse(json);
  } catch (_) { return null; }
}
export function getUser() {
  const t = getToken();
  if (!t) return null;
  const p = decodePayload(t);
  if (!p || !p.sub) return null;
  if (p.exp && Math.floor(Date.now() / 1000) >= p.exp) { clearToken(); return null; }
  return p;
}
export function isLoggedIn() { return !!getUser(); }
export function getRoleHint() { return getUser()?.role || null; }
export function isProHint()   { return getRoleHint() === "pro"; }
export function isAdminHint() { return getRoleHint() === "admin"; }
export function requireAuthOrRedirect(customRedirect) {
  if (isLoggedIn()) return true;
  const dest = customRedirect || location.pathname + location.search;
  const safe = /^\/[^/\\]/.test(dest) || dest === "/" ? dest : "/";
  location.href = "/login" + (safe !== "/" ? "?redirect=" + encodeURIComponent(safe) : "");
  return false;
}
export function getSafeRedirect(fallback = "/") {
  const params = new URLSearchParams(location.search);
  const r = params.get("redirect") || "";
  return /^\/[^/\\]/.test(r) || r === "/" ? r : fallback;
}
export function authHeaders(extra = {}) {
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...extra }
    : { "Content-Type": "application/json", ...extra };
}
export async function apiFetch(url, opts = {}) {
  const headers = { ...authHeaders(), ...(opts.headers || {}) };
  const resp = await fetch(url, { credentials: "same-origin", ...opts, headers });
  if (resp.status === 401) {
    const refreshed = await silentRefresh();
    if (refreshed) {
      const headers2 = { ...authHeaders(), ...(opts.headers || {}) };
      return fetch(url, { credentials: "same-origin", ...opts, headers: headers2 });
    }
  }
  return resp;
}
let _meCache = null;
let _meFetchedAt = 0;
export async function fetchMe(force = false) {
  const now = Date.now();
  if (!force && _meCache && now - _meFetchedAt < 30_000) return _meCache;
  const token = getToken();
  if (!token) return null;
  try {
    const resp = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "same-origin",
    });
    if (resp.status === 401) { clearToken(); return null; }
    if (!resp.ok) return null;
    const j = await resp.json();
    if (!j.ok) return null;
    _meCache = j.data;
    _meFetchedAt = now;
    return j.data;
  } catch (_) { return null; }
}
export function invalidateMeCache() { _meCache = null; }
let _refreshing = null;
export async function silentRefresh() {
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    try {
      const resp = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remember: preferredStorage() === "local" }),
      });
      if (!resp.ok) { clearToken(); return false; }
      const j = await resp.json();
      if (j.ok && j.data?.token) {
        saveToken(j.data.token);
        invalidateMeCache();
        return true;
      }
      clearToken();
      return false;
    } catch (_) { return false; }
    finally { _refreshing = null; }
  })();
  return _refreshing;
}
export async function initAuth() {
  const user = getUser();
  if (user) {
    const remaining = user.exp - Math.floor(Date.now() / 1000);
    if (remaining < REFRESH_MARGIN) await silentRefresh();
    return;
  }
  await silentRefresh();
}
export async function logout(redirectTo = "/") {
  const token = getToken();
  clearToken();
  invalidateMeCache();
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (_) {}
  location.href = redirectTo;
}
