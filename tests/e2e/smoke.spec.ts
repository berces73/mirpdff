import { test, expect } from '@playwright/test';

// ── HOMEPAGE ────────────────────────────────────────────────────────────────
test.describe('Ana Sayfa', () => {
  test('yükleniyor ve araçlar görünüyor', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/MirPDF/);
    await expect(page.locator('#tools')).toBeVisible();
    await expect(page.locator('a[href*="pdf-birlestir"]').first()).toBeVisible();
  });

  test('nav linkleri çalışıyor', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a[href="/pricing"]')).toBeVisible();
    await expect(page.locator('nav a[href="/faq"]')).toBeVisible();
  });

  test('mobil nav toggle çalışıyor', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const toggle = page.locator('#mobileToggle, #nav-toggle').first();
    if (await toggle.isVisible()) {
      await toggle.click();
      await expect(page.locator('nav .nav-links, nav#mainNav')).toBeVisible();
    }
  });
});

// ── PRICING ──────────────────────────────────────────────────────────────────
test.describe('Fiyatlandırma', () => {
  test('plan kartları görünüyor', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page).toHaveTitle(/Fiyatlandırma|Pricing/);
    await expect(page.locator('.plan-card').first()).toBeVisible();
  });

  test('billing toggle çalışıyor', async ({ page }) => {
    await page.goto('/pricing');
    const toggle = page.locator('#billingToggle');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveClass(/annual/);
  });
});

// ── PDF TOOLS ─────────────────────────────────────────────────────────────
test.describe('PDF Araçları', () => {
  const tools = [
    { path: '/pdf-birlestir', title: /Birleştir|Merge/ },
    { path: '/pdf-sikistir', title: /Sıkıştır|Compress/ },
    { path: '/ocr', title: /OCR/ },
    { path: '/pdf-to-word', title: /Word/ },
  ];

  for (const tool of tools) {
    test(`${tool.path} yükleniyor`, async ({ page }) => {
      await page.goto(tool.path);
      await expect(page).toHaveTitle(tool.title);
      // File upload area veya tool container görünür olmalı
      const uploader = page.locator(
        '[data-tool], .tool-upload, .upload-area, input[type="file"], .dropzone'
      ).first();
      await expect(uploader).toBeAttached();
    });
  }
});

// ── AUTH ──────────────────────────────────────────────────────────────────
test.describe('Auth Sayfaları', () => {
  test('login sayfası form içeriyor', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    // password input veya magic link butonu görünür
    const hasPassword = await page.locator('input[type="password"]').isVisible();
    const hasMagicLink = await page.locator('text=Bağlantı ile, text=Magic Link').first().isVisible().catch(() => false);
    expect(hasPassword || hasMagicLink).toBeTruthy();
  });

  test('register sayfası form içeriyor', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"], #submitBtn')).toBeVisible();
  });

  test('login form keyboard submit çalışıyor', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').first().fill('test@example.com');
    const pw = page.locator('input[type="password"]');
    if (await pw.isVisible()) {
      await pw.fill('wrongpassword');
      await pw.press('Enter');
      // Hata mesajı göstermeli (401/yanlış şifre)
      await expect(
        page.locator('.error, .msg-error, [class*="error"], [class*="danger"]').first()
      ).toBeVisible({ timeout: 5000 });
    }
  });
});

// ── SEO META ─────────────────────────────────────────────────────────────
test.describe('SEO Meta Kalitesi', () => {
  const pages = ['/', '/pricing', '/faq', '/about', '/register', '/login'];

  for (const path of pages) {
    test(`${path} — description 100+ karakter`, async ({ page }) => {
      await page.goto(path);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc).toBeTruthy();
      expect(desc!.length).toBeGreaterThanOrEqual(100);
    });

    test(`${path} — twitter:description mevcut`, async ({ page }) => {
      await page.goto(path);
      const tw = await page.locator('meta[name="twitter:description"]').getAttribute('content');
      expect(tw).toBeTruthy();
      expect(tw!.length).toBeGreaterThan(30);
    });
  }
});

// ── LOCALE ───────────────────────────────────────────────────────────────
test.describe('Locale Sayfaları', () => {
  const localePaths = ['/fr/compress-pdf', '/de/compress-pdf', '/es/compress-pdf'];

  for (const path of localePaths) {
    test(`${path} — /en/ CTA linki yok`, async ({ page }) => {
      await page.goto(path);
      const enLinks = await page.locator('a[href*="/en/"]:not([hreflang])').all();
      // hreflang dışında /en/ linki olmamalı
      const ctaEnLinks = [];
      for (const link of enLinks) {
        const style = await link.getAttribute('style') || '';
        if (style.includes('inline')) ctaEnLinks.push(link);
      }
      expect(ctaEnLinks.length).toBe(0);
    });
  }
});

// ── LEGAL ────────────────────────────────────────────────────────────────
test.describe('Legal Sayfalar', () => {
  const legalPages = [
    '/legal/terms.html',
    '/legal/privacy.html',
    '/legal/security.html',
    '/legal/cookies.html',
  ];

  for (const path of legalPages) {
    test(`${path} — yükleniyor ve description var`, async ({ page }) => {
      await page.goto(path);
      await expect(page).not.toHaveTitle(/404|Bulunamadı/);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc).toBeTruthy();
      expect(desc!.length).toBeGreaterThan(50);
    });
  }
});

// ── 404 ──────────────────────────────────────────────────────────────────
test('404 sayfası düzgün çalışıyor', async ({ page }) => {
  const response = await page.goto('/bu-sayfa-kesinlikle-yok-12345');
  // Either Cloudflare returns 404 or custom 404 page loads
  const title = await page.title();
  expect(response?.status() === 404 || /404|Bulunamadı/.test(title)).toBeTruthy();
});
