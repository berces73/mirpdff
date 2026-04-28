import { initLangSwitcher } from "./lang-switcher.js";
import { initAuth, fetchMe, isLoggedIn, getRoleHint, logout } from "./auth.js";
const NAV_LINKS = `
  <a href="/#tools">Araçlar</a>
  <a href="/articles/">Blog</a>
  <a href="/pricing">Fiyatlar</a>
  <a href="/faq">SSS</a>
  <a href="/yardim">Yardım</a>
  <a href="/contact">İletişim</a>
`;
function renderGuestNav(nav) {
  nav.innerHTML = NAV_LINKS +
    `<a href="/login" class="nav-auth-link">Giriş Yap</a>` +
    `<a href="/register" class="btn-premium">Ücretsiz Kayıt</a>`;
}
function renderUserNav(nav, me) {
  const role = me?.role || getRoleHint() || "free";
  const isPro = role === "pro";
  const balance = me?.balance ?? null;
  const creditBadge = balance !== null
    ? `<span class="nav-credit" title="Kredi bakiyeniz"><i class="fas fa-bolt" aria-hidden="true"></i>${balance}</span>`
    : "";
  const roleBadge = isPro
    ? `<span class="nav-pro-badge">PRO</span>`
    : "";
  nav.innerHTML = NAV_LINKS +
    creditBadge +
    roleBadge +
    `<div class="nav-user-menu" id="navUserMenu">
      <button class="nav-user-btn" id="navUserBtn" aria-haspopup="true" aria-expanded="false">
        <i class="fas fa-user-circle" aria-hidden="true"></i>
        <span>${me?.email ? me.email.split("@")[0] : "Hesabım"}</span>
        <i class="fas fa-chevron-down" aria-hidden="true" style="font-size:.7rem"></i>
      </button>
      <div class="nav-dropdown" id="navDropdown" role="menu" aria-label="Hesap menüsü">
        <a href="/account" role="menuitem"><i class="fas fa-user" aria-hidden="true"></i> Hesabım</a>
        <a href="/pricing" role="menuitem"><i class="fas fa-crown" aria-hidden="true"></i> ${isPro ? "Planı Yönet" : "Pro'ya Geç"}</a>
        <hr class="nav-sep">
        <button id="navLogoutBtn" role="menuitem"><i class="fas fa-sign-out-alt" aria-hidden="true"></i> Çıkış Yap</button>
      </div>
    </div>`;
  const btn = document.getElementById("navUserBtn");
  const dd  = document.getElementById("navDropdown");
  if (btn && dd) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = dd.classList.toggle("show");
      btn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", () => { dd.classList.remove("show"); btn.setAttribute("aria-expanded","false"); }, { once: false });
  }
  document.getElementById("navLogoutBtn")?.addEventListener("click", () => logout("/"));
}
export async function initNav() {
  injectNavStyles();
  const nav = document.getElementById("mainNav");
  if (!nav) return;
  await initAuth();
  if (isLoggedIn()) {
    renderUserNav(nav, null);
  } else {
    renderGuestNav(nav);
  }
  const me = await fetchMe();
  if (me) {
    renderUserNav(nav, me);
  } else {
    renderGuestNav(nav);
  }
  const toggle = document.getElementById("mobileToggle");
  if (toggle && !toggle.dataset.navBound) {
    toggle.dataset.navBound = "1";
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("show");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }
}
function injectNavStyles() {
  if (document.getElementById("__nav_styles")) return;
  const s = document.createElement("style");
  s.id = "__nav_styles";
  s.textContent = `
    .nav-auth-link{text-decoration:none;color:var(--muted);font-size:.9rem;font-weight:500;padding:.45rem .9rem;border-radius:10px;transition:.15s}
    .nav-auth-link:hover{background:var(--bg-soft,#f7f8fc);color:var(--text,#0d0f1a)}
    .nav-credit{display:inline-flex;align-items:center;gap:.3rem;background:var(--bg-soft,#f7f8fc);border:1px solid var(--border,#e3e6f0);color:var(--muted,#64748b);font-size:.8rem;font-weight:600;padding:.3rem .65rem;border-radius:8px;margin-right:.15rem}
    .nav-credit.credit-low{background:#fef2f2;border-color:#fca5a5;color:#dc2626}
    .nav-pro-badge{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:.7rem;font-weight:800;padding:.2rem .55rem;border-radius:6px;letter-spacing:.04em;margin-right:.15rem}
    .nav-user-menu{position:relative}
    .nav-user-btn{display:inline-flex;align-items:center;gap:.4rem;background:none;border:1px solid var(--border,#e3e6f0);color:var(--text,#0d0f1a);font-size:.88rem;font-weight:600;padding:.4rem .85rem;border-radius:10px;cursor:pointer;transition:.15s;font-family:inherit}
    .nav-user-btn:hover{background:var(--bg-soft,#f7f8fc)}
    .nav-dropdown{display:none;position:absolute;right:0;top:calc(100% + 8px);min-width:190px;background:#fff;border:1px solid var(--border,#e3e6f0);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.1);padding:.5rem;z-index:300}
    .nav-dropdown.show{display:block}
    .nav-dropdown a,.nav-dropdown button{display:flex;align-items:center;gap:.55rem;width:100%;text-align:left;padding:.6rem .85rem;border-radius:9px;font-size:.875rem;font-weight:500;color:var(--text,#0d0f1a);text-decoration:none;border:none;background:none;cursor:pointer;font-family:inherit;transition:.12s}
    .nav-dropdown a:hover,.nav-dropdown button:hover{background:var(--bg-soft,#f7f8fc)}
    .nav-sep{border:none;border-top:1px solid var(--border,#e3e6f0);margin:.3rem 0}
    @media(max-width:640px){.nav-credit,.nav-pro-badge{display:none}.nav-dropdown{right:-1rem}}
  `;
  document.head.appendChild(s);
}
(function() {
  const darkCSS = `
    [data-theme="dark"] {
      --bg: #0f172a;
      --bg-soft: #1e293b;
      --bg-mute: #1e293b;
      --border: #334155;
      --text: #f1f5f9;
      --muted: #94a3b8;
    }
    [data-theme="dark"] .header {
      background: rgba(15,23,42,.95) !important;
      border-color: #334155 !important;
    }
    [data-theme="dark"] .plan-card,
    [data-theme="dark"] .auth-card,
    [data-theme="dark"] .card {
      background: #1e293b;
      border-color: #334155;
    }
  `;
  const styleEl = document.createElement("style");
  styleEl.id = "__darkmode_css";
  styleEl.textContent = darkCSS;
  document.head.appendChild(styleEl);
  const saved = localStorage.getItem("mirpdf_theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  function addDarkToggle() {
    if (document.getElementById("__dark_toggle")) return;
    const btn = document.createElement("button");
    btn.id = "__dark_toggle";
    btn.setAttribute("aria-label", "Tema değiştir");
    btn.title = "Açık/Koyu mod";
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    btn.innerHTML = isDark ? "☀️" : "🌙";
    btn.style.cssText = "background:none;border:1px solid var(--border);color:var(--text);padding:.35rem .5rem;border-radius:8px;cursor:pointer;font-size:.9rem;line-height:1;margin-left:.25rem";
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("mirpdf_theme", next);
      btn.innerHTML = next === "dark" ? "☀️" : "🌙";
    });
    const nav = document.getElementById("mainNav");
    if (nav) nav.appendChild(btn);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addDarkToggle, { once: true });
    document.addEventListener("DOMContentLoaded", initLangSwitcher, { once: true });
  } else {
    addDarkToggle();
    initLangSwitcher();
  }
})();