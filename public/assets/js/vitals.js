/**
 * vitals.js — Web Vitals (CWV) ölçüm ve raporlama
 * LCP · FID/INP · CLS · TTFB · FCP
 * Plausible'a custom event olarak gönderir.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  function sendToPlausible(name, value, rating) {
    try {
      if (typeof window.plausible !== 'function') return;
      window.plausible('web-vital', {
        props: { metric: name, value: Math.round(value), rating, page: location.pathname },
      });
    } catch (_) {}
  }

  function getRating(name, value) {
    const t = { LCP:[2500,4000], FID:[100,300], INP:[200,500], CLS:[0.1,0.25], TTFB:[800,1800], FCP:[1800,3000] }[name];
    if (!t) return 'unknown';
    return value <= t[0] ? 'good' : value <= t[1] ? 'needs-improvement' : 'poor';
  }

  function observe(type, cb) {
    try { const po = new PerformanceObserver(l => l.getEntries().forEach(cb)); po.observe({ type, buffered: true }); return po; }
    catch (_) { return null; }
  }

  let lcpValue = 0;
  observe('largest-contentful-paint', e => { lcpValue = e.startTime; });

  let clsValue = 0, clsSess = 0, clsEntries = [];
  observe('layout-shift', e => {
    if (e.hadRecentInput) return;
    const first = clsEntries[0], last = clsEntries[clsEntries.length - 1];
    if (clsEntries.length && e.startTime - last.startTime < 1000 && e.startTime - first.startTime < 5000) {
      clsSess += e.value; clsEntries.push(e);
    } else { clsSess = e.value; clsEntries = [e]; }
    if (clsSess > clsValue) clsValue = clsSess;
  });

  observe('first-input', e => {
    const v = e.processingStart - e.startTime;
    sendToPlausible('FID', v, getRating('FID', v));
  });

  let inpValue = 0;
  observe('event', e => { if (e.interactionId && e.duration > inpValue) inpValue = e.duration; });

  function flush() {
    if (lcpValue > 0) sendToPlausible('LCP', lcpValue, getRating('LCP', lcpValue));
    if (clsValue > 0) sendToPlausible('CLS', clsValue * 1000, getRating('CLS', clsValue));
    if (inpValue > 0) sendToPlausible('INP', inpValue, getRating('INP', inpValue));
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); }, { once: true });
  window.addEventListener('pagehide', flush, { once: true });

  function onLoad() {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) { const v = nav.responseStart - nav.requestStart; sendToPlausible('TTFB', v, getRating('TTFB', v)); }
    const fcp = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
    if (fcp) sendToPlausible('FCP', fcp.startTime, getRating('FCP', fcp.startTime));
  }

  document.readyState === 'complete' ? onLoad() : window.addEventListener('load', onLoad);
})();