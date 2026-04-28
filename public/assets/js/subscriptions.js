/**
 * MirPDF Web Push + Newsletter UI Yardımcısı
 * ============================================
 * Bu dosyayı /public/assets/js/subscriptions.js olarak ekle.
 * Her sayfada: <script src="/assets/js/subscriptions.js" defer></script>
 *
 * Sağlanan global fonksiyonlar:
 *   mirSubscribePush()        — push bildirimlere abone ol
 *   mirUnsubscribePush()      — push aboneliğini iptal et
 *   mirSubscribeNewsletter(email, source)  — bülten aboneliği
 *   mirGetPushState()         — 'granted'|'denied'|'default'|'unsupported'
 */

(function () {
  'use strict';

  const API_BASE = '';

  /* ── Push ── */
  async function getPushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  window.mirGetPushState = function () {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'granted'|'denied'|'default'
  };

  window.mirSubscribePush = async function () {
    if (!('serviceWorker' in navigator) || !('PushManager' in window))
      return { ok: false, error: 'UNSUPPORTED' };

    const perm = await Notification.requestPermission();
    if (perm !== 'granted')
      return { ok: false, error: 'PERMISSION_DENIED' };

    const reg = await navigator.serviceWorker.ready;

    /* VAPID public key'i backend'den al */
    let vapidKey;
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: { endpoint: 'probe' } }),
      });
      const j = await res.json().catch(() => ({}));
      vapidKey = j.vapidPublicKey;
    } catch { /* ignore */ }

    if (!vapidKey)
      return { ok: false, error: 'NO_VAPID_KEY' };

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const token = localStorage.getItem('mirpdf_jwt') || null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok && j.ok, ...j };
  };

  window.mirUnsubscribePush = async function () {
    const sub = await getPushSubscription();
    if (!sub) return { ok: true };
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
    return { ok: true };
  };

  /* ── Newsletter ── */
  window.mirSubscribeNewsletter = async function (email, source = 'web') {
    const token = localStorage.getItem('mirpdf_jwt') || null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch('/api/newsletter/subscribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, source }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok && j.ok, ...j };
  };

  /* ── Yardımcı: base64url → Uint8Array (VAPID) ── */
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  /* ── Footer newsletter formu — otomatik bağlama ── */
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('mirNewsletterForm');
    if (!form) return;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const input  = form.querySelector('input[type=email]');
      const btn    = form.querySelector('button[type=submit]');
      const msg    = document.getElementById('mirNewsletterMsg');
      const email  = input?.value?.trim();
      if (!email) return;

      btn.disabled = true;
      btn.textContent = '…';

      const source = form.dataset.source || 'footer';
      const result = await window.mirSubscribeNewsletter(email, source);

      if (result.ok || result.already) {
        if (msg) { msg.textContent = result.already ? '✅ Zaten kayıtlısınız!' : '✅ Abone oldunuz!'; msg.style.color = '#10b981'; }
        input.value = '';
      } else {
        if (msg) { msg.textContent = result.message || '❌ Bir sorun oluştu, tekrar deneyin.'; msg.style.color = '#ef4444'; }
      }
      btn.disabled = false;
      btn.textContent = 'Abone Ol';
    });
  });
})();
