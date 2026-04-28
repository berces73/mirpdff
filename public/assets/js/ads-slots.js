/**
 * MirPDF Ads/Affiliate Slot Loader
 * Uses /api/ab-test?variant=ads_variant to decide what to render.
 * Finds: [data-ad-slot]
 */
(async function(){
  function $(sel){ return document.querySelector(sel); }
  function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

  const slots = $all("[data-ad-slot]");
  if (!slots.length) return;

  // anonymous id for deterministic AB
  const uidKey = "mirpdf_anon_id";
  let anon = "";
  try {
    anon = localStorage.getItem(uidKey) || "";
    if (!anon) { anon = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2))); localStorage.setItem(uidKey, anon); }
  } catch(_) { anon = "anon"; }

  async function getVariant(){
    try{
      const res = await fetch(`/api/ab-test?variant=ads_variant&userId=${encodeURIComponent(anon)}`, { credentials:"same-origin" });
      const j = await res.json().catch(()=>null);
      return j?.variant || "none";
    }catch(_){ return "none"; }
  }

  const variant = await getVariant();

  function hasRealAdsenseClient(value) {
    const client = String(value || "").trim();
    return !!client && /^ca-pub-\d{10,}$/.test(client);
  }

  function hasRealAdsenseSlot(value) {
    const slot = String(value || "").trim();
    return !!slot && /^\d{6,}$/.test(slot);
  }

  function renderAffiliate(el){
    const tool = document.querySelector('meta[name="mirpdf:tool"]')?.content || "";
    el.innerHTML = `
      <div style="border:1px solid rgba(148,163,184,.25);border-radius:12px;padding:14px;background:rgba(15,23,42,.35)">
        <div style="font-weight:800;margin-bottom:6px">📌 Daha Hızlı Sonuç mu?</div>
        <div style="color:#94a3b8;font-size:.92rem;line-height:1.5">
          Büyük dosyalar için <strong>Pro</strong> plan, daha yüksek limit + öncelikli işlem sunar.
        </div>
        <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
          <a href="/pricing.html" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:10px;background:#e63946;color:#fff;font-weight:800;text-decoration:none">Planları Gör</a>
          <a href="/tools/${tool}" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:10px;border:1px solid rgba(148,163,184,.25);color:#f1f5f9;text-decoration:none">Araca Dön</a>
        </div>
        <div style="margin-top:8px;color:#94a3b8;font-size:.8rem">Not: Bu alan A/B test ile gösterilir.</div>
      </div>
    `;
  }

  function renderAdsensePlaceholder(el){
    const client = el.dataset.adClient || "";
    const slot = el.dataset.adSlot || "";
    if (!hasRealAdsenseClient(client) || !hasRealAdsenseSlot(slot)) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = `
      <div style="display:block;text-align:center">
        <!-- AdSense aktif: mirpdf.com/ads.txt dosyasında gerçek ca-pub ID'nizi güncelleyin -->
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="${client}"
             data-ad-slot="${slot}"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
        <script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>
      </div>
    `;
    // AdSense script yoksa yükle
    if (!document.querySelector('script[src*="adsbygoogle"]')) {
      const s = document.createElement("script");
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      s.crossOrigin = "anonymous";
      s.async = true;
      document.head.appendChild(s);
    }
  }

  for (const el of slots){
    if (variant === "affiliate") renderAffiliate(el);
    else if (variant === "adsense") renderAdsensePlaceholder(el);
    else el.innerHTML = "";
  }
})();
