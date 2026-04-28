/**
 * MirPDF Cookie Consent Manager (CMP)
 * KVKK + GDPR uyumlu — varsayılan: tümü reddedilmiş
 * Entegrasyon: <script src="/assets/js/cookie-consent.js" defer></script>
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'mirpdf_consent_v1';
  const BANNER_ID   = 'mir-cmp-banner';

  /* ---- Kategori tanımları ---- */
  const CATEGORIES = {
    necessary:  { label: 'Zorunlu',     locked: true,  desc: 'Site işlevselliği için gerekli. Devre dışı bırakılamaz.' },
    analytics:  { label: 'Analitik',    locked: false, desc: 'Ziyaretçi davranışını anlamamıza yardımcı olur (anonim).' },
    marketing:  { label: 'Pazarlama',   locked: false, desc: 'Kişiselleştirilmiş reklam ve içerik için kullanılır.' },
    functional: { label: 'İşlevsellik', locked: false, desc: 'Tercihlerinizi hatırlamak için kullanılır.' },
  };

  /* ---- Mevcut tercihi oku ---- */
  function getConsent() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }

  function saveConsent(prefs) {
    prefs.timestamp = Date.now();
    prefs.version   = '1';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    applyConsent(prefs);
    document.dispatchEvent(new CustomEvent('mirConsentUpdate', { detail: prefs }));
  }

  function applyConsent(prefs) {
    /* Google Analytics örneği */
    if (typeof gtag === 'function') {
      gtag('consent', 'update', {
        analytics_storage:  prefs.analytics  ? 'granted' : 'denied',
        ad_storage:         prefs.marketing  ? 'granted' : 'denied',
        functionality_storage: prefs.functional ? 'granted' : 'denied',
      });
    }
  }

  /* ---- Banner'ı kaldır ---- */
  function removeBanner() {
    const el = document.getElementById(BANNER_ID);
    if (el) { el.classList.add('mir-cmp-hide'); setTimeout(() => el.remove(), 300); }
    const overlay = document.getElementById('mir-cmp-overlay');
    if (overlay) overlay.remove();
  }

  /* ---- Detay panelini oluştur ---- */
  function buildDetailPanel() {
    let rows = '';
    Object.entries(CATEGORIES).forEach(([key, cat]) => {
      const checked  = cat.locked ? 'checked' : '';
      const disabled = cat.locked ? 'disabled' : '';
      rows += `
        <div class="mir-cmp-row">
          <div class="mir-cmp-row-info">
            <strong>${cat.label}</strong>
            <span>${cat.desc}</span>
          </div>
          <label class="mir-cmp-toggle ${cat.locked ? 'mir-cmp-locked' : ''}">
            <input type="checkbox" name="${key}" ${checked} ${disabled}>
            <span class="mir-cmp-slider"></span>
          </label>
        </div>`;
    });
    return rows;
  }

  /* ---- Ana banner HTML ---- */
  function buildBanner() {
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Çerez Tercihleri');
    banner.innerHTML = `
      <div class="mir-cmp-simple" id="mir-cmp-simple">
        <div class="mir-cmp-text">
          <strong>🍪 Çerezler hakkında</strong>
          <p>MirPDF, deneyiminizi iyileştirmek için çerezler kullanır. Detaylar için
            <a href="/legal/cookies.html" target="_blank" rel="noopener">Çerez Politikamızı</a> inceleyin.
          </p>
        </div>
        <div class="mir-cmp-actions">
          <button class="mir-cmp-btn mir-cmp-btn-outline" id="mir-cmp-manage">Yönet</button>
          <button class="mir-cmp-btn mir-cmp-btn-reject"  id="mir-cmp-reject">Reddet</button>
          <button class="mir-cmp-btn mir-cmp-btn-accept"  id="mir-cmp-accept">Tümünü Kabul Et</button>
        </div>
      </div>

      <div class="mir-cmp-detail" id="mir-cmp-detail" hidden>
        <div class="mir-cmp-detail-inner">
          <h2>Çerez Tercihlerinizi Yönetin</h2>
          <p>Hangi çerezlere izin vermek istediğinizi seçin. Zorunlu çerezler her zaman aktiftir.</p>
          <div class="mir-cmp-rows">${buildDetailPanel()}</div>
          <div class="mir-cmp-detail-actions">
            <button class="mir-cmp-btn mir-cmp-btn-reject"  id="mir-cmp-reject2">Yalnızca Zorunlu</button>
            <button class="mir-cmp-btn mir-cmp-btn-save"    id="mir-cmp-save">Seçimi Kaydet</button>
            <button class="mir-cmp-btn mir-cmp-btn-accept"  id="mir-cmp-accept2">Tümünü Kabul Et</button>
          </div>
        </div>
      </div>`;
    return banner;
  }

  /* ---- Tercih kaydet yardımcıları ---- */
  function acceptAll() {
    saveConsent({ necessary: true, analytics: true, marketing: true, functional: true });
    removeBanner();
  }

  function rejectAll() {
    saveConsent({ necessary: true, analytics: false, marketing: false, functional: false });
    removeBanner();
  }

  function saveSelected(banner) {
    const prefs = { necessary: true };
    banner.querySelectorAll('input[type=checkbox]:not([disabled])').forEach(cb => {
      prefs[cb.name] = cb.checked;
    });
    saveConsent(prefs);
    removeBanner();
  }

  /* ---- Banner'ı göster ---- */
  function showBanner() {
    /* Önceden reddedildi/kabul edildi ise gösterme */
    const consent = getConsent();
    if (consent && consent.timestamp) { applyConsent(consent); return; }

    const banner = buildBanner();
    document.body.appendChild(banner);

    /* Olay dinleyicileri */
    document.getElementById('mir-cmp-accept').addEventListener('click', acceptAll);
    document.getElementById('mir-cmp-accept2').addEventListener('click', acceptAll);
    document.getElementById('mir-cmp-reject').addEventListener('click', rejectAll);
    document.getElementById('mir-cmp-reject2').addEventListener('click', rejectAll);

    document.getElementById('mir-cmp-manage').addEventListener('click', () => {
      document.getElementById('mir-cmp-simple').hidden  = true;
      document.getElementById('mir-cmp-detail').hidden  = false;
    });

    document.getElementById('mir-cmp-save').addEventListener('click', () => saveSelected(banner));
  }

  /* ---- "Çerez Tercihlerimi Değiştir" linki için global fonksiyon ---- */
  window.mirOpenCookiePrefs = function () {
    localStorage.removeItem(STORAGE_KEY);
    showBanner();
    const detail = document.getElementById('mir-cmp-detail');
    if (detail) {
      document.getElementById('mir-cmp-simple').hidden = true;
      detail.hidden = false;
    }
  };

  /* ---- Sayfa yüklenince çalıştır ---- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }

  /* ==================== STYLES ==================== */
  const style = document.createElement('style');
  style.textContent = `
#${BANNER_ID} {
  position: fixed;
  bottom: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  width: min(720px, calc(100vw - 2rem));
  font-family: 'Figtree', system-ui, sans-serif;
  font-size: .9rem;
  line-height: 1.5;
  transition: opacity .3s, transform .3s;
}
#${BANNER_ID}.mir-cmp-hide { opacity: 0; transform: translateX(-50%) translateY(1rem); pointer-events: none; }

.mir-cmp-simple {
  background: #fff;
  border: 1px solid #e3e6f0;
  border-radius: 18px;
  box-shadow: 0 8px 32px rgba(0,0,0,.14);
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
}
.mir-cmp-text { flex: 1; min-width: 200px; }
.mir-cmp-text strong { display: block; margin-bottom: .2rem; color: #0d0f1a; }
.mir-cmp-text p { color: #64748b; font-size: .84rem; margin: 0; }
.mir-cmp-text a { color: #6366f1; }

.mir-cmp-actions { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; }

.mir-cmp-btn {
  border: none; cursor: pointer; font-family: inherit; font-size: .84rem;
  font-weight: 700; padding: .55rem 1.1rem; border-radius: 10px;
  transition: opacity .15s, transform .1s; white-space: nowrap;
}
.mir-cmp-btn:hover { opacity: .85; transform: translateY(-1px); }
.mir-cmp-btn-accept  { background: #6366f1; color: #fff; }
.mir-cmp-btn-reject  { background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; }
.mir-cmp-btn-outline { background: transparent; color: #6366f1; border: 1.5px solid #6366f1; }
.mir-cmp-btn-save    { background: #0d0f1a; color: #fff; }

.mir-cmp-detail {
  background: #fff;
  border: 1px solid #e3e6f0;
  border-radius: 18px;
  box-shadow: 0 8px 32px rgba(0,0,0,.14);
  overflow: hidden;
}
.mir-cmp-detail-inner { padding: 1.75rem; }
.mir-cmp-detail-inner h2 { font-size: 1.05rem; font-weight: 800; color: #0d0f1a; margin-bottom: .4rem; }
.mir-cmp-detail-inner > p { color: #64748b; font-size: .84rem; margin-bottom: 1.25rem; }

.mir-cmp-rows { display: flex; flex-direction: column; gap: 0; border: 1px solid #e3e6f0; border-radius: 12px; overflow: hidden; margin-bottom: 1.25rem; }
.mir-cmp-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: .85rem 1rem; gap: 1rem;
  border-bottom: 1px solid #e3e6f0; background: #fff;
}
.mir-cmp-row:last-child { border-bottom: none; }
.mir-cmp-row:nth-child(even) { background: #f8fafc; }
.mir-cmp-row-info { flex: 1; }
.mir-cmp-row-info strong { display: block; font-size: .88rem; color: #0d0f1a; margin-bottom: .15rem; }
.mir-cmp-row-info span { font-size: .79rem; color: #94a3b8; }

.mir-cmp-toggle { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
.mir-cmp-toggle input { opacity: 0; width: 0; height: 0; }
.mir-cmp-slider {
  position: absolute; inset: 0; background: #cbd5e1; border-radius: 24px;
  cursor: pointer; transition: background .2s;
}
.mir-cmp-slider::before {
  content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px;
  background: #fff; border-radius: 50%; transition: transform .2s;
  box-shadow: 0 1px 3px rgba(0,0,0,.2);
}
.mir-cmp-toggle input:checked + .mir-cmp-slider { background: #6366f1; }
.mir-cmp-toggle input:checked + .mir-cmp-slider::before { transform: translateX(20px); }
.mir-cmp-locked .mir-cmp-slider { background: #a5b4fc; cursor: not-allowed; }

.mir-cmp-detail-actions { display: flex; gap: .6rem; justify-content: flex-end; flex-wrap: wrap; }

@media (max-width: 540px) {
  .mir-cmp-simple { flex-direction: column; align-items: flex-start; padding: 1rem; }
  .mir-cmp-actions { width: 100%; }
  .mir-cmp-btn { flex: 1; text-align: center; }
  .mir-cmp-detail-inner { padding: 1.25rem 1rem; }
  .mir-cmp-detail-actions { justify-content: stretch; }
  .mir-cmp-detail-actions .mir-cmp-btn { flex: 1; }
}`;
  document.head.appendChild(style);
})();
