import { openPaywall } from "./paywall.js";
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}
function getAnonId() {
  const k = "pdfp_anon_id";
  let v = localStorage.getItem(k);
  if (!v) {
    v = crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2));
    localStorage.setItem(k, v);
  }
  return v;
}
function getDailyOps() {
  const n = Number(localStorage.getItem(`pdfp_ops_${todayKey()}`) || "0");
  return Number.isFinite(n) ? n : 0;
}
function incDailyOps() {
  const k = `pdfp_ops_${todayKey()}`;
  const n = getDailyOps() + 1;
  localStorage.setItem(k, String(n));
  return n;
}
function wasShownRecently(key, ms = 4 * 60 * 60 * 1000) {
  const last = parseInt(localStorage.getItem(key) || "0", 10);
  return (Date.now() - last) < ms;
}
function markShown(key) {
  try { localStorage.setItem(key, String(Date.now())); } catch (_) {}
}
function isPro() {
  try {
    const s = JSON.parse(localStorage.getItem("mirpdf_session") || "{}");
    return s?.role === "pro";
  } catch { return false; }
}
function getPageState() {
  const hasResult  = !!document.querySelector(".tp-result");
  const isWorking  = !!document.querySelector(".tp-progress:not([hidden])");
  const hasFile    = !!document.querySelector(".tp-file-info, .tp-thumb, .tp-dropzone--has-file");
  return { hasResult, isWorking, hasFile };
}
function getExitMessage(toolName) {
  const { hasResult, isWorking, hasFile } = getPageState();
  if (hasResult) {
    return {
      title: "Dosyan hazır — indirdin mi?",
      body:  "İşlenen dosyan hâlâ burada. Kapatmadan önce indir.",
      primaryLabel: "Sayfada Kal",
      primaryAction: "close",
      secondaryLabel: "Yine de çık",
      secondaryAction: "dismiss",
      icon: "📁",
    };
  }
  if (isWorking) {
    return {
      title: "İşlem devam ediyor…",
      body:  "Şu an dosyan işleniyor. Sayfayı kapatırsan işlem iptal olur.",
      primaryLabel: "Bekleyeceğim",
      primaryAction: "close",
      secondaryLabel: "Yine de çık",
      secondaryAction: "dismiss",
      icon: "⏳",
    };
  }
  if (hasFile) {
    return {
      title: "Dosyanı unuttun!",
      body:  `${toolName || "Araç"} sayfasında yüklü bir dosyan var. İşlemeyi tamamlamak ister misin?`,
      primaryLabel: "Devam Et",
      primaryAction: "close",
      secondaryLabel: "Çık",
      secondaryAction: "dismiss",
      icon: "📄",
    };
  }
  return {
    title: "MirPDF Pro — ₺79/ay",
    body:  "Sınırsız OCR, toplu işlem ve öncelikli kuyruk. 14 gün iade garantisi.",
    primaryLabel: "Planları Gör",
    primaryAction: "pricing",
    secondaryLabel: "Şimdi değil",
    secondaryAction: "dismiss",
    icon: "⭐",
  };
}
function showExitModal(msg) {
  if (document.getElementById("__exit_modal")) return;
  const overlay = document.createElement("div");
  overlay.id = "__exit_modal";
  overlay.style.cssText = [
    "position:fixed","inset:0","z-index:10001",
    "background:rgba(13,15,26,.6)","display:flex",
    "align-items:center","justify-content:center","padding:1rem",
    "backdrop-filter:blur(3px)",
    "animation:exitFadeIn .2s ease"
  ].join(";");
  const close = () => overlay.remove();
  overlay.innerHTML = `
    <style>
      @keyframes exitFadeIn{from{opacity:0}to{opacity:1}}
      @keyframes exitSlideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
    </style>
    <div style="background:#fff;border-radius:20px;width:min(400px,100%);overflow:hidden;
                animation:exitSlideUp .28s ease;box-shadow:0 28px 72px rgba(0,0,0,.18);">
      <div style="padding:1.75rem 1.75rem 1.25rem;text-align:center;border-bottom:1px solid #e3e6f0">
        <div style="font-size:2.2rem;margin-bottom:.6rem">${msg.icon}</div>
        <div style="font-size:1.1rem;font-weight:800;color:#0d0f1a;margin-bottom:.4rem">${msg.title}</div>
        <div style="font-size:.88rem;color:#64748b;line-height:1.6">${msg.body}</div>
      </div>
      <div style="padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:.5rem">
        <button id="__exit_primary" style="
          padding:.85rem;border-radius:12px;border:none;
          background:#0d0f1a;color:#fff;font-weight:700;font-size:.95rem;
          cursor:pointer;font-family:inherit;transition:opacity .15s
        ">${msg.primaryLabel}</button>
        <button id="__exit_secondary" style="
          padding:.75rem;border-radius:12px;
          border:1.5px solid #e3e6f0;background:#fff;
          color:#64748b;font-weight:600;font-size:.88rem;
          cursor:pointer;font-family:inherit
        ">${msg.secondaryLabel}</button>
      </div>
    </div>`;
  document.getElementById("__exit_primary").onclick = () => {
    close();
    if (msg.primaryAction === "pricing") window.location.href = "/pricing";
  };
  document.getElementById("__exit_secondary").onclick = close;
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });
  document.body.appendChild(overlay);
}
export function initExitIntent() {
  if (isPro()) return;
  try {
    const SHOWN_KEY = `pdfp_exit_offer_${todayKey()}`;
    if (localStorage.getItem(SHOWN_KEY) === "1") return;
    const toolName = document.querySelector("h1")?.textContent?.trim() || "";
    let armed = true;
    const trigger = () => {
      if (!armed) return;
      armed = false;
      localStorage.setItem(SHOWN_KEY, "1");
      const msg = getExitMessage(toolName);
      showExitModal(msg);
    };
    document.addEventListener("mouseleave", (e) => {
      if (e.clientY <= 0) trigger();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") trigger();
    });
    getAnonId();
  } catch (_) {}
}
const UPSELL_MESSAGES = {
  "compress":    { emoji: "🗜️", hook: "Toplu sıkıştırma mı gerekiyor?", detail: "Pro ile 10 dosyayı aynı anda sıkıştır, ZIP olarak indir." },
  "merge":       { emoji: "📎", hook: "Sık PDF birleştiriyor musun?", detail: "Pro ile sınır yok — kaç dosya olursa." },
  "split":       { emoji: "✂️", hook: "Toplu bölme gerekiyor mu?", detail: "Pro ile birden fazla PDF'i aynı anda böl." },
  "pdf-to-word": { emoji: "📝", hook: "Daha fazla dönüştürme mi?", detail: "Pro ile sınırsız PDF→Word, OCR dahil." },
  "ocr":         { emoji: "🔍", hook: "Toplu OCR mı gerekiyor?", detail: "Pro ile birden fazla belgeyi aynı anda işle." },
  "lock":        { emoji: "🔒", hook: "Toplu şifreleme mi?", detail: "Pro ile birden fazla PDF'e şifre koy." },
  "unlock":      { emoji: "🔓", hook: "Kilitli PDF'leri düzenleyecek misin?", detail: "Kilidi açtıktan sonra PDF Düzenle ile devam et." },
  "default":     { emoji: "⭐", hook: "Beğendin mi?", detail: "Pro ile tüm araçlar sınırsız — ₺79/ay." },
};
export function showPostDownloadBanner(tool) {
  if (isPro()) return;
  const SHOWN_KEY = `pdfp_upsell_${todayKey()}`;
  if (wasShownRecently(SHOWN_KEY, 8 * 60 * 60 * 1000)) return;
  const msg = UPSELL_MESSAGES[tool] || UPSELL_MESSAGES["default"];
  const banner = document.createElement("div");
  banner.id = "__upsell_banner";
  banner.style.cssText = [
    "margin-top:1.25rem","padding:1rem 1.25rem",
    "background:#f7f8fc","border:1.5px solid #e3e6f0",
    "border-radius:14px","display:flex",
    "align-items:center","gap:1rem",
    "animation:upsellIn .3s ease","flex-wrap:wrap"
  ].join(";");
  banner.innerHTML = `
    <style>@keyframes upsellIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}</style>
    <div style="font-size:1.6rem;flex-shrink:0">${msg.emoji}</div>
    <div style="flex:1;min-width:180px">
      <div style="font-size:.9rem;font-weight:700;color:#0d0f1a;margin-bottom:.2rem">${msg.hook}</div>
      <div style="font-size:.82rem;color:#64748b;line-height:1.5">${msg.detail}</div>
    </div>
    <div style="display:flex;gap:.5rem;flex-shrink:0">
      <a href="/pricing" style="
        display:inline-flex;align-items:center;
        padding:.55rem 1.1rem;background:#0d0f1a;
        color:#fff;border-radius:10px;font-weight:700;
        font-size:.82rem;text-decoration:none;white-space:nowrap
      ">Pro'ya Geç →</a>
      <button id="__upsell_close" style="
        background:none;border:1.5px solid #e3e6f0;
        color:#94a3b8;border-radius:10px;
        padding:.5rem .75rem;cursor:pointer;font-size:.8rem
      ">✕</button>
    </div>`;
  banner.querySelector("#__upsell_close").onclick = () => {
    banner.remove();
    markShown(SHOWN_KEY);
  };
  const resultEl = document.querySelector(".tp-result");
  if (resultEl) {
    resultEl.after(banner);
  } else {
    const app = document.getElementById("tool-app") || document.querySelector("main .container");
    if (app) app.appendChild(banner);
  }
  markShown(SHOWN_KEY);
  setTimeout(() => { if (banner.parentNode) banner.remove(); }, 30000);
}
export function funnelMaybeBlockStart({ tool, hardBlock = true } = {}) {
  if (isPro()) return false;
  try {
    const shownKey = `pdfp_offer_shown_${todayKey()}`;
    if (localStorage.getItem(shownKey) === "1") return false;
    const next = incDailyOps();
    if (next >= 3) {
      localStorage.setItem(shownKey, "1");
      showUpgradeModal("limit3");
      return !!hardBlock;
    }
  } catch (_) {}
  return false;
}
function showUpgradeModal(reason) {
  if (document.getElementById("__upgrade_modal")) return;
  if (wasShownRecently("mirpdf_nudge_shown")) return;
  markShown("mirpdf_nudge_shown");
  const REASONS = {
    limit3:  { icon: "⚡", headline: "Günlük 3 işlem doldu", sub: "Yarın yenilenir — veya şimdi Pro'ya geç." },
    tool2:   { icon: "🔁", headline: "Bu aracı sık kullanıyorsunuz", sub: "Pro ile sınır yok." },
    bigfile: { icon: "📦", headline: "Büyük dosya algılandı", sub: "Pro ile 50 MB'a kadar işleyin." },
    tools3:  { icon: "🚀", headline: "3 farklı araç kullandınız", sub: "Ücretsiz sınırına yaklaşıyorsunuz." },
  };
  const r = REASONS[reason] || REASONS.limit3;
  const overlay = document.createElement("div");
  overlay.id = "__upgrade_modal";
  overlay.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(13,15,26,.6);display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(3px);animation:fadeIn .2s ease";
  overlay.innerHTML = `
    <style>
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes slideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
    </style>
    <div style="background:#fff;border-radius:20px;width:min(420px,100%);overflow:hidden;animation:slideUp .3s ease;box-shadow:0 32px 80px rgba(0,0,0,.18)">
      <div style="background:linear-gradient(135deg,#0d0f1a,#1e1b4b);padding:1.75rem 2rem 1.5rem;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:.5rem">${r.icon}</div>
        <div style="font-size:1.15rem;font-weight:800;color:#fff;margin-bottom:.25rem">${r.headline}</div>
        <div style="font-size:.85rem;color:rgba(199,210,254,.8)">${r.sub}</div>
      </div>
      <div style="padding:1.25rem 1.5rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:1.25rem">
          ${[["∞","Sınırsız işlem"],["⚡","Toplu dönüştürme"],["🚀","Öncelikli kuyruk"],["🚫","Reklamsız"]].map(([ic,lbl]) => `
            <div style="display:flex;align-items:center;gap:.5rem;padding:.6rem .75rem;background:#f7f8fc;border-radius:9px;font-size:.8rem;font-weight:600;color:#0d0f1a">
              <span style="width:26px;height:26px;border-radius:7px;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0">${ic}</span>
              ${lbl}
            </div>`).join("")}
        </div>
        <div style="text-align:center;margin-bottom:1rem">
          <div style="font-size:1.6rem;font-weight:800;color:#0d0f1a">₺79<span style="font-size:.9rem;font-weight:500;color:#64748b">/ay</span></div>
          <div style="font-size:.75rem;color:#64748b">14 gün iade garantisi · İstediğin zaman iptal</div>
        </div>
        <a href="/pricing" style="display:block;text-align:center;background:#0d0f1a;color:#fff;font-weight:700;font-size:.95rem;padding:.85rem;border-radius:12px;text-decoration:none;margin-bottom:.5rem">
          Pro'ya Geç — ₺79/ay
        </a>
        <button onclick="document.getElementById('__upgrade_modal').remove()" style="display:block;width:100%;text-align:center;background:none;border:1.5px solid #e3e6f0;color:#64748b;font-weight:600;font-size:.85rem;padding:.7rem;border-radius:12px;cursor:pointer;font-family:inherit">
          Şimdilik ücretsiz devam et →
        </button>
      </div>
    </div>`;
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") overlay.remove(); });
  document.body.appendChild(overlay);
}
function showNudge(msg, cta, href = "/pricing") {
  if (wasShownRecently("mirpdf_nudge_shown")) return;
  markShown("mirpdf_nudge_shown");
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed","bottom:1.5rem","left:50%","transform:translateX(-50%)",
    "z-index:9999","background:#0d0f1a","color:#fff","border-radius:14px",
    "padding:1rem 1.4rem","max-width:420px","width:calc(100% - 2rem)",
    "box-shadow:0 8px 32px rgba(0,0,0,.3)","font-family:Figtree,sans-serif",
    "display:flex","align-items:center","gap:.85rem","animation:mirSlideUp .3s ease"
  ].join(";");
  el.innerHTML = `
    <style>@keyframes mirSlideUp{from{transform:translateX(-50%) translateY(20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}</style>
    <div style="flex:1">
      <div style="font-size:.85rem;font-weight:700;margin-bottom:.2rem">${msg}</div>
      <div style="font-size:.78rem;color:rgba(255,255,255,.55)">Pro ile sınır yok</div>
    </div>
    <a href="${href}" style="display:inline-flex;align-items:center;gap:.3rem;background:#6366f1;color:#fff;padding:.55rem 1.1rem;border-radius:9px;font-weight:700;font-size:.82rem;text-decoration:none;white-space:nowrap;flex-shrink:0">${cta}</a>
    <button onclick="this.closest('div').remove()" style="background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:1.1rem;padding:.2rem;flex-shrink:0">✕</button>`;
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 12000);
}
(function () {
  if (typeof window === "undefined") return;
  if (isPro()) return;
  const toolMatch = location.pathname.match(/^\/(pdf-[\w-]+|sayfa-[\w-]+|jpg-to-pdf|ocr|filigran-ekle|qr-kod-ekle)(?:\/|$)/);
  if (toolMatch) {
    const tool = toolMatch[1];
    try {
      const s = JSON.parse(localStorage.getItem("mirpdf_funnel_v1") || "{}");
      s.tools = s.tools || {};
      s.tools[tool] = (s.tools[tool] || 0) + 1;
      localStorage.setItem("mirpdf_funnel_v1", JSON.stringify(s));
      if (s.tools[tool] === 2) {
        setTimeout(() => showUpgradeModal("tool2"), 8000);
      }
    } catch (_) {}
  }
  document.addEventListener("change", (e) => {
    if (e.target.type !== "file") return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size / 1024 / 1024 >= 20) showUpgradeModal("bigfile");
  });
  try {
    const tools = JSON.parse(sessionStorage.getItem("mirpdf_session_tools") || "[]");
    const path = location.pathname.replace(/\/+$/, "");
    const isToolPage = path.startsWith("/pdf-") || path.startsWith("/sayfa-") ||
      ["/ocr", "/jpg-to-pdf", "/filigran-ekle", "/qr-kod-ekle"].includes(path);
    if (isToolPage && !tools.includes(path)) {
      tools.push(path);
      sessionStorage.setItem("mirpdf_session_tools", JSON.stringify(tools));
      if (tools.length === 3) {
        setTimeout(() => showNudge("3 farklı araç kullandınız 🚀", "Pro'ya Bak"), 15000);
      }
    }
  } catch (_) {}
})();