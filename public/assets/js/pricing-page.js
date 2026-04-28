import { isLoggedIn, apiFetch, fetchMe } from "/assets/js/auth.js";

let isAnnual = false;
let plansLoaded = false;
let hasActiveSubscription = false;
const planAvailability = new Map();

const DEFAULT_BUTTON_TEXT = {
  checkoutBtn: "Hemen Pro'ya Geç — Sınırsız Başla →",
  checkoutBtnMuh: "Hemen Başla →",
  credits100Btn: "100 Kredi Al",
  credits500Btn: "500 Kredi Al",
};

const CREDIT_BUTTON_BY_PLAN = {
  credits100: "credits100Btn",
  credits500: "credits500Btn",
};

const toggle = document.getElementById("billingToggle");
const bannerArea = document.getElementById("bannerArea");

function setButtonState(id, enabled, text, title = "") {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = !enabled;
  btn.textContent = text;
  btn.style.opacity = enabled ? "1" : ".6";
  btn.style.cursor = enabled ? "pointer" : "not-allowed";
  if (title) btn.title = title;
  else btn.removeAttribute("title");
}

function isPlanAvailable(planId) {
  if (!plansLoaded) return true;
  return planAvailability.get(planId) === true;
}

function updateBillingUI() {
  if (!toggle) return;
  toggle.classList.toggle("annual", isAnnual);
  toggle.setAttribute("aria-checked", String(isAnnual));
  document.body.classList.toggle("annual-billing", isAnnual);

  const monthlyLabel = document.getElementById("lblMonthly");
  const annualLabel = document.getElementById("lblAnnual");
  if (monthlyLabel) monthlyLabel.style.color = isAnnual ? "var(--muted)" : "var(--text)";
  if (annualLabel) annualLabel.style.color = isAnnual ? "var(--text)" : "var(--muted)";

  const note = isAnnual ? "yıllık faturalandırılır" : "aylık faturalandırılır";
  for (const id of ["billedNotePro", "billedNoteMuh"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = note;
  }
}

function unavailableText(planId, fallbackText) {
  if (!plansLoaded) return fallbackText;
  if (planId.endsWith("_annual")) {
    const monthlyPlan = planId.replace(/_annual$/, "");
    if (isPlanAvailable(monthlyPlan)) return "Yıllık plan yakında";
  }
  return "Plan yakında";
}

function updatePlanButtons() {
  updateBillingUI();

  if (hasActiveSubscription) {
    setButtonState("checkoutBtn", false, "Zaten Pro Üyesiniz ✓", "Aktif planınız var.");
    setButtonState("checkoutBtnMuh", false, "Aktif planınız var", "Aktif planınız var.");
  } else {
    const proPlan = isAnnual ? "sub_pro_annual" : "sub_pro";
    const muhPlan = isAnnual ? "sub_muhasebeci_annual" : "sub_muhasebeci";
    const proAvailable = isPlanAvailable(proPlan);
    const muhAvailable = isPlanAvailable(muhPlan);

    setButtonState(
      "checkoutBtn",
      proAvailable,
      proAvailable ? DEFAULT_BUTTON_TEXT.checkoutBtn : unavailableText(proPlan, DEFAULT_BUTTON_TEXT.checkoutBtn),
      proAvailable ? "" : "Bu plan henüz aktif değil.",
    );
    setButtonState(
      "checkoutBtnMuh",
      muhAvailable,
      muhAvailable ? DEFAULT_BUTTON_TEXT.checkoutBtnMuh : unavailableText(muhPlan, DEFAULT_BUTTON_TEXT.checkoutBtnMuh),
      muhAvailable ? "" : "Bu plan henüz aktif değil.",
    );
  }

  for (const [planId, buttonId] of Object.entries(CREDIT_BUTTON_BY_PLAN)) {
    const available = isPlanAvailable(planId);
    setButtonState(
      buttonId,
      available,
      available ? DEFAULT_BUTTON_TEXT[buttonId] : "Yakında",
      available ? "" : "Bu kredi paketi henüz aktif değil.",
    );
  }
}

async function loadPlanAvailability() {
  try {
    const resp = await fetch("/api/billing/plans", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const data = await resp.json().catch(() => null);
    const plans = Array.isArray(data?.data?.plans) ? data.data.plans : null;
    if (resp.ok && plans) {
      planAvailability.clear();
      for (const plan of plans) {
        planAvailability.set(String(plan?.id || ""), !!plan?.priceId);
      }
      plansLoaded = true;
    }
  } catch {}

  updatePlanButtons();
}

function showBannerFromQuery() {
  if (!bannerArea) return;
  const params = new URLSearchParams(location.search);
  if (params.get("success")) {
    bannerArea.innerHTML = '<div style="display:flex;align-items:center;gap:.75rem;padding:.9rem 1.2rem;border-radius:12px;font-size:.9rem;font-weight:600;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;margin-bottom:1rem"><i class="fas fa-check-circle"></i><span>Pro aboneliğiniz aktif. Sayfayı yenilediğinizde kredileriniz güncellenecek.</span></div>';
    return;
  }
  if (params.get("cancelled")) {
    bannerArea.innerHTML = '<div style="display:flex;align-items:center;gap:.75rem;padding:.9rem 1.2rem;border-radius:12px;font-size:.9rem;font-weight:600;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;margin-bottom:1rem"><i class="fas fa-times-circle"></i><span>Ödeme tamamlanmadı. İstediğiniz zaman tekrar deneyebilirsiniz.</span></div>';
  }
}

async function initSubscriptionState() {
  const me = await fetchMe();
  if (me?.role === "pro" || me?.role === "basic") {
    hasActiveSubscription = true;
    const sec = document.getElementById("manageSection");
    if (sec) {
      sec.classList.remove("mir-hidden");
      sec.style.display = "block";
    }
  }
  updatePlanButtons();
}

async function beginCheckout(plan, buttonId, fallbackText) {
  if (plansLoaded && !isPlanAvailable(plan)) {
    alert("Bu plan henüz aktif değil.");
    updatePlanButtons();
    return;
  }

  if (!isLoggedIn()) {
    location.href = "/login?redirect=/pricing";
    return;
  }

  if (buttonId) {
    setButtonState(buttonId, false, "Yükleniyor...");
  }

  const attribution = (typeof window.MIRPDF_ATTR !== "undefined") ? window.MIRPDF_ATTR.get() : null;
  try {
    const resp = await apiFetch("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan, attribution }),
    });
    const data = await resp.json().catch(() => null);

    if (data?.ok && data?.data?.url) {
      location.href = data.data.url;
      return;
    }
    if (resp.status === 401) {
      location.href = "/login?redirect=/pricing";
      return;
    }
    alert(data?.message || "Ödeme başlatılamadı. Lütfen tekrar deneyin.");
  } catch (_) {
    alert("Bağlantı hatası.");
  }

  if (buttonId && !hasActiveSubscription) {
    setButtonState(buttonId, true, fallbackText);
  }
  updatePlanButtons();
}

window.startCheckout = async function startCheckout() {
  const plan = isAnnual ? "sub_pro_annual" : "sub_pro";
  await beginCheckout(plan, "checkoutBtn", DEFAULT_BUTTON_TEXT.checkoutBtn);
};

window.startCheckoutMuh = async function startCheckoutMuh() {
  const plan = isAnnual ? "sub_muhasebeci_annual" : "sub_muhasebeci";
  await beginCheckout(plan, "checkoutBtnMuh", DEFAULT_BUTTON_TEXT.checkoutBtnMuh);
};

window.startCreditsCheckout = async function startCreditsCheckout(planId) {
  const buttonId = CREDIT_BUTTON_BY_PLAN[planId] || null;
  if (plansLoaded && !isPlanAvailable(planId)) {
    alert("Bu kredi paketi henüz aktif değil.");
    updatePlanButtons();
    return;
  }

  await beginCheckout(planId, buttonId, buttonId ? DEFAULT_BUTTON_TEXT[buttonId] : "Satın al");
};

window.openPortal = async function openPortal() {
  if (!isLoggedIn()) {
    location.href = "/login?redirect=/pricing";
    return;
  }
  try {
    const resp = await apiFetch("/api/billing/portal", { method: "POST" });
    const data = await resp.json().catch(() => null);
    if (data?.ok && data?.data?.url) location.href = data.data.url;
    else alert(data?.message || "Portal açılamadı.");
  } catch (_) {
    alert("Bağlantı hatası.");
  }
};

document.querySelectorAll(".faq-q").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".faq-item");
    const wasOpen = item.classList.contains("open");
    document.querySelectorAll(".faq-item.open").forEach((el) => el.classList.remove("open"));
    if (!wasOpen) item.classList.add("open");
  });
});

const mobileToggle = document.getElementById("mobileToggle");
const nav = document.getElementById("mainNav");
if (mobileToggle && nav) {
  mobileToggle.addEventListener("click", () => {
    nav.classList.toggle("show");
    mobileToggle.setAttribute("aria-expanded", String(nav.classList.contains("show")));
  });
}

if (toggle) {
  toggle.addEventListener("click", () => {
    isAnnual = !isAnnual;
    updatePlanButtons();
  });
}

showBannerFromQuery();
await loadPlanAvailability();
await initSubscriptionState();
