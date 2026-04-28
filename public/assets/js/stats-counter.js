/**
 * stats-counter.js — Gerçek Zamanlı İşlem Sayacı
 * /api/analytics/stats'tan veri çeker, animasyonlu sayar
 * Fallback: localStorage cache (5dk), ardından güzel placeholder
 */
(function () {
  'use strict';

  const CACHE_KEY = 'mirpdf_stats_cache';
  const CACHE_TTL = 5 * 60 * 1000; // 5 dakika

  // ── Sayı formatla ───────────────────────────────────────────────────────
  function fmt(n) {
    if (n === null || n === undefined) return '—';
    n = Number(n);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0','') + 'M';
    if (n >= 10_000)    return Math.round(n / 1000) + 'B';  // Türkçe: Bin
    if (n >= 1_000)     return (n / 1000).toFixed(1).replace('.0','') + 'B';
    return String(n);
  }

  // ── Animasyonlu sayaç ───────────────────────────────────────────────────
  function animateCount(el, from, to, duration = 1200) {
    if (!el) return;
    const start = performance.now();
    const diff = to - from;
    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + diff * ease);
      el.textContent = fmt(current);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Cache ────────────────────────────────────────────────────────────────
  function getCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) return null;
      return data;
    } catch { return null; }
  }

  function setCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
  }

  // ── DOM güncelle ─────────────────────────────────────────────────────────
  function updateCounters(data) {
    const counters = {
      '[data-stat="today"]':      data.today      || 0,
      '[data-stat="this_month"]': data.this_month || 0,
      '[data-stat="this_year"]':  data.this_year  || 0,
      '[data-stat="all_time"]':   data.all_time   || 0,
    };

    for (const [sel, val] of Object.entries(counters)) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const current = parseInt(el.textContent.replace(/[^0-9]/g,'')) || 0;
      animateCount(el, current, val);
    }

    // Gizli loading state kaldır
    document.querySelectorAll('.stat-loading').forEach(el => {
      el.classList.remove('stat-loading');
    });
  }

  // ── Fetch ────────────────────────────────────────────────────────────────
  async function fetchStats() {
    // Önce cache
    const cached = getCache();
    if (cached) {
      updateCounters(cached);
    }

    try {
      const res = await fetch('/api/analytics/stats', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { ok, data } = await res.json();
      if (!ok || !data) throw new Error('bad response');

      setCache(data);
      updateCounters(data);
    } catch (err) {
      // Hata → cache varsa zaten gösterdik, yoksa placeholder bırak
      if (!cached) {
        document.querySelectorAll('.stat-loading').forEach(el => {
          el.textContent = '—';
          el.classList.remove('stat-loading');
        });
      }
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    // Sayaç DOM elementleri var mı?
    const hasCounters = document.querySelector('[data-stat]');
    if (!hasCounters) return;

    fetchStats();

    // Her 5 dakikada bir yenile (kullanıcı sayfada açık bırakırsa)
    setInterval(fetchStats, CACHE_TTL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
