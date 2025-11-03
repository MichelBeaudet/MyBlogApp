// window.js – Window report (ESM)
const safe = (fn, fallback="N/A") => { try{ const v=fn(); return (v===undefined?'undefined':v);}catch{ return fallback; } };
const escapeHtml = s =>
    s.replace(/[&<>"']/g, m =>
    ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[m])
    );
const cell = v => v === "N/A" ? '<span class="na">N/A</span>' : (typeof v === 'boolean' ? `<span class="${v ? 'ok' : 'err'}">${v}</span>` : `<span class="v">${escapeHtml(String(typeof v === 'object' ? JSON.stringify(v) : v))}</span>`);

console.log("*** In window.js");
export async function collectAll(){
  const view = {
    innerWidth: safe(()=>innerWidth),
    innerHeight: safe(()=>innerHeight),
    outerWidth: safe(()=>outerWidth),
    outerHeight: safe(()=>outerHeight),
    devicePixelRatio: safe(()=>devicePixelRatio),
    visualViewport: safe(()=> visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale, offsetLeft: visualViewport.offsetLeft, offsetTop: visualViewport.offsetTop } : "N/A"),
    scrollX: safe(()=>scrollX),
    scrollY: safe(()=>scrollY),
    isSecureContext: safe(()=>isSecureContext),
    fullscreen: safe(()=>document.fullscreenElement ? true : false)
  };
  const locationCat = safe(()=>({ href: location.href, origin: location.origin, protocol: location.protocol, host: location.host, hostname: location.hostname, port: location.port, pathname: location.pathname, search: location.search, hash: location.hash }));
  const navigatorCat = safe(()=>({ userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language, languages: navigator.languages, vendor: navigator.vendor, onLine: navigator.onLine, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory ?? "N/A", maxTouchPoints: navigator.maxTouchPoints ?? 0, clipboard: !!navigator.clipboard, webdriver: navigator.webdriver ?? false }));
  const screenCat = safe(()=>({ width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight, colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth, orientation: screen.orientation ? { type: screen.orientation.type, angle: screen.orientation.angle } : "N/A" }));
  const historyCat = safe(()=>({ length: history.length, scrollRestoration: history.scrollRestoration ?? "N/A", state: (history.state ?? null) }));
  const performanceCat = safe(()=>{ const nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null; return { timeOrigin: performance.timeOrigin ?? "N/A", navigationType: nav ? nav.type : (performance.navigation ? performance.navigation.type : "N/A"), loadTime_ms: nav ? Math.round(nav.loadEventEnd - nav.startTime) : "N/A", domContentLoaded_ms: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : "N/A" }; });
  const storageCat = async ()=>{
    const quota = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    return { localStorage_items: safe(()=> localStorage.length), sessionStorage_items: safe(()=> sessionStorage.length), cookies_enabled: safe(()=> navigator.cookieEnabled), cookie_sample: safe(()=> document.cookie ? document.cookie.split('; ').slice(0,1)[0] : "N/A"), storage_quota: quota ? { quota: quota.quota, usage: quota.usage } : "N/A" };
  };
  const permissionsCat = async ()=>{
    const names = ["geolocation","notifications","clipboard-read","clipboard-write","camera","microphone","persistent-storage"];
    const out = {}; if (!navigator.permissions || !navigator.permissions.query) return "N/A";
    for (const n of names){ try{ out[n] = (await navigator.permissions.query({name:n})).state; }catch{ out[n] = "indisponible"; } }
    return out;
  };
  const batteryCat = async ()=>{
    if (!navigator.getBattery) return "N/A";
    try{ const b = await navigator.getBattery(); return { charging:b.charging, level:b.level, chargingTime:b.chargingTime, dischargingTime:b.dischargingTime }; }catch{ return "N/A"; }
  };
  const networkCat = ()=>{ const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection; return c ? { effectiveType:c.effectiveType, downlink:c.downlink, rtt:c.rtt, saveData:c.saveData } : "N/A"; };
  const intlCat = ()=>{ try { const o=Intl.DateTimeFormat().resolvedOptions(); return { tz:o.timeZone, locale:o.locale, nowISO:new Date().toISOString() }; } catch { return "N/A"; } };
  const pageCat = ()=>({ documentTitle: safe(()=> document.title), referrer: safe(()=> document.referrer || "N/A"), visibilityState: safe(()=> document.visibilityState), hasServiceWorker: safe(()=> !!(navigator.serviceWorker && navigator.serviceWorker.controller)) });

  return { "Vue": view, "Emplacement": locationCat, "Navigateur": navigatorCat, "Écran": screenCat, "Historique": historyCat, "Performance": performanceCat, "Stockage": await storageCat(), "Permissions": await permissionsCat(), "Batterie": await batteryCat(), "Réseau": networkCat(), "Internationalisation": intlCat(), "Page": pageCat() };
}

export function renderInto(containerId, report){
  const root = document.getElementById(containerId); if (!root) return; root.innerHTML='';
  for (const [cat, data] of Object.entries(report)){
    const details = document.createElement('details'); details.open = ["Vue","Emplacement","Navigateur"].includes(cat);
    const summary = document.createElement('summary'); summary.textContent = cat; details.appendChild(summary);
    const wrap = document.createElement('div'); wrap.className='grid';
    const table = document.createElement('table'); const thead=document.createElement('thead'); thead.innerHTML='<tr><th>Clé</th><th>Valeur</th></tr>'; table.appendChild(thead);
    const tbody=document.createElement('tbody');
    if (data==="N/A"){ tbody.innerHTML='<tr><td class="k">indisponible</td><td class="na">N/A</td></tr>'; }
    else if (typeof data==='object' && !Array.isArray(data)){
      Object.keys(data).sort().forEach(k=>{ const v=data[k]; const tr=document.createElement('tr'); tr.innerHTML=`<td class="k">${k}</td><td>${cell(v)}</td>`; tbody.appendChild(tr); });
    } else { const tr=document.createElement('tr'); tr.innerHTML=`<td class="k">valeur</td><td>${cell(data)}</td>`; tbody.appendChild(tr); }
    table.appendChild(tbody); wrap.appendChild(table); details.appendChild(wrap);
    if (cat==="Permissions"){ const p=document.createElement('div'); p.className='note'; p.textContent='États soumis à HTTPS/politiques du navigateur.'; details.appendChild(p); }
    if (cat==="Stockage"){ const p=document.createElement('div'); p.className='note'; p.textContent='Quotas/usage via Storage API (si dispo).'; details.appendChild(p); }
    root.appendChild(details);
  }
}

export async function getReportJSON(){ const data = await collectAll(); return JSON.stringify(data, null, 2); }
export async function copyJSON(){ const json = await getReportJSON(); try{ await navigator.clipboard.writeText(json); alert('JSON copié'); }catch{ alert('Copie impossible'); } }
export async function downloadJSON(){ const json = await getReportJSON(); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([json],{type:'application/json'})); a.download='window-report.json'; a.click(); URL.revokeObjectURL(a.href); }
