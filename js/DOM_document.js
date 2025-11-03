// document.js – Document report (ESM)
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

function listLimited(selector, mapper, limit=100){
  const out=[]; document.querySelectorAll(selector).forEach(el=>{ if(out.length>=limit) return; out.push(mapper(el)); }); return out;
}
function listStyleSheetsLimited(limit=50){
  const out=[];
  for (const sheet of Array.from(document.styleSheets||[])){
    try{ out.push({ href: sheet.href||null, disabled:!!sheet.disabled, media: sheet.media?Array.from(sheet.media).join(','):'', type: sheet.type||null, rules: typeof sheet.cssRules==='object'?sheet.cssRules.length:'N/A' }); if(out.length>=limit) break; }
    catch{ out.push({ href: sheet.href||null, disabled:!!sheet.disabled, media: 'N/A', type: sheet.type||null, rules: 'cross-origin' }); }
  }
  return out;
}

export async function collectAll(){
  const meta = { URL: safe(()=> document.URL), baseURI: safe(()=> document.baseURI), title: safe(()=> document.title), referrer: safe(()=> document.referrer || 'N/A'), lastModified: safe(()=> document.lastModified), contentType: safe(()=> document.contentType), characterSet: safe(()=> document.characterSet), compatMode: safe(()=> document.compatMode), doctype: safe(()=> document.doctype ? { name: document.doctype.name, publicId: document.doctype.publicId, systemId: document.doctype.systemId } : 'N/A') };
  const etat = { readyState: safe(()=> document.readyState), visibilityState: safe(()=> document.visibilityState), hidden: safe(()=> document.hidden), hasFocus: safe(()=> document.hasFocus()), fullscreen: safe(()=> !!document.fullscreenElement), pointerLock: safe(()=> !!document.pointerLockElement), activeElement: safe(()=> document.activeElement ? document.activeElement.tagName : 'N/A') };
  const langue = { htmlLang: safe(()=> document.documentElement?.lang || 'N/A'), htmlDir: safe(()=> document.documentElement?.dir || 'N/A') };
  const structure = { elementCount: safe(()=> document.querySelectorAll('*').length), childElementCount: safe(()=> document.documentElement ? document.documentElement.childElementCount : 'N/A'), headPresent: safe(()=> !!document.head), bodyPresent: safe(()=> !!document.body), anchors: safe(()=> document.anchors ? document.anchors.length : 'N/A'), links: safe(()=> document.links ? document.links.length : 'N/A'), forms: safe(()=> document.forms ? document.forms.length : 'N/A'), images: safe(()=> document.images ? document.images.length : 'N/A'), scripts: safe(()=> document.scripts ? document.scripts.length : 'N/A'), styleSheets: safe(()=> document.styleSheets ? document.styleSheets.length : 'N/A') };
  const dimensions = { docEl_client: safe(()=> document.documentElement ? { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight } : 'N/A'), body_scroll: safe(()=> document.body ? { w: document.body.scrollWidth, h: document.body.scrollHeight } : 'N/A'), scrollingElement: safe(()=> document.scrollingElement ? { clientWidth: document.scrollingElement.clientWidth, clientHeight: document.scrollingElement.clientHeight, scrollWidth: document.scrollingElement.scrollWidth, scrollHeight: document.scrollingElement.scrollHeight, scrollLeft: document.scrollingElement.scrollLeft, scrollTop: document.scrollingElement.scrollTop } : 'N/A') };
  const selection = safe(()=>{ const sel = window.getSelection ? window.getSelection() : null; return sel ? { type: sel.type || 'N/A', isCollapsed: !!sel.isCollapsed, rangeCount: sel.rangeCount || 0 } : 'N/A'; });
  const cookies = { cookieEnabled: safe(()=> navigator.cookieEnabled), cookieSample: safe(()=> document.cookie ? document.cookie.split('; ').slice(0,1)[0] : 'N/A') };
  const feuillesStyle = listStyleSheetsLimited();
  const scripts = listLimited('script', s=>({ src:s.getAttribute('src')||null, type:s.type||null, async:!!s.async, defer:!!s.defer, module:s.type==='module' }), 100);
  const liens = listLimited('link', l=>({ rel:l.rel||null, href:l.href||null, as:l.getAttribute('as')||null, media:l.media||null, referrerPolicy:l.referrerPolicy||null }), 100);
  const formulaires = listLimited('form', f=>({ name:f.getAttribute('name')||null, id:f.id||null, method:(f.method||'').toUpperCase(), action:f.action||null, elements:f.elements?f.elements.length:0 }), 50);
  const images = listLimited('img', i=>({ src:i.currentSrc||i.src||null, alt:i.alt||null, width:i.naturalWidth||i.width||null, height:i.naturalHeight||i.height||null, loading:i.loading||null, decoding:i.decoding||null }), 100);

  return { "Métadonnées": meta, "État": etat, "Langue & direction": langue, "Structure": structure, "Dimensions": dimensions, "Sélection": selection, "Cookies": cookies, "Feuilles de style": feuillesStyle, "Scripts": scripts, "Liens": liens, "Formulaires": formulaires, "Images": images };
}

export function renderInto(containerId, report){
  const root = document.getElementById(containerId); if (!root) return; root.innerHTML='';
  for (const [cat, data] of Object.entries(report)){
    const details = document.createElement('details'); details.open = ["Métadonnées","État","Structure"].includes(cat);
    const summary = document.createElement('summary'); summary.textContent = cat; details.appendChild(summary);
    const wrap = document.createElement('div'); wrap.className='grid';
    const table = document.createElement('table'); const thead=document.createElement('thead'); thead.innerHTML='<tr><th>Clé</th><th>Valeur</th></tr>'; table.appendChild(thead);
    const tbody=document.createElement('tbody');

    const cell = v => v==="N/A"?'<span class="na">N/A</span>':(typeof v==='boolean'?`<span class="${v?'ok':'err'}">${v}</span>`:`<span class="v">${escapeHtml(String(typeof v==='object'?JSON.stringify(v):v))}</span>`);

    if (Array.isArray(data)){
      data.forEach((obj, i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td class="k">#${i+1}</td><td>${cell(obj)}</td>`; tbody.appendChild(tr); });
      if (data.length===0){ const tr=document.createElement('tr'); tr.innerHTML='<td class="k">vide</td><td class="na">Aucun élément</td>'; tbody.appendChild(tr); }
    } else if (typeof data==='object' && data!==null){
      Object.keys(data).sort().forEach(k=>{ const v=data[k]; const tr=document.createElement('tr'); tr.innerHTML=`<td class="k">${k}</td><td>${cell(v)}</td>`; tbody.appendChild(tr); });
    } else { const tr=document.createElement('tr'); tr.innerHTML=`<td class="k">valeur</td><td>${cell(data)}</td>`; tbody.appendChild(tr); }

    table.appendChild(tbody); wrap.appendChild(table); details.appendChild(wrap);
    if (cat==="Feuilles de style"){ const p=document.createElement('div'); p.className='note'; p.textContent='Feuilles externes peuvent masquer leurs règles (CORS).'; details.appendChild(p); }
    root.appendChild(details);
  }
}

export async function getReportJSON(){ const data = await collectAll(); return JSON.stringify(data, null, 2); }
export async function copyJSON(){ const json = await getReportJSON(); try{ await navigator.clipboard.writeText(json); alert('JSON copié'); }catch{ alert('Copie impossible'); } }
export async function downloadJSON(){ const json = await getReportJSON(); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([json],{type:'application/json'})); a.download='document-report.json'; a.click(); URL.revokeObjectURL(a.href); }
