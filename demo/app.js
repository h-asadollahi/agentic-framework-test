// ── Shared state ──────────────────────────────────────────────────────────────
const FALLBACK_BRANDS = [
  { id: "acme-marketing",    name: "Acme Marketing",    description: "Seeded default marketing brand" },
  { id: "northline-fashion", name: "Northline Fashion", description: "Seeded fashion brand with stricter guardrails" },
];
let knownBrands = [...FALLBACK_BRANDS];

export function getApiBase() {
  return (document.getElementById("apiBase")?.value || "http://localhost:3001").trim().replace(/\/$/, "");
}

export function getSelectedBrandId() {
  return document.getElementById("brandId")?.value || "acme-marketing";
}

export function getSelectedBrandMeta() {
  return knownBrands.find((b) => b.id === getSelectedBrandId()) ?? null;
}

// ── Brand selector ────────────────────────────────────────────────────────────
function updateBrandDescription() {
  const el = document.getElementById("brandDescription");
  if (el) el.textContent = getSelectedBrandMeta()?.description || "";
}

function populateBrandSelector(brands, defaultBrandId, preferredBrandId = null) {
  knownBrands = Array.isArray(brands) && brands.length ? brands : knownBrands;
  const select = document.getElementById("brandId");
  if (!select) return;

  const desired =
    preferredBrandId && knownBrands.some((b) => b.id === preferredBrandId)
      ? preferredBrandId
      : knownBrands.some((b) => b.id === defaultBrandId)
        ? defaultBrandId
        : knownBrands[0]?.id || "acme-marketing";

  select.innerHTML = "";
  for (const brand of knownBrands) {
    const opt = document.createElement("option");
    opt.value = brand.id;
    opt.textContent = brand.name;
    select.appendChild(opt);
  }
  select.value = desired;
  updateBrandDescription();
}

export async function loadBrands(options = {}) {
  const { announceFallback = true, onFallback } = options;
  const preferred = getSelectedBrandId();
  try {
    const res = await fetch(`${getApiBase()}/brands`);
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const payload = await res.json();
    populateBrandSelector(payload.brands, payload.defaultBrandId, preferred);
  } catch (error) {
    populateBrandSelector(FALLBACK_BRANDS, "acme-marketing", preferred);
    if (announceFallback && onFallback) {
      onFallback(`Brand discovery failed. Using fallback list. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
const ROUTES = {
  "#dashboard":        () => import("./views/dashboard.js"),
  "#chat":             () => import("./views/chat.js"),
  "#knowledge-editor": () => import("./views/knowledge-editor.js"),
};

const DEFAULT_HASH = "#dashboard";

let currentView = null;  // { unmount() }

function setActiveNav(hash) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === hash);
  });
}

async function navigate(hash) {
  const loader = ROUTES[hash] || ROUTES[DEFAULT_HASH];
  const resolvedHash = ROUTES[hash] ? hash : DEFAULT_HASH;

  // Unmount previous view
  if (currentView?.unmount) currentView.unmount();
  currentView = null;

  const outlet = document.getElementById("view-outlet");
  if (outlet) outlet.innerHTML = "";

  setActiveNav(resolvedHash);

  const ctx = { getApiBase, getSelectedBrandId, getSelectedBrandMeta };

  try {
    const mod = await loader();
    currentView = mod;
    mod.mount(outlet, ctx);
  } catch (err) {
    if (outlet) outlet.innerHTML = `<div class="surface-card" style="margin:2rem"><p class="eyebrow subtle">Error</p><p>Failed to load view: ${err.message}</p></div>`;
  }
}

window.addEventListener("hashchange", () => navigate(window.location.hash));

// Brand change: notify current view if it cares
document.getElementById("brandId")?.addEventListener("change", () => {
  updateBrandDescription();
  currentView?.onBrandChange?.();
});

document.getElementById("apiBase")?.addEventListener("change", () => {
  loadBrands();
  currentView?.onApiBaseChange?.();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
const API_CANDIDATES = ["http://localhost:3001", "http://localhost:3000"];

async function autoDetect() {
  for (const base of API_CANDIDATES) {
    try {
      const res = await fetch(`${base}/health`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === "ok") {
        const input = document.getElementById("apiBase");
        if (input) input.value = base;
        return;
      }
    } catch { /* try next */ }
  }
}

await autoDetect();
await loadBrands({ announceFallback: false });
navigate(window.location.hash || DEFAULT_HASH);
