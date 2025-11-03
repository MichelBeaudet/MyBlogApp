// element.js – Element report (ESM)
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
const toSelector = (el)=>{ if(!el||!el.tagName) return 'N/A'; const tag=el.tagName.toLowerCase(); const id=el.id?('#'+el.id):''; const cls=el.classList&&el.classList.length?('.'+Array.from(el.classList).join('.')):''; return tag+id+cls; };

export async function collectFor(el){
  if (!el) el = document.documentElement;
  const identity = { nodeType: el.nodeType, tagName: el.tagName||'N/A', id: el.id||null, classList: el.classList?Array.from(el.classList):[], namespaceURI: el.namespaceURI||null, prefix: el.prefix||null, localName: el.localName||null, isConnected: !!el.isConnected, slot: el.slot||null, part: el.part ? Array.from(el.part) : [], inert: !!el.inert, hidden: !!el.hidden, tabIndex: el.tabIndex ?? 'N/A', draggable: !!el.draggable, contentEditable: el.contentEditable || 'inherit', dataset: el.dataset ? {...el.dataset} : {}, ariaRole: el.getAttribute ? el.getAttribute('role') : null, selector: toSelector(el), childElementCount: el.childElementCount ?? 0, hasShadowRoot: !!el.shadowRoot };
  const attrs=[]; if(el.attributes){ for (const a of Array.from(el.attributes)) attrs.push({name:a.name,value:a.value}); }
  const rect = safe(()=> el.getBoundingClientRect());
  const geom = { client:{ clientLeft: el.clientLeft ?? 'N/A', clientTop: el.clientTop ?? 'N/A', clientWidth: el.clientWidth ?? 'N/A', clientHeight: el.clientHeight ?? 'N/A' }, offset:{ offsetParent: el.offsetParent ? toSelector(el.offsetParent) : null, offsetLeft: el.offsetLeft ?? 'N/A', offsetTop: el.offsetTop ?? 'N/A', offsetWidth: el.offsetWidth ?? 'N/A', offsetHeight: el.offsetHeight ?? 'N/A' }, scroll:{ scrollLeft: el.scrollLeft ?? 'N/A', scrollTop: el.scrollTop ?? 'N/A', scrollWidth: el.scrollWidth ?? 'N/A', scrollHeight: el.scrollHeight ?? 'N/A' }, boundingClientRect: rect && typeof rect==='object' ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom } : 'N/A' };
  const inlineStyle = el.getAttribute && el.getAttribute('style') ? el.getAttribute('style') : '';
  const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
  const computed = cs ? { display: cs.display, position: cs.position, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex, color: cs.color, backgroundColor: cs.backgroundColor, fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, margin:[cs.marginTop,cs.marginRight,cs.marginBottom,cs.marginLeft], padding:[cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft], borderWidth:[cs.borderTopWidth,cs.borderRightWidth,cs.borderBottomWidth,cs.borderLeftWidth], borderStyle:[cs.borderTopStyle,cs.borderRightStyle,cs.borderBottomStyle,cs.borderLeftStyle] } : 'N/A';
  const relations = { parentElement: el.parentElement ? toSelector(el.parentElement) : null, previousElementSibling: el.previousElementSibling ? toSelector(el.previousElementSibling) : null, nextElementSibling: el.nextElementSibling ? toSelector(el.nextElementSibling) : null, childrenCount: el.children ? el.children.length : 0, firstElementChild: el.firstElementChild ? toSelector(el.firstElementChild) : null, lastElementChild: el.lastElementChild ? toSelector(el.lastElementChild) : null };
  const content = { textContent_len: typeof el.textContent==='string' ? el.textContent.length : 'N/A', innerText_len: safe(()=> typeof el.innerText==='string' ? el.innerText.length : 'N/A'), innerHTML_len: typeof el.innerHTML==='string' ? el.innerHTML.length : 'N/A' };
  const shadow = el.shadowRoot ? { mode: el.shadowRoot.mode, childElementCount: el.shadowRoot.childElementCount } : 'N/A';

  const report = { "Identité": identity, "Attributs": attrs, "États": { isConnected: identity.isConnected, inert: identity.inert, hidden: identity.hidden, tabIndex: identity.tabIndex, draggable: identity.draggable, contentEditable: identity.contentEditable }, "ARIA & Dataset": { role: identity.ariaRole, dataset: identity.dataset, part: identity.part }, "Relations": relations, "Géométrie": geom, "Styles inline": { style: inlineStyle || 'N/A' }, "Styles calculés (extrait)": computed, "Contenu (tailles)": content, "Shadow DOM": shadow };
  return { identity, report };
}

export function renderInto(containerId, report){
  const root = document.getElementById(containerId); if (!root) return; root.innerHTML='';
  for (const [cat, data] of Object.entries(report)){
    const details = document.createElement('details'); details.open = ["Identité","Géométrie","Styles calculés (extrait)"].includes(cat);
    const summary = document.createElement('summary'); summary.textContent = cat; details.appendChild(summary);
    const wrap = document.createElement('div'); wrap.className='grid';
    const table = document.createElement('table'); const thead=document.createElement('thead'); thead.innerHTML='<tr><th>Clé</th><th>Valeur</th></tr>'; table.appendChild(thead);
    const tbody=document.createElement('tbody');

    if (Array.isArray(data)){
      data.forEach((obj,i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td class="k">#${i+1}</td><td>${cell(obj)}</td>`; tbody.appendChild(tr); });
      if (data.length===0){ const tr=document.createElement('tr'); tr.innerHTML='<td class="k">vide</td><td class="na">Aucun élément</td>'; tbody.appendChild(tr); }
    } else if (typeof data==='object' && data!==null){
      Object.keys(data).sort().forEach(k=>{ const v=data[k]; const tr=document.createElement('tr'); tr.innerHTML=`<td class="k">${k}</td><td>${cell(v)}</td>`; tbody.appendChild(tr); });
    } else { const tr=document.createElement('tr'); tr.innerHTML=`<td class="k">valeur</td><td>${cell(data)}</td>`; tbody.appendChild(tr); }

    table.appendChild(tbody); wrap.appendChild(table); details.appendChild(wrap);
    if (cat==="Styles calculés (extrait)"){ const p=document.createElement('div'); p.className='note'; p.textContent='Sous-ensemble de propriétés CSS pour lisibilité.'; details.appendChild(p); }
    root.appendChild(details);
  }
}
