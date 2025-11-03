// telemetry.secure.js — Version sécurisée (ne collecte pas les valeurs des champs)
export default function SecureTelemetry(opts = {}) {
  const config = { maxEvents: opts.maxEvents || 1000 };
  let consent = false;
  let buffer = [];
  let handlers = [];

  const now = () => new Date().toISOString();

  function sampleEvent(e) {
    if (!consent) return;
    const tgt = e.target || {};
    const evt = {
      type: e.type,
      time: now(),
      tag: tgt.tagName || null,
      id: tgt.id || null,
      classes: tgt.classList ? Array.from(tgt.classList).slice(0,5) : null,
      // For inputs, record only metadata (length), never the value
      inputMeta: (e.type === 'input' && tgt) ? { inputType: tgt.type || null, valueLength: (tgt.value||'').length } : null
    };
    buffer.push(evt);
    if (buffer.length > config.maxEvents) buffer.shift();
  }

  function start() {
    if (!consent) throw new Error('Consent required');
    const clickH = (e) => sampleEvent(e);
    const inputH = (e) => sampleEvent(e);
    const keyH = (e) => { buffer.push({ type:'key', time: now(), key: e.key, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey }); if (buffer.length>config.maxEvents) buffer.shift(); };
    const scrollH = () => { buffer.push({ type:'scroll', time: now(), x: window.scrollX, y: window.scrollY }); if (buffer.length>config.maxEvents) buffer.shift(); };

    window.addEventListener('click', clickH, true);
    window.addEventListener('input', inputH, true);
    window.addEventListener('keydown', keyH, true);
    window.addEventListener('scroll', scrollH, true);

    handlers = [['click', clickH], ['input', inputH], ['keydown', keyH], ['scroll', scrollH]];
  }

  function stop() {
    for (const [name, h] of handlers) window.removeEventListener(name, h, true);
    handlers = [];
  }

  async function snapshot() {
    return {
      ts: now(),
      navigator: { ua: navigator.userAgent, lang: navigator.language, onLine: navigator.onLine },
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      document: { title: document.title, readyState: document.readyState, elementCount: document.querySelectorAll('*').length },
      interactionsSample: buffer.slice(-200)
    };
  }

  return {
    grantConsent(){ consent = true; },
    denyConsent(){ consent = false; buffer = []; stop(); },
    hasConsent(){ return consent; },
    startAuto(){ if (consent) start(); },
    stopAuto(){ stop(); },
    snapshot,
    clear(){ buffer = []; }
  };
}
