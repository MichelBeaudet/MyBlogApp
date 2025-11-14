/* 
  ======================================================================
  Beaudet Services Conseils — Bookstore (Bilingual FR/EN)
  FILE: bookstore.js
  PURPOSE:
    - Read config & i18n from <script id="app-config"> and <script id="i18n">
    - Load and parse BookBuddy-style HTML (BookBuddy.htm) with:
        • Block A: table with <img> + nested table containing <td class="title"> and <td class="author">
        • Block B: table of <tr> with <td class="field"> rows listing <b>Label:</b> Value (FR/EN labels)
        • Blocks separated by <hr>
    - Extract fields: title, author, genre, category, pages, isbn, Prix d’achat, **Prix de vente**, thumb(base64)
    - Use **Prix de vente** for shop price; if missing -> fallback to **Prix d’achat**; if neither -> “Ask for price”
    - Build catalog grid, filters (by **Genre**), cart with localStorage, totals (CAD), flat $20 shipping, $0 taxes.
    - PayPal Sandbox checkout (per-item line items).
  CONSTRAINTS:
    - Vanilla JS only (no external frameworks)
    - Designed for your existing index.html (same IDs/templates)
  ======================================================================
*/

/* ===========================
   Helpers & Globals
   =========================== */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const readJsonFromScript = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing <script id="${id}"> JSON`);
  try { return JSON.parse(el.textContent.trim()); }
  catch (e) { console.error(`Invalid JSON in #${id}`, e); throw e; }
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const fmtMoney = (num, currency = "CAD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

function toNumberSafe(v) {
  if (v == null) return NaN;
  // Accept "$50", "50,00", "50 CAD", etc.
  const n = String(v).replace(/[^\d.,-]/g, "").replace(",", ".");
  const f = parseFloat(n);
  return Number.isFinite(f) ? round2(f) : NaN;
}
function toIntSafe(v, d = 0) {
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : d;
}
function cryptoRandomId() {
  try {
    const a = crypto.getRandomValues(new Uint32Array(2));
    return "bk-" + a[0].toString(36) + a[1].toString(36);
  } catch {
    return "bk-" + Math.random().toString(36).slice(2);
  }
}

/* ===========================
   Config & i18n
   =========================== */

const CONFIG = readJsonFromScript("app-config");   // expects currency, shipping, taxes, paypal, catalog, etc.
const I18N = readJsonFromScript("i18n");
let currentLocale = CONFIG.localeDefault || "en";

const i18nApply = () => {
  $$("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    const str = I18N[currentLocale]?.[key];
    if (typeof str === "string") node.textContent = str;
  });
};
const i18nText = (key, fallback = "") => I18N[currentLocale]?.[key] ?? fallback;

const STR_ASK_PRICE = { en: "Ask for price", fr: "Prix sur demande" };

/* ===========================
   DOM Refs
   =========================== */

const langSelect         = $("#langSelect");
const openCartBtn        = $("#openCartBtn");
const closeCartBtn       = $("#closeCartBtn");
const cartDialog         = $("#cartDrawer");
const cartItemsEl        = $("#cartItems");
const summarySubtotal    = $("#summarySubtotal");
const summaryShipping    = $("#summaryShipping");
const summaryTaxes       = $("#summaryTaxes");
const summaryTotal       = $("#summaryTotal");
const resultCount        = $("#resultCount");
const catalogGrid        = $("#catalogGrid");
const searchInput        = $("#searchInput");
const genreSelect        = $("#genreSelect");     // <-- Genre filter dropdown
const sortSelect         = $("#sortSelect");
const clearFiltersBtn    = $("#clearFiltersBtn");
const paypalContainer    = $("#paypal-button-container");
const cartCount          = $("#cartCount");
const liveRegion         = $("#liveRegion");

/* ===========================
   State
   =========================== */

const STORAGE_KEY = "bsc_books_cart_v2"; // v2 since pricing rules changed
let catalog = [];       // normalized items
let filtered = [];      // filtered view
let cart = loadCart();  // localStorage cart

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((it) => ({
      id: String(it.id),
      title: String(it.title),
      author: String(it.author ?? ""),
      price: Number(it.price),      // sale price captured at add time
      qty: Math.max(1, parseInt(it.qty, 10) || 1),
      cover: String(it.cover ?? "")
    }));
  } catch {
    return [];
  }
}
function saveCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  updateCartBadge();
}

/* ===========================
   BookBuddy.htm Parser
   =========================== */

/**
 * Parse a BookBuddy-style HTML document.
 * We treat pairs of TABLEs followed by <hr> as one book:
 *  - First TABLE: image + nested TABLE with .title and .author.
 *  - Second TABLE: rows of fields with <b>Label:</b> Value.
 */
async function loadCatalogFromBookBuddy(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Walk top-level body children and group into blocks: [tableA, tableB]
  const blocks = [];
  let currentPair = [];

  for (const node of doc.body.children) {
    if (node.tagName === "TABLE") {
      currentPair.push(node);
      if (currentPair.length === 2) {
        blocks.push(currentPair);
        currentPair = [];
      }
    } else if (node.tagName === "HR") {
      currentPair = [];
    }
  }
  if (currentPair.length === 2) blocks.push(currentPair);

  const items = [];
  for (const [tblHeader, tblFields] of blocks) {
    const book = extractBookFromTables(tblHeader, tblFields);
    if (book && book.title) items.push(book);
  }
  return items;
}

/**
 * Extract book data from the two tables.
 */
function extractBookFromTables(tblHeader, tblFields) {
  // Header table: may include an <img> and a nested table with .title/.author
  const nestedTitle = tblHeader.querySelector(".title");
  const nestedAuthor = tblHeader.querySelector(".author");
  const imgEl = tblHeader.querySelector("img");

  const title = nestedTitle ? nestedTitle.textContent.trim().replace(/^\.\.\.\s*/, "") : "";
  const author = nestedAuthor ? nestedAuthor.textContent.trim() : "";
  const thumb = imgEl && imgEl.getAttribute("src") ? imgEl.getAttribute("src") : "";

  // Field table: rows like <td class="field"><b>Label:</b> Value</td>
  const rows = Array.from(tblFields.querySelectorAll("tr"));
  const kv = {}; // key-value map from labels

  for (const r of rows) {
    const td = r.querySelector("td");
    if (!td) continue;

    let label = "";
    let value = "";

    const b = td.querySelector("b");
    if (b) {
      label = b.textContent.replace(/:\s*$/, "").trim();
      const clone = td.cloneNode(true);
      const b2 = clone.querySelector("b");
      if (b2) b2.remove();
      value = clone.textContent.trim();
      if (value.startsWith(":")) value = value.slice(1).trim();
    } else {
      const t = td.textContent;
      const m = t.split(":");
      if (m.length >= 2) {
        label = m[0].trim();
        value = m.slice(1).join(":").trim();
      } else {
        continue;
      }
    }

    kv[normalizeLabel(label)] = value;
  }

  // Map labels (FR/EN) to canonical fields
  const genre       = kv["genre"] ?? "";
  const category    = kv["categorie"] ?? kv["category"] ?? "";
  const pages       = toIntSafe(kv["pages"]);
  const isbn        = (kv["isbn"] ?? "").trim();
  const purchaseRaw = kv["prixdachat"] ?? kv["purchaseprice"] ?? "";
  const saleRaw     = kv["prixdevente"] ?? kv["saleprice"] ?? "";

  const purchasePrice = toNumberSafe(purchaseRaw);
  let   salePrice     = toNumberSafe(saleRaw);
  // Fallback: use purchase price if sale price is missing/NaN
  if (!Number.isFinite(salePrice) && Number.isFinite(purchasePrice)) {
    salePrice = purchasePrice;
  }

  const id = isbn ? `isbn-${isbn}` : (title || author ? slugId(`${author}-${title}`) : cryptoRandomId());

  return {
    id,
    title,
    author,
    category,
    genre,
    pages,
    isbn,
    purchasePrice,       // may be NaN
    salePrice,           // may be NaN -> "Ask for price"
    currency: CONFIG.currency || "CAD",
    thumb,
    stock: 1
  };
}

function normalizeLabel(label) {
  return label
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function slugId(s) {
  return "bk-" + s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) + "-" + Math.random().toString(36).slice(2, 8);
}

/* ===========================
   Catalog orchestration
   =========================== */

async function loadCatalogAuto() {
  const src = (CONFIG.catalog && CONFIG.catalog.source) || "html";
  if (src === "html") {
    const url = (CONFIG.catalog && CONFIG.catalog.url) || "BookBuddy.htm";
    return await loadCatalogFromBookBuddy(url);
  }
  const url = (CONFIG.catalog && CONFIG.catalog.url) || "books.json";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  const arr = await res.json();
  if (!Array.isArray(arr)) throw new Error("JSON root is not an array");
  return arr;
}

function buildGenres(items) {
  const genres = new Set(items.map(b => b.genre).filter(Boolean));
  const frag = document.createDocumentFragment();
  for (const g of Array.from(genres).sort((a,b)=>a.localeCompare(b))) {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    frag.appendChild(opt);
  }
  genreSelect.appendChild(frag);
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  const g = genreSelect.value;

  filtered = catalog.filter(b => {
    const matchesGenre = !g || b.genre === g;
    const hay = `${b.title} ${b.author ?? ""} ${b.isbn ?? ""} ${b.category ?? ""}`.toLowerCase();
    const matchesQ = !q || hay.includes(q);
    return matchesGenre && matchesQ;
  });

  sortFiltered();
  renderCatalog();
}

function sortFiltered() {
  const v = sortSelect.value;
  const cmpStr = (a,b) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const cmpNum = (a,b) => (a||0) - (b||0);

  filtered.sort((A,B) => {
    switch (v) {
      case "title-asc":  return cmpStr(A.title, B.title);
      case "title-desc": return cmpStr(B.title, A.title);
      case "author-asc":  return cmpStr(A.author||"", B.author||"");
      case "author-desc": return cmpStr(B.author||"", A.author||"");
      case "price-asc":  return cmpNum(A.salePrice, B.salePrice);
      case "price-desc": return cmpNum(B.salePrice, A.salePrice);
      case "year-desc":  return cmpNum(B.year, A.year);
      case "year-asc":   return cmpNum(A.year, B.year);
      default:           return cmpStr(A.title, B.title);
    }
  });
}

function updateResultsCount() {
  const txt = `${filtered.length} ${currentLocale === "fr" ? "résultats" : "results"}`;
  resultCount.textContent = txt;
}

function renderCatalog() {
  catalogGrid.innerHTML = "";
  catalogGrid.setAttribute("aria-busy", "true");

  const tpl = $("#tpl-book-card");
  const frag = document.createDocumentFragment();

  for (const b of filtered) {
    const node = tpl.content.firstElementChild.cloneNode(true);

    // Cover
    const coverEl = node.querySelector(".cover");
    coverEl.src = b.thumb && b.thumb.length ? b.thumb : (CONFIG.assets && CONFIG.assets.missingCover) || "";
    coverEl.alt = `${b.title} — ${b.author || ""}`.trim();

    // Text
    node.querySelector(".title").textContent = b.title;
    node.querySelector(".author").textContent = b.author || "";

    // Optional metadata
    node.querySelector(".year").textContent = b.year ? String(b.year) : "";
    node.querySelector(".lang").textContent = b.lang ? `• ${b.lang}` : "";
    node.querySelector(".condition").textContent = b.genre ? `• ${b.genre}` : "";

    // Price row — show sale price if available, else "Ask for price"
    const priceEl = node.querySelector(".price");
    const addBtn  = node.querySelector(".add-btn");
    const qtyInput= node.querySelector(".qty");

    const hasSale = Number.isFinite(b.salePrice) && b.salePrice > 0;
    if (hasSale) {
      priceEl.textContent = fmtMoney(b.salePrice, CONFIG.currency);
      addBtn.disabled = false;
    } else {
      priceEl.textContent = currentLocale === "fr" ? STR_ASK_PRICE.fr : STR_ASK_PRICE.en;
      addBtn.disabled = true; // cannot add items without a defined sale price
    }

    if (typeof b.stock === "number" && b.stock <= 0) {
      addBtn.disabled = true;
      addBtn.textContent = currentLocale === "fr" ? "Rupture" : "Out of stock";
    }

    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      addToCart(b, qty);
      announce(currentLocale === "fr"
        ? `Ajouté au panier: ${b.title} (x${qty}).`
        : `Added to cart: ${b.title} (x${qty}).`
      );
    });

    frag.appendChild(node);
  }

  catalogGrid.appendChild(frag);
  catalogGrid.setAttribute("aria-busy", "false");
  updateResultsCount();
}

/* ===========================
   Cart logic
   =========================== */

function addToCart(book, qty) {
  const price = Number.isFinite(book.salePrice) ? book.salePrice : NaN;
  if (!Number.isFinite(price) || price <= 0) {
    alert(currentLocale === "fr"
      ? "Ce livre n'a pas de prix de vente. Utilisez l'option «Prix sur demande»."
      : "This book has no sale price. Please use the “Ask for price” option.");
    return;
  }

  const idx = cart.findIndex((it) => it.id === book.id);
  if (idx >= 0) {
    cart[idx].qty += qty;
  } else {
    cart.push({
      id: book.id,
      title: book.title,
      author: book.author || "",
      price: price,
      qty: Math.max(1, qty),
      cover: book.thumb && book.thumb.length ? book.thumb : (CONFIG.assets && CONFIG.assets.missingCover) || ""
    });
  }
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter((it) => it.id !== id);
  saveCart();
  renderCart();
}
function setQty(id, qty) {
  const item = cart.find((it) => it.id === id);
  if (!item) return;
  item.qty = Math.max(1, qty);
  saveCart();
  renderCart();
}

function cartTotals() {
  const subtotal = round2(cart.reduce((sum, it) => sum + it.price * it.qty, 0));
  const shipping = cart.length > 0 ? round2(CONFIG.shipping.amount) : 0;
  const taxes = 0; // per spec
  const total = round2(subtotal + shipping + taxes);
  return { subtotal, shipping, taxes, total };
}

function updateCartBadge() {
  const n = cart.reduce((sum, it) => sum + it.qty, 0);
  cartCount.textContent = String(n);
}

function renderCart() {
  cartItemsEl.innerHTML = "";

  const tpl = $("#tpl-cart-item");
  const frag = document.createDocumentFragment();

  for (const it of cart) {
    const n = tpl.content.firstElementChild.cloneNode(true);
    n.querySelector(".mini-cover").src = it.cover;
    n.querySelector(".mini-cover").alt = it.title;
    n.querySelector(".line-title").textContent = it.title;
    n.querySelector(".line-author").textContent = it.author || "";
    n.querySelector(".line-price").textContent = fmtMoney(it.price, CONFIG.currency);

    const qtyEl = n.querySelector(".line-qty");
    qtyEl.value = String(it.qty);
    const totalEl = n.querySelector(".line-total");
    totalEl.textContent = fmtMoney(round2(it.price * it.qty), CONFIG.currency);

    n.querySelector(".dec").addEventListener("click", () => setQty(it.id, Math.max(1, it.qty - 1)));
    n.querySelector(".inc").addEventListener("click", () => setQty(it.id, it.qty + 1));
    qtyEl.addEventListener("change", () => {
      const q = Math.max(1, parseInt(qtyEl.value, 10) || 1);
      setQty(it.id, q);
    });
    n.querySelector(".remove").addEventListener("click", () => removeFromCart(it.id));

    frag.appendChild(n);
  }

  cartItemsEl.appendChild(frag);

  const totals = cartTotals();
  summarySubtotal.textContent = fmtMoney(totals.subtotal, CONFIG.currency);
  summaryShipping.textContent = fmtMoney(totals.shipping, CONFIG.currency);
  summaryTaxes.textContent = fmtMoney(totals.taxes, CONFIG.currency);
  summaryTotal.textContent = fmtMoney(totals.total, CONFIG.currency);

  if (cartDialog.open) {
    mountPayPalIfNeeded(true);
  }
}

/* ===========================
   Accessibility / Live region
   =========================== */

function announce(text) {
  if (!liveRegion) return;
  liveRegion.textContent = "";
  setTimeout(() => { liveRegion.textContent = text; }, 20);
}

/* ===========================
   PayPal Integration
   =========================== */

let paypalScriptLoaded = false;
let paypalRendered = false;

function mountPayPalIfNeeded(forceRemount = false) {
  if (cart.length === 0) {
    if (paypalContainer) paypalContainer.innerHTML = "";
    paypalRendered = false;
    return;
  }

  // --- STRICT clientId validation ---
  const rawId = (CONFIG?.paypal?.clientId ?? "").trim();
  const isAscii = /^[A-Za-z0-9\-]+$/.test(rawId);      // PayPal IDs use A–Z a–z 0–9 and hyphen
  const hasSmartQuotes = /[“”‘’]/.test(rawId);         // prevent curly quotes from copy/paste

  if (!rawId || !isAscii || hasSmartQuotes) {
    console.error("PayPal clientId missing or malformed:", JSON.stringify(rawId));
    alert("PayPal clientId is missing or malformed in #app-config. Remove trailing spaces/underscores or smart quotes.");
    return;
  }

  // --- prevent double SDK loads (and allow clean remount) ---
  const existing = document.querySelector('script[src*="www.paypal.com/sdk/js"]');
  if (existing && (forceRemount || !paypalScriptLoaded)) {
    existing.remove();
    try { delete window.paypal; } catch {}
    paypalScriptLoaded = false;
    paypalRendered = false;
  } else if (existing && paypalScriptLoaded) {
    renderPayPalButtons();
    return;
  }

  if (!paypalScriptLoaded) {
    const params = new URLSearchParams({
      "client-id": rawId,
      currency: CONFIG.currency || "CAD",
      intent: "capture",
      components: "buttons",
      commit: "true"
    });

    const sdkUrl = `https://www.paypal.com/sdk/js?${params.toString()}`;
    console.log("[PayPal SDK] URL =", sdkUrl);          // <— copy this to a new tab if it fails

    const s = document.createElement("script");
    s.src = sdkUrl;
    s.onload = () => { paypalScriptLoaded = true; renderPayPalButtons(); };
    
    console.log("[PayPal SDK] Loading...");
    //alert("Loading PayPal SDK. Please wait...");
    s.onerror = () => {
      console.error("Failed to load PayPal SDK. Check clientId and network.");
      alert("PayPal SDK failed to load (HTTP 400). Verify your clientId in #app-config.");
    };
    document.head.appendChild(s);
    return;
  }

  if (!paypalRendered || forceRemount) {
    renderPayPalButtons();
  }
}
function buildPurchaseUnit() {
  const items = cart.map((it) => ({
    name: it.title.substring(0, 127),
    unit_amount: { currency_code: CONFIG.currency, value: round2(it.price).toFixed(2) },
    quantity: String(Math.max(1, it.qty)),
    category: "PHYSICAL_GOODS"
  }));

  const totals = cartTotals();
  return {
    amount: {
      currency_code: CONFIG.currency,
      value: totals.total.toFixed(2),
      breakdown: {
        item_total: { currency_code: CONFIG.currency, value: totals.subtotal.toFixed(2) },
        shipping:   { currency_code: CONFIG.currency, value: totals.shipping.toFixed(2) },
        tax_total:  { currency_code: CONFIG.currency, value: totals.taxes.toFixed(2) }
      }
    },
    items
  };
}

function renderPayPalButtons() {
  if (typeof paypal === "undefined") return;
  paypalContainer.innerHTML = "";
  paypalRendered = true;

  paypal.Buttons({
    style: { layout: "vertical" },
    createOrder: (_, actions) => {
      const pu = buildPurchaseUnit();
      return actions.order.create({
        purchase_units: [pu],
        application_context: { shipping_preference: "GET_FROM_FILE" }
      });
    },
    onApprove: async (_, actions) => {
      const details = await actions.order.capture();
      cart = [];
      saveCart();
      renderCart();
      paypalContainer.innerHTML = "";
      const msg = currentLocale === "fr" ? "Paiement complété. Merci!" : "Payment completed. Thank you!";
      announce(msg);
      alert(`${msg}\n\nOrder ID: ${details.id}`);
    },
    onCancel: () => {
      const msg = currentLocale === "fr" ? "Paiement annulé." : "Payment cancelled.";
      announce(msg);
    },
    onError: (err) => {
      console.error("PayPal error:", err);
      const msg = currentLocale === "fr"
        ? "Erreur PayPal. Vérifiez votre connexion et votre Client ID."
        : "PayPal error. Check your connection and Client ID.";
      alert(msg);
    }
  }).render(paypalContainer);
}

/* ===========================
   Bootstrap
   =========================== */

window.addEventListener("DOMContentLoaded", async () => {
  // i18n static labels
  i18nApply();
  // Pre-fill shipping & taxes shown in summary
  summaryShipping.textContent = fmtMoney(CONFIG.shipping.amount, CONFIG.currency);
  summaryTaxes.textContent = fmtMoney(0, CONFIG.currency);

  // Load catalog from BookBuddy.htm (or configured URL)
  try {
    catalog = await loadCatalogAuto();
    // Build the Genre dropdown and initial render
    buildGenres(catalog);
    filtered = [...catalog];
    renderCatalog();
  } catch (e) {
    console.error("Failed to load catalog:", e);
    catalogGrid.setAttribute("aria-busy", "false");
    const src = (CONFIG.catalog && CONFIG.catalog.source) || "html";
    const url = (CONFIG.catalog && CONFIG.catalog.url) || "BookBuddy.htm";
    catalogGrid.innerHTML = `<p role="alert">Cannot load catalog from ${src.toUpperCase()} (${url}). ${e.message}</p>`;
  }

  // Init cart UI
  updateCartBadge();
  renderCart();

  // Wiring
  langSelect.value = currentLocale;
  langSelect.addEventListener("change", () => {
    currentLocale = langSelect.value;
    i18nApply();
    updateResultsCount();
    renderCatalog();
    renderCart();
  });

  openCartBtn.addEventListener("click", () => {
    cartDialog.showModal();
    openCartBtn.setAttribute("aria-expanded", "true");
    mountPayPalIfNeeded();
  });
  closeCartBtn.addEventListener("click", () => {
    cartDialog.close();
    openCartBtn.setAttribute("aria-expanded", "false");
  });

  searchInput.addEventListener("input", applyFilters);
  genreSelect.addEventListener("change", applyFilters); // <-- Genre change
  sortSelect.addEventListener("change", () => { sortFiltered(); renderCatalog(); });

  clearFiltersBtn.addEventListener("click", () => {
    searchInput.value = "";
    genreSelect.value = "";
    sortSelect.value = "title-asc";
    filtered = [...catalog];
    renderCatalog();
  });
});
