/**
 * MirPDF Smoke Tests
 * Kullanım: node tests/smoke.test.js [BASE_URL]
 * Örnek: node tests/smoke.test.js https://mirpdf.com
 */
const BASE = process.argv[2] || 'http://localhost:8787';

const ROUTES = [
  // Core
  { path: '/',                  expect: 200, label: 'Ana sayfa' },
  { path: '/pricing',           expect: 200, label: 'Fiyatlar' },
  { path: '/faq',               expect: 200, label: 'SSS' },
  { path: '/about',             expect: 200, label: 'Hakkında' },
  // Tools
  { path: '/pdf-birlestir',     expect: 200, label: 'PDF Birleştir' },
  { path: '/pdf-sikistir',      expect: 200, label: 'PDF Sıkıştır' },
  { path: '/pdf-to-word',       expect: 200, label: 'PDF→Word' },
  { path: '/ocr',               expect: 200, label: 'OCR' },
  { path: '/jpg-to-pdf',        expect: 200, label: 'JPG→PDF' },
  // Auth
  { path: '/login',             expect: 200, label: 'Login' },
  { path: '/register',          expect: 200, label: 'Kayıt' },
  // Locale
  { path: '/en/merge-pdf',      expect: 200, label: 'EN merge-pdf' },
  { path: '/en/compress-pdf',   expect: 200, label: 'EN compress-pdf' },
  { path: '/en/pdf-to-word',    expect: 200, label: 'EN pdf-to-word' },
  { path: '/en/ocr-pdf',        expect: 200, label: 'EN ocr-pdf' },
  { path: '/fr/merge-pdf',      expect: 200, label: 'FR merge-pdf' },
  { path: '/de/compress-pdf',   expect: 200, label: 'DE compress-pdf' },
  { path: '/fr/pricing',        expect: 200, label: 'FR pricing' },
  // Health — worker endpoint is /health (NOT /api/health)
  { path: '/health',            expect: 200, label: 'Worker health' },
  // Redirects
  { path: '/pdf-birlestir/',    expect: [200,301], label: 'Trailing slash redirect' },
  // 404
  { path: '/bu-sayfa-yoktur-kesin', expect: 404, label: '404 handler' },
];

let pass = 0, fail = 0;

async function check(route) {
  try {
    const res = await fetch(BASE + route.path, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    const expected = Array.isArray(route.expect) ? route.expect : [route.expect];
    const ok = expected.includes(res.status);
    if (ok) {
      console.log(`  ✅ [${res.status}] ${route.label}`);
      pass++;
    } else {
      console.log(`  ❌ [${res.status}] ${route.label} — beklenen: ${expected.join('|')}`);
      fail++;
    }
  } catch(e) {
    console.log(`  ❌ [ERR] ${route.label}: ${e.message}`);
    fail++;
  }
}

(async () => {
  console.log(`\nMirPDF Smoke Test → ${BASE}\n`);
  for (const r of ROUTES) await check(r);
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  ✅ PASS: ${pass}  ❌ FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})();
