let _state = { isOpen: false };
let _els = null;
function ensureStyles() {
  if (document.getElementById("__paywall_styles")) return;
  const css = `
  .pw-overlay{position:fixed;inset:0;background:rgba(13,15,26,.55);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px;backdrop-filter:blur(4px)}
  .pw-overlay.pw-show{display:flex}
  .pw-modal{width:min(480px,100%);background:#ffffff;color:#0d0f1a;border:1px solid #e3e6f0;border-radius:18px;box-shadow:0 24px 64px rgba(0,0,0,.13);padding:24px;font-family:'Figtree',system-ui,sans-serif}
  .pw-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:4px}
  .pw-title{font-size:1.2rem;font-weight:800;line-height:1.2;margin:0;color:#0d0f1a}
  .pw-close{background:transparent;border:1px solid #e3e6f0;color:#64748b;border-radius:10px;padding:5px 10px;cursor:pointer;font-size:.9rem;transition:background .15s}
  .pw-close:hover{background:#f7f8fc}
  .pw-body{margin-top:8px;color:#64748b;font-size:.92rem;line-height:1.65}
  .pw-divider{border:none;border-top:1px solid #e3e6f0;margin:16px 0}
  .pw-features{list-style:none;padding:0;margin:0 0 16px;display:flex;flex-direction:column;gap:6px}
  .pw-features li{display:flex;align-items:center;gap:8px;font-size:.85rem;color:#374151}
  .pw-features li::before{content:'✓';color:#15803d;font-weight:800;flex-shrink:0}
  .pw-actions{display:flex;gap:10px;flex-wrap:wrap}
  .pw-btn{border-radius:12px;border:1.5px solid #e3e6f0;padding:11px 20px;cursor:pointer;font-weight:700;font-size:.9rem;font-family:inherit;transition:all .15s}
  .pw-primary{background:#0d0f1a;color:#fff;border-color:#0d0f1a;flex:1}
  .pw-primary:hover{opacity:.85}
  .pw-secondary{background:#fff;color:#64748b;flex-shrink:0}
  .pw-secondary:hover{background:#f7f8fc;color:#0d0f1a}
  .pw-note{margin-top:12px;font-size:.78rem;color:#94a3b8;text-align:center}
  `;
  const style = document.createElement("style");
  style.id = "__paywall_styles";
  style.textContent = css;
  document.head.appendChild(style);
}
function ensureDOM() {
  ensureStyles();
  let overlay = document.getElementById("__paywall");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "__paywall";
  overlay.className = "pw-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Paywall");
  overlay.innerHTML = `
    <div class="pw-modal">
      <div class="pw-head">
        <h2 class="pw-title" id="__pw_title">Kullanım limiti</h2>
        <button class="pw-close" id="__pw_close" aria-label="Kapat">✕</button>
      </div>
      <div class="pw-body" id="__pw_body"></div>
      <hr class="pw-divider">
      <ul class="pw-features" id="__pw_features">
        <li>10.000 kredi/ay — OCR ve PDF→Word</li>
        <li>Öncelikli sunucu — daha hızlı işlem</li>
        <li>Toplu işlem — 10 dosyayı aynı anda</li>
        <li>İstediğin zaman iptal</li>
      </ul>
      <div class="pw-actions">
        <button class="pw-btn pw-primary" id="__pw_primary">Pro'ya Geç — ₺79/ay · 10.000 Kredi</button>
        <button class="pw-btn pw-secondary" id="__pw_secondary">Şimdi değil</button>
      </div>
      <div class="pw-note" id="__pw_note">14 gün iade garantisi · Stripe ile güvenli ödeme · İstediğin zaman iptal</div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePaywall();
  });
  document.getElementById("__pw_close")?.addEventListener("click", closePaywall);
  document.getElementById("__pw_secondary")?.addEventListener("click", closePaywall);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _state.isOpen) closePaywall();
  });
  document.getElementById("__pw_primary")?.addEventListener("click", () => {
    window.location.href = "/pricing";
  });
  _els = {
    overlay,
    title: document.getElementById("__pw_title"),
    body: document.getElementById("__pw_body"),
    note: document.getElementById("__pw_note"),
  };
  return overlay;
}
function messageForReason(reason, tier, extra = {}) {
  switch (reason) {
    case "login_required":
      return {
        title: "Giriş gerekli",
        body: "Bu özelliği kullanmak için ücretsiz hesap oluşturman yeterli.",
        note: "",
        primaryLabel: "Giriş Yap",
        primaryHref: "/login?redirect=" + encodeURIComponent(location.pathname),
        secondaryLabel: "Kayıt Ol",
        secondaryHref: "/register",
      };
    case "low_credits":
      return {
        title: "Kredin bitmek üzere",
        body: "Bu işlemi tamamlayabilirsin ama kredin az kaldı. Kesintisiz kullanım için Pro'ya geç.",
        note: "Pro plana geçince 5.000 kredi/ay kazanırsın.",
        primaryLabel: "Pro'ya Geç",
        primaryHref: "/pricing",
        secondaryLabel: "Devam Et",
        secondaryHref: null,
      };
    case "credits":
      return {
        title: "Kredi bitti",
        body: `Bu işlem için kredin yetersiz.${tier ? ` Plan: ${tier}` : ""}`.trim(),
        note: extra?.resetAt ? `Sıfırlanma: ${extra.resetAt}` : "Plan yükseltmen gerekebilir.",
      };
    case "rate_limit":
      return {
        title: "Çok hızlı denedin",
        body: "Kısa sürede çok istek gönderdin. Biraz bekleyip tekrar dene.",
        note: extra?.retryAfter ? `Tekrar dene: ~${extra.retryAfter}s` : "Rate limit koruması devrede.",
      };
    case "network":
      return {
        title: "Bağlantı sorunu",
        body: "Sunucuya bağlanılamadı. İnternetini kontrol et ve tekrar dene.",
        note: "Geçici ağ hatası olabilir.",
      };
    default:
      return {
        title: "Bir hata oluştu",
        body: "İşlem tamamlanamadı. Tekrar dene.",
        note: "",
      };
  }
}
export function openPaywall({ reason = "error", tier = null, retryAfter = null, resetAt = null } = {}) {
  ensureDOM();
  const msg = messageForReason(reason, tier, { retryAfter, resetAt });
  _els?.title && (_els.title.textContent = msg.title);
  _els?.body && (_els.body.textContent = msg.body);
  _els?.note && (_els.note.textContent = msg.note || "");
  const primary = document.getElementById("__pw_primary");
  if (primary) {
    primary.textContent = msg.primaryLabel || "Planları Gör";
    primary.onclick = () => { window.location.href = msg.primaryHref || "/pricing"; };
  }
  const secondary = document.getElementById("__pw_secondary");
  if (secondary && msg.secondaryHref) {
    secondary.textContent = msg.secondaryLabel || "Kayıt Ol";
    secondary.onclick = () => { window.location.href = msg.secondaryHref; };
  } else if (secondary) {
    secondary.textContent = "Kapat";
    secondary.onclick = closePaywall;
  }
  _els?.overlay?.classList.add("pw-show");
  _state.isOpen = true;
}
export function closePaywall() {
  document.getElementById("__paywall")?.classList.remove("pw-show");
  _state.isOpen = false;
}