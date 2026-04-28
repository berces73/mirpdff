import { initLangSwitcher } from "./lang-switcher.js";
import { initAuth, fetchMe, isLoggedIn, logout } from "./auth.js";
export async function initToolNav() {
  await initAuth();
  const navLinks = document.querySelector(".nav-links");
  if (!navLinks) return;
  const premiumBtn = navLinks.querySelector(".nav-btn");
  const me = await fetchMe();
  if (me) {
    const isPro = me.role === "pro";
    const balance = me.balance ?? null;
    if (premiumBtn) {
      premiumBtn.textContent = isPro ? "PRO ✦" : "Hesabım";
      premiumBtn.href = "/account";
      premiumBtn.title = isPro
        ? "Pro Plan aktif"
        : (balance !== null ? `${balance} kredi kaldı` : "Hesabım");
    }
    if (balance !== null && premiumBtn) {
      const creditEl = document.createElement("span");
      creditEl.className = "tool-nav-credit" + (balance <= 2 ? " low" : "");
      creditEl.title = `${balance} kredi kaldı`;
      creditEl.innerHTML = `⚡ ${balance}`;
      navLinks.insertBefore(creditEl, premiumBtn);
    }
    const logoutEl = document.createElement("button");
    logoutEl.className = "tool-nav-logout";
    logoutEl.title = "Çıkış yap";
    logoutEl.innerHTML = "↩";
    logoutEl.addEventListener("click", () => logout("/"));
    navLinks.appendChild(logoutEl);
    injectStyles();
  } else {
    if (premiumBtn) {
      const loginEl = document.createElement("a");
      loginEl.href = "/login?redirect=" + encodeURIComponent(location.pathname);
      loginEl.className = "tool-nav-login";
      loginEl.textContent = "Giriş Yap";
      navLinks.insertBefore(loginEl, premiumBtn);
      premiumBtn.textContent = "Ücretsiz Kayıt";
      premiumBtn.href = "/register";
    }
    injectStyles();
  }
}
function injectStyles() {
  if (document.getElementById("__tool_nav_styles")) return;
  const s = document.createElement("style");
  s.id = "__tool_nav_styles";
  s.textContent = `
    .tool-nav-credit{display:inline-flex;align-items:center;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);color:#4f46e5;font-size:.78rem;font-weight:700;padding:.3rem .6rem;border-radius:7px;margin-right:.15rem}
    .tool-nav-credit.low{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.25);color:#dc2626}
    .tool-nav-login{text-decoration:none;color:var(--muted,#6c757d);font-size:.88rem;font-weight:500;padding:.4rem .8rem;border-radius:8px;transition:.15s}
    .tool-nav-login:hover{background:var(--bg2,#f8f9fa);color:var(--text,#1a1a2e)}
    .tool-nav-logout{background:none;border:none;cursor:pointer;color:var(--muted,#6c757d);font-size:.95rem;padding:.4rem .5rem;border-radius:7px;transition:.15s;line-height:1}
    .tool-nav-logout:hover{background:rgba(239,68,68,.08);color:#dc2626}
  `;
  document.head.appendChild(s);
}
function injectCreditBadge() {
  if (document.getElementById("__credit_badge")) return;
  import("/assets/js/auth.js").then(({ isLoggedIn, fetchMe }) => {
    if (!isLoggedIn()) return;
    fetchMe().then(me => {
      if (!me) return;
      const balance = me.balance ?? 0;
      const isPro = me.role === "pro";
      if (isPro) return;
      const badge = document.createElement("div");
      badge.id = "__credit_badge";
      badge.style.cssText = "display:flex;align-items:center;justify-content:center;gap:.4rem;margin:.6rem auto 0;font-size:.78rem;color:#64748b;background:#f7f8fc;border:1px solid #e3e6f0;border-radius:8px;padding:.35rem .8rem;max-width:320px";
      const color = balance <= 2 ? "#ef4444" : balance <= 5 ? "#f59e0b" : "#10b981";
      badge.innerHTML = `
        <i class="fas fa-bolt" style="color:${color};font-size:.7rem"></i>
        <span><strong style="color:${color}">${balance}</strong> kredin kaldı bugün</span>
        ${balance <= 5 ? `<a href="/pricing" style="margin-left:.4rem;color:#6366f1;font-weight:700;font-size:.72rem;text-decoration:none">Pro'ya geç →</a>` : ""}
      `;
      const uploadZone = document.querySelector(".tp-dropzone, .upload-zone, #uploadZone, [data-upload-zone]");
      if (uploadZone?.parentElement) {
        uploadZone.parentElement.insertBefore(badge, uploadZone.nextSibling);
      }
    }).catch(() => {});
  }).catch(() => {});
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectCreditBadge, { once: true });
} else {
  injectCreditBadge();
}
import("/assets/js/funnel.js").then(({ initExitIntent }) => {
  try { initExitIntent(); } catch(e) {}
}).catch(() => {});