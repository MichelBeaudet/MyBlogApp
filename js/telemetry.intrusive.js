// telemetry.intrusive.js — Version intrusive (LIT: capture des valeurs des champs)
// USAGE: Strictement pour labo / démonstration. NE PAS DÉPLOYER EN PROD sans encadrement légal.
export default function IntrusiveTelemetry(opts = {}) {
  const config = { maxEvents: opts.maxEvents || 5000, capturePasswords: false };
  let consent = false;
  let buffer = [];
  let handlers = [];

  const now = () => new Date().toISOString();

  function onInput(e) {
    if (!consent) return;
    const tgt = e.target || {};
    if (tgt.type === 'password' && !config.capturePasswords) {
      buffer.push({ type:'input', time: now(), tag: tgt.tagName, inputType: tgt.type, valueLength: (tgt.value||'').length });
    } else {
      buffer.push({
        type: 'input',
        time: now(),
        tag: tgt.tagName,
        inputType: tgt.type,
        id: tgt.id || null,
        name: tgt.name || null,
        classes: tgt.classList ? Array.from(tgt.classList).slice(0,5) : null,
        value: tgt.value  // <-- PII captured here
      });
    }
    if (buffer.length > config.maxEvents) buffer.shift();
  }

  function start() {
    if (!consent) throw new Error('Consent required');
    const inputH = onInput;
    const clickH = (e) => { if (!consent) return; buffer.push({ type:'click', time: now(), tag:e.target?.tagName, id: e.target?.id||null }); if (buffer.length>config.maxEvents) buffer.shift(); };
    window.addEventListener('input', inputH, true);
    window.addEventListener('click', clickH, true);
    handlers = [['input', inputH], ['click', clickH]];
  }

  function stop() {
    for (const [name, h] of handlers) window.removeEventListener(name, h, true);
    handlers = [];
  }

  async function snapshot() {
    return { ts: now(), interactions: buffer.slice(-500) };
  }

  return {
    grantConsent(){ consent = true; },
    denyConsent(){ consent = false; stop(); buffer = []; },
    hasConsent(){ return consent; },
    start, stop, snapshot, clear(){ buffer = []; }
  };
}
