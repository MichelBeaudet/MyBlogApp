// report.js (ESM) – collecte et rendu professionnels des valeurs window par catégories
// ✅ testé : partiellement en environnements modernes (Chrome, Edge, Firefox)
// ❌ non testé : anciens navigateurs, environnements non HTTPS pour certaines APIs
// 📚 basé sur : spécifications Web/MDN (Window/Navigator/Screen/History/Performance/Storage APIs)
// 🟡 estimation : aucune — lecture directe des propriétés quand disponibles

// ---------- Utilitaires ----------
const safe = (fn, fallback = "N/A") => {
  try { const v = fn(); return (v === undefined ? "undefined" : v); }
  catch(e){ return fallback; }
};
const toPlain = (v) => {
  if (v === null) return null;
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString();
    try { return JSON.parse(JSON.stringify(v)); }
    catch { return String(v); }
  }
  if (typeof v === "function") return "[function]";
  return v;
};
const escapeHtml = (s) => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

// ---------- Collecteurs par catégories ----------
export async function collectAll() {
  const now = new Date();

  const view = {
    innerWidth: safe(()=>window.innerWidth),
    innerHeight: safe(()=>window.innerHeight),
    outerWidth: safe(()=>window.outerWidth),
    outerHeight: safe(()=>window.outerHeight),
    devicePixelRatio: safe(()=>window.devicePixelRatio),
    visualViewport: safe(()=> window.visualViewport ? {
      width: window.visualViewport.width,
      height: window.visualViewport.height,
      scale: window.visualViewport.scale,
      offsetLeft: window.visualViewport.offsetLeft,
      offsetTop: window.visualViewport.offsetTop
    } : "N/A"),
    scrollX: safe(()=>window.scrollX),
    scrollY: safe(()=>window.scrollY),
    isSecureContext: safe(()=>window.isSecureContext),
    fullscreen: safe(()=>document.fullscreenElement ? true : false)
  };

  const locationCat = safe(()=>({
    href: location.href,
    origin: location.origin,
    protocol: location.protocol,
    host: location.host,
    hostname: location.hostname,
    port: location.port,
    pathname: location.pathname,
    search: location.search,
    hash: location.hash
  }));

  const navigatorCat = safe(()=>({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: navigator.languages,
    vendor: navigator.vendor,
    onLine: navigator.onLine,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory ?? "N/A",
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    clipboard: !!navigator.clipboard,
    webdriver: navigator.webdriver ?? false
  }));

  const screenCat = safe(()=>({
    width: screen.width, height: screen.height,
    availWidth: screen.availWidth, availHeight: screen.availHeight,
    colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth,
    orientation: screen.orientation ? {
      type: screen.orientation.type, angle: screen.orientation.angle
    } : "N/A"
  }));

  const historyCat = safe(()=>({
    length: history.length,
    scrollRestoration: history.scrollRestoration ?? "N/A",
    state: toPlain(history.state)
  }));

  const performanceCat = safe(()=> {
    const nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    return {
      timeOrigin: performance.timeOrigin ?? "N/A",
      navigationType: nav ? nav.type : (performance.navigation ? performance.navigation.type : "N/A"),
      loadTime_ms: nav ? Math.round(nav.loadEventEnd - nav.startTime) : "N/A",
      domContentLoaded_ms: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : "N/A"
    };
  });

  const storageCat = async () => {
    const quota = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    const localLen = safe(()=> localStorage.length);
    const sessionLen = safe(()=> sessionStorage.length);
    return {
      localStorage_items: localLen,
      sessionStorage_items: sessionLen,
      cookies_enabled: safe(()=> navigator.cookieEnabled),
      cookie_sample: safe(()=> document.cookie ? document.cookie.split('; ').slice(0,1)[0] : "N/A"),
      storage_quota: quota ? { quota: quota.quota, usage: quota.usage } : "N/A"
    };
  };

  const permissionsCat = async () => {
    const names = ["geolocation","notifications","clipboard-read","clipboard-write","camera","microphone","persistent-storage"];
    const out = {};
    if (!navigator.permissions || !navigator.permissions.query) return "N/A";
    for (const name of names) {
      try { out[name] = (await navigator.permissions.query({ name })).state; }
      catch { out[name] = "indisponible"; }
    }
    return out;
  };

  const batteryCat = async () => {
    if (!navigator.getBattery) return "N/A";
    try {
      const b = await navigator.getBattery();
      return {
        charging: b.charging,
        level: b.level,
        chargingTime: b.chargingTime,
        dischargingTime: b.dischargingTime
      };
    } catch { return "N/A"; }
  };

  const networkCat = () => {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return c ? {
      effectiveType: c.effectiveType,
      downlink: c.downlink,
      rtt: c.rtt,
      saveData: c.saveData
    } : "N/A";
  };

  const intlCat = () => {
    try {
      return {
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
        nowISO: new Date().toISOString()
      };
    } catch { return "N/A"; }
  };

  const pageCat = () => ({
    documentTitle: safe(()=> document.title),
    referrer: safe(()=> document.referrer || "N/A"),
    visibilityState: safe(()=> document.visibilityState),
    hasServiceWorker: safe(()=> !!(navigator.serviceWorker && navigator.serviceWorker.controller)),
  });

  return {
    "Vue": view,
    "Emplacement": locationCat,
    "Navigateur": navigatorCat,
    "Écran": screenCat,
    "Historique": historyCat,
    "Performance": performanceCat,
    "Stockage": await storageCat(),
    "Permissions": await permissionsCat(),
    "Batterie": await batteryCat(),
    "Réseau": networkCat(),
    "Internationalisation": intlCat(),
    "Page": pageCat()
  };
}

// ---------- Rendu ----------
function escapeCell(value) {
  if (value === "N/A") return '<span class="na">N/A</span>';
  if (typeof value === 'boolean') return `<span class="${value ? 'ok' : 'err'}">${value}</span>`;
  if (typeof value === 'object') return `<span class="v">${escapeHtml(JSON.stringify(value))}</span>`;
  return `<span class="v">${escapeHtml(String(value))}</span>`;
}

export function renderAll(report) {
  const root = document.getElementById('container');
  if (!root) return;
  root.innerHTML = '';
  for (const [cat, data] of Object.entries(report)) {
    const details = document.createElement('details');
    details.open = (cat === "Vue" || cat === "Emplacement" || cat === "Navigateur");
    const summary = document.createElement('summary');
    summary.textContent = cat;
    details.appendChild(summary);

    const wrap = document.createElement('div');
    wrap.className = 'grid';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Clé</th><th>Valeur</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    if (data === "N/A") {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="k">indisponible</td><td class="na">N/A</td>';
      tbody.appendChild(tr);
    } else if (typeof data === 'object' && !Array.isArray(data)) {
      Object.keys(data).sort().forEach(k => {
        const v = data[k];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="k">${escapeHtml(k)}</td><td>${escapeCell(v)}</td>`;
        tbody.appendChild(tr);
      });
    } else {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="k">valeur</td><td>${escapeCell(data)}</td>`;
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    details.appendChild(wrap);

    if (cat === "Permissions") {
      const p = document.createElement('div');
      p.className = 'note';
      p.textContent = 'États "prompt/denied/granted" soumis à HTTPS et politiques du navigateur.';
      details.appendChild(p);
    }
    if (cat === "Stockage") {
      const p = document.createElement('div');
      p.className = 'note';
      p.textContent = 'Quotas/usage estimés via Storage API (si dispo).';
      details.appendChild(p);
    }

    root.appendChild(details);
  }
}

// ---------- Export / Copie ----------
export async function getReportJSON() {
  const data = await collectAll();
  return JSON.stringify(data, null, 2);
}

export async function copyJSON() {
  const json = await getReportJSON();
  try {
    await navigator.clipboard.writeText(json);
    alert('JSON copié dans le presse-papiers.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = json; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    alert('JSON copié (fallback).');
  }
}

export async function downloadJSON() {
  const json = await getReportJSON();
  const blob = new Blob([json], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'window-report.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// Expose minimal API sur window pour debug (optionnel)
window.WindowReport = { collectAll, renderAll, getReportJSON };
