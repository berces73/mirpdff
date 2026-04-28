/**
 * lang-switcher.js — MirPDF Dil / Language Switcher
 * Her sayfada mevcut URL'den doğru dil hedefini belirler.
 * nav.js (mainNav) ve tool-nav.js (nav-links) ile uyumlu.
 */

// ── URL Mapping ─────────────────────────────────────────────────────────────
const TR_TO_EN = {
  "/": "/en/",
  "/pricing": "/en/pricing",
  "/about": "/en/about",
  "/contact": "/en/contact",
  "/faq": "/en/faq",
  "/articles/": "/en/",
  "/pdf-birlestir": "/en/merge-pdf",
  "/pdf-bol": "/en/split-pdf",
  "/pdf-sikistir": "/en/compress-pdf",
  "/pdf-to-word": "/en/pdf-to-word",
  "/ocr": "/en/ocr-pdf",
  "/jpg-to-pdf": "/en/jpg-to-pdf",
  "/pdf-to-jpg": "/en/pdf-to-jpg",
  "/pdf-dondur": "/en/rotate-pdf",
  "/sayfa-sil": "/en/delete-pdf-pages",
  "/sayfa-sirala": "/en/reorder-pdf-pages",
  "/pdf-kilitle": "/en/lock-pdf",
  "/pdf-kilit-ac": "/en/unlock-pdf",
  "/pdf-imzala": "/en/sign-pdf",
  "/pdf-duzenle": "/en/edit-pdf",
  "/filigran-ekle": "/en/watermark-pdf",
  "/qr-kod-ekle": "/en/add-qr-code-pdf",
  "/pdf-metadata-duzenle": "/en/edit-pdf-metadata",
  "/pdf-sayfa-kirp": "/en/crop-pdf",
  "/pdf-arka-plan-ekle": "/en/pdf-background",
  "/pdf-sayfa-kopyala": "/en/duplicate-pdf-pages",
  "/pdf-sayfa-ayikla": "/en/extract-pdf-pages",
  "/pdf-sayfa-numarala": "/en/number-pdf-pages",
  "/word-to-pdf": "/en/word-to-pdf",
  "/excel-to-pdf": "/en/excel-to-pdf",
  "/ppt-to-pdf": "/en/ppt-to-pdf",
};

const EN_TO_TR = {
  "/en/": "/",
  "/en/index.html": "/",
  "/en/pricing": "/pricing",
  "/en/about": "/about",
  "/en/contact": "/contact",
  "/en/faq": "/faq",
  "/en/merge-pdf": "/pdf-birlestir",
  "/en/split-pdf": "/pdf-bol",
  "/en/compress-pdf": "/pdf-sikistir",
  "/en/pdf-to-word": "/pdf-to-word",
  "/en/ocr-pdf": "/ocr",
  "/en/jpg-to-pdf": "/jpg-to-pdf",
  "/en/pdf-to-jpg": "/pdf-to-jpg",
  "/en/rotate-pdf": "/pdf-dondur",
  "/en/delete-pdf-pages": "/sayfa-sil",
  "/en/reorder-pdf-pages": "/sayfa-sirala",
  "/en/lock-pdf": "/pdf-kilitle",
  "/en/unlock-pdf": "/pdf-kilit-ac",
  "/en/sign-pdf": "/pdf-imzala",
  "/en/edit-pdf": "/pdf-duzenle",
  "/en/watermark-pdf": "/filigran-ekle",
  "/en/add-qr-code-pdf": "/qr-kod-ekle",
  "/en/edit-pdf-metadata": "/pdf-metadata-duzenle",
  "/en/crop-pdf": "/pdf-sayfa-kirp",
  "/en/pdf-background": "/pdf-arka-plan-ekle",
  "/en/duplicate-pdf-pages": "/pdf-sayfa-kopyala",
  "/en/extract-pdf-pages": "/pdf-sayfa-ayikla",
  "/en/number-pdf-pages": "/pdf-sayfa-numarala",
  "/en/word-to-pdf": "/word-to-pdf",
  "/en/excel-to-pdf": "/excel-to-pdf",
  "/en/ppt-to-pdf": "/ppt-to-pdf",
};

// ── URL çözücü ───────────────────────────────────────────────────────────────
function resolveTargetUrl(currentPath, targetLang) {
  // Trailing slash normalize
  const path = currentPath.replace(/\/$/, '') || '/';

  if (targetLang === 'en') {
    // Zaten EN mi?
    if (path.startsWith('/en')) return null; // aktif dil
    return TR_TO_EN[path] || TR_TO_EN[path + '/'] || '/en/';
  } else {
    // Zaten TR mi?
    if (!path.startsWith('/en')) return null; // aktif dil
    return EN_TO_TR[path] || EN_TO_TR[path + '/'] || '/';
  }
}

function isEnglish() {
  return location.pathname.startsWith('/en');
}

// ── Switcher DOM'u ───────────────────────────────────────────────────────────
export function createLangSwitcher() {
  const currentIsEn = isEnglish();
  const trUrl = resolveTargetUrl(location.pathname, 'tr') || '/';
  const enUrl = resolveTargetUrl(location.pathname, 'en') || '/en/';

  const wrap = document.createElement('div');
  wrap.id = '__lang_switcher';
  wrap.setAttribute('role', 'navigation');
  wrap.setAttribute('aria-label', 'Language selector');

  wrap.innerHTML = `
    <button class="ls-trigger" aria-haspopup="true" aria-expanded="false" id="__ls_btn"
      title="${currentIsEn ? 'Language / Dil' : 'Dil / Language'}">
      ${currentIsEn ? '🇬🇧 EN' : '🇹🇷 TR'}
      <svg class="ls-caret" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="ls-dropdown" id="__ls_dropdown" role="menu" aria-hidden="true">
      <a href="${trUrl}" class="ls-option ${!currentIsEn ? 'ls-active' : ''}" role="menuitem" hreflang="tr" lang="tr">
        <span class="ls-flag">🇹🇷</span>
        <span class="ls-name">Türkçe</span>
        ${!currentIsEn ? '<svg class="ls-check" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
      </a>
      <a href="${enUrl}" class="ls-option ${currentIsEn ? 'ls-active' : ''}" role="menuitem" hreflang="en" lang="en">
        <span class="ls-flag">🇬🇧</span>
        <span class="ls-name">English</span>
        ${currentIsEn ? '<svg class="ls-check" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
      </a>
    </div>
  `;

  // Toggle davranışı
  const btn = wrap.querySelector('#__ls_btn');
  const dropdown = wrap.querySelector('#__ls_dropdown');

  function open() {
    dropdown.classList.add('ls-open');
    dropdown.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
  }
  function close() {
    dropdown.classList.remove('ls-open');
    dropdown.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.contains('ls-open') ? close() : open();
  });

  // Dışarı tıklayınca kapat
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });

  // Escape tuşu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return wrap;
}

// ── Stil enjeksiyonu ─────────────────────────────────────────────────────────
export function injectLangSwitcherStyles() {
  if (document.getElementById('__ls_styles')) return;
  const s = document.createElement('style');
  s.id = '__ls_styles';
  s.textContent = `
    #__lang_switcher {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    /* Trigger butonu */
    .ls-trigger {
      display: inline-flex;
      align-items: center;
      gap: .3rem;
      background: none;
      border: 1px solid var(--border, #e9ecef);
      color: var(--text, #1a1a2e);
      font-family: 'Figtree', -apple-system, sans-serif;
      font-size: .82rem;
      font-weight: 600;
      padding: .35rem .65rem;
      border-radius: 8px;
      cursor: pointer;
      transition: background .15s, border-color .15s, box-shadow .15s;
      white-space: nowrap;
      line-height: 1;
    }
    .ls-trigger:hover {
      background: var(--bg2, #f8f9fa);
      border-color: var(--accent, #6366f1);
      box-shadow: 0 0 0 3px rgba(99,102,241,.1);
    }
    .ls-caret {
      transition: transform .2s cubic-bezier(.4,0,.2,1);
      opacity: .6;
    }
    .ls-trigger[aria-expanded="true"] .ls-caret {
      transform: rotate(180deg);
    }

    /* Dropdown */
    .ls-dropdown {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      background: var(--bg, #fff);
      border: 1px solid var(--border, #e9ecef);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.06);
      min-width: 140px;
      padding: .35rem;
      opacity: 0;
      transform: translateY(-6px) scale(.97);
      pointer-events: none;
      transition: opacity .18s cubic-bezier(.4,0,.2,1), transform .18s cubic-bezier(.4,0,.2,1);
      z-index: 9999;
    }
    .ls-dropdown.ls-open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* Seçenekler */
    .ls-option {
      display: flex;
      align-items: center;
      gap: .55rem;
      padding: .55rem .75rem;
      border-radius: 8px;
      text-decoration: none;
      color: var(--text, #1a1a2e);
      font-size: .84rem;
      font-weight: 500;
      transition: background .12s;
      cursor: pointer;
    }
    .ls-option:hover {
      background: var(--bg2, #f8f9fa);
    }
    .ls-option.ls-active {
      background: var(--bg2, #f8f9fa);
      font-weight: 700;
      color: var(--accent, #6366f1);
    }
    .ls-flag { font-size: 1rem; line-height: 1; }
    .ls-name { flex: 1; }
    .ls-check { color: var(--accent, #6366f1); flex-shrink: 0; }

    /* Dark mode */
    [data-theme="dark"] .ls-dropdown {
      background: var(--bg, #0f172a);
      border-color: var(--border, #334155);
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
    }
    [data-theme="dark"] .ls-option:hover {
      background: var(--bg2, #1e293b);
    }
    [data-theme="dark"] .ls-option.ls-active {
      background: var(--bg2, #1e293b);
    }

    /* Mobile — dropdown sola doğru açılabilir */
    @media (max-width: 640px) {
      .ls-dropdown { right: auto; left: 0; }
    }
  `;
  document.head.appendChild(s);
}

// ── Ana init — otomatik nav'a yerleştir ─────────────────────────────────────
export function initLangSwitcher() {
  injectLangSwitcherStyles();
  const switcher = createLangSwitcher();

  // lang tercihini localStorage'a kaydet
  const currentIsEn = isEnglish();
  try {
    localStorage.setItem('mirpdf_lang', currentIsEn ? 'en' : 'tr');
  } catch (_) {}

  // Nav'a ekle — iki farklı nav yapısını destekle
  function inject() {
    // mainNav (index, pricing, about vb.)
    const mainNav = document.getElementById('mainNav');
    if (mainNav && !document.getElementById('__lang_switcher')) {
      mainNav.appendChild(switcher);
      return true;
    }
    // .nav-links (tool sayfaları)
    const navLinks = document.querySelector('.nav-links');
    if (navLinks && !document.getElementById('__lang_switcher')) {
      // nav-btn (Premium/Kayıt)'den önce ekle
      const navBtn = navLinks.querySelector('.nav-btn');
      if (navBtn) {
        navLinks.insertBefore(switcher, navBtn);
      } else {
        navLinks.appendChild(switcher);
      }
      return true;
    }
    return false;
  }

  if (!inject()) {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  }
}
