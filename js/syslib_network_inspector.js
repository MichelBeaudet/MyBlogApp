// public/syslib_network_inspector.js — JSON-first with RAW fallback (fr/en)

sendLog('Loaded syslib_network_inspector.js (with RAW fallback)');

const RAW_ENDPOINTS = ['/network_inspector', '/network_raw']; // try in this order
const state = { sortKey: 'protocol', sortDir: 1, timer: null, lastSnapshotKeys: new Set(), data: [], platform: '' };
const el = {
    tbody: document.getElementById('tbody'),
    count: document.getElementById('count'),
    platform: document.getElementById('platform'),
    refresh: document.getElementById('refresh'),
    proto: document.getElementById('proto'),
    state: document.getElementById('state'),
    q: document.getElementById('q'),
    onlyRemote: document.getElementById('onlyRemote'),
    refreshNow: document.getElementById('refreshNow'),
    exportCsv: document.getElementById('exportCsv'),
    exportJson: document.getElementById('exportJson'),
    headers: Array.from(document.querySelectorAll('thead th')),
};

function hp(addr, port) { if (!addr) return ''; if (port != null && port !== '') return addr.includes(':') && !addr.startsWith('[') ? `[${addr}]:${port}` : `${addr}:${port}`; return String(addr); }

// ---- RAW parsing helpers (Windows netstat -ano, fr/en) ----
function splitHostPort(addr) {
    if (!addr) return { host: addr, port: null };
    const m = addr.match(/^\[([^\]]+)\]:(\d+)$/); if (m) return { host: m[1], port: Number(m[2]) };
    const k = addr.lastIndexOf(':'); if (k > -1 && addr.indexOf(':') === k) { const host = addr.slice(0, k); const port = Number(addr.slice(k + 1)); return { host, port: Number.isFinite(port) ? port : null }; }
    if (addr === '*:*') return { host: '*', port: null };
    return { host: addr, port: null };
}
function normState(s) {
    const u = (s || '').toUpperCase();
    return u
        .replace('ÉCOUTE', 'LISTENING').replace('ECOUTE', 'LISTENING')
        .replace('ÉTABLIE', 'ESTABLISHED').replace('ETABLIE', 'ESTABLISHED')
        .replace('FERMÉE', 'CLOSED').replace('FERMEE', 'CLOSED')
        .replace('TEMPS_ATTENTE', 'TIME_WAIT')
        .replace('FIN_ATTENTE_1', 'FIN_WAIT_1').replace('FIN_ATTENTE_2', 'FIN_WAIT_2');
}
function parseRawNetstat(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
        if (/^(Active Connections|Connexions actives)\b/i.test(line)) continue;
        if (/^(Proto|Adresse locale|Local Address)\b/i.test(line)) continue;
        if (!/(^| )TCP( |$)|(^| )UDP( |$)/i.test(line)) continue;

        const parts = line.replace(/\t+/g, ' ').replace(/\s+/g, ' ').split(' ');
        const proto = (parts[0] || '').toUpperCase();
        if (proto !== 'TCP' && proto !== 'UDP') continue;

        if (proto === 'TCP' && parts.length >= 5) {
            const local = parts[1], remote = parts[2], state = normState(parts[3]), pid = Number(parts[4]) || null;
            const { host: la, port: lp } = splitHostPort(local);
            const { host: ra, port: rp } = splitHostPort(remote);
            rows.push({ key: `${proto}|${local}|${remote}|${pid}`, protocol: 'TCP', localAddress: la, localPort: lp, remoteAddress: ra, remotePort: rp, state: state || '', pid, processName: null, owner: null });
        } else if (proto === 'UDP' && parts.length >= 4) {
            const local = parts[1], remote = parts[2], pid = Number(parts[parts.length - 1]) || null;
            const { host: la, port: lp } = splitHostPort(local);
            const { host: ra, port: rp } = splitHostPort(remote);
            rows.push({ key: `${proto}|${local}|${remote}|${pid}`, protocol: 'UDP', localAddress: la, localPort: lp, remoteAddress: ra, remotePort: rp, state: 'UNSPECIFIED', pid, processName: null, owner: null });
        }
    }
    return rows;
}

// ---- Primary fetchers ----
async function fetchJSON() {
    sendLog('GET /network/connections');
    const r = await fetch('/network/connections', { cache: 'no-store' });
    if (!r.ok) throw new Error('Fetch /network/connections failed: ' + r.status);
    return r.json();
}
async function fetchRAW() {
    for (const ep of RAW_ENDPOINTS) {
        try {
            sendLog('GET ' + ep);
            const r = await fetch(ep, { cache: 'no-store' });
            if (!r.ok) continue;
            return { endpoint: ep, text: await r.text() };
        } catch (e) { /* try next */ }
    }
    throw new Error('No RAW endpoint reachable (tried /network_inspector and /network_raw)');
}

// ---- Rendering + UI ----
function render() {
    const proto = el.proto.value;
    const st = el.state.value;
    const query = el.q.value.trim().toLowerCase();
    const onlyRemote = el.onlyRemote.checked;

    let rows = state.data.filter(c => {
        if (proto && c.protocol !== proto) return false;
        const s = (c.state || '').toUpperCase();
        if (st) {
            if (st === 'LISTEN' && s !== 'LISTEN' && s !== 'LISTENING') return false;
            else if (st !== 'LISTEN' && s !== st) return false;
        }
        if (onlyRemote) {
            const ra = (c.remoteAddress || '').toLowerCase();
            if (!ra || ra === '*' || ra === '0.0.0.0' || ra === '::') return false;
        }
        if (query) {
            const blob = [c.protocol, c.localAddress, c.localPort, c.remoteAddress, c.remotePort, c.state, c.pid, c.processName, c.owner]
                .map(x => (x == null ? '' : String(x))).join(' ').toLowerCase();
            if (!blob.includes(query)) return false;
        }
        return true;
    });

    const k = state.sortKey, dir = state.sortDir;
    rows.sort((a, b) => {
        const va = valueForSort(a, k);
        const vb = valueForSort(b, k);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
    });

    const prevKeys = state.lastSnapshotKeys;
    el.tbody.innerHTML = rows.map(r => {
        const isNew = !prevKeys.has(r.key);
        const cls = isNew ? 'delta-new' : '';
        const local = hp(r.localAddress, r.localPort);
        const remote = hp(r.remoteAddress, r.remotePort);
        const stxt = (r.state || '').toUpperCase().replace('LISTENING', 'LISTEN');
        return `<tr class="${cls}">
        <td>${r.protocol || ''}</td>
        <td>${escapeHtml(local)}</td>
        <td>${escapeHtml(remote)}</td>
        <td class="state ${stxt}">${stxt || ''}</td>
        <td>${r.pid ?? ''}</td>
        <td>${r.processName ? escapeHtml(r.processName) : ''}</td>
        <td>${r.owner ? escapeHtml(r.owner) : ''}</td>
      </tr>`;
    }).join('');

    state.lastSnapshotKeys = new Set(rows.map(r => r.key));
    el.count.textContent = `${rows.length} connection${rows.length === 1 ? '' : 's'}`;
    el.platform.textContent = state.platform ? `Platform: ${state.platform}` : '';
}

function valueForSort(row, key) {
    switch (key) {
        case 'local': return `${row.localAddress || ''}:${row.localPort ?? ''}`;
        case 'remote': return `${row.remoteAddress || ''}:${row.remotePort ?? ''}`;
        case 'pid': return row.pid ?? -1;
        case 'processName': return (row.processName || '').toLowerCase();
        case 'owner': return (row.owner || '').toLowerCase();
        case 'state': return (row.state || '').toLowerCase();
        default: return (row[key] || '').toString().toLowerCase();
    }
}
function escapeHtml(s) { return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", "&#39;"); }

el.headers.forEach(th => {
    th.addEventListener('click', () => {
        const keyMap = { protocol: 'protocol', local: 'local', remote: 'remote', state: 'state', pid: 'pid', processName: 'processName', owner: 'owner' };
        const key = keyMap[th.dataset.key];
        if (state.sortKey === key) state.sortDir = -state.sortDir; else { state.sortKey = key; state.sortDir = 1; }
        render();
    });
});

function exportJSON() {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'connections.json' });
    a.click(); URL.revokeObjectURL(a.href);
}
function exportCSV() {
    const head = ['protocol', 'localAddress', 'localPort', 'remoteAddress', 'remotePort', 'state', 'pid', 'processName', 'owner'];
    const rows = state.data.map(r => head.map(h => r[h] ?? ''));
    const csv = [head.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'connections.csv' });
    a.click(); URL.revokeObjectURL(a.href);
}
function csvEscape(v) { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }

function schedule() { clearInterval(state.timer); const ms = Number(el.refresh.value); if (ms > 0) state.timer = setInterval(load, ms); }

async function load() {
    el.refreshNow.disabled = true;
    try {
        const rawRes = await fetch('/network_inspector', { cache: 'no-store' }); // or '/network_raw'
        if (!rawRes.ok) throw new Error('raw fetch failed: ' + rawRes.status);
        const text = await rawRes.text();
        state.data = parseRawNetstat(text);   // use helpers from the full code above
        state.platform = 'win32';
        render();
    } catch (e) {
        console.error(e);
        alert('Failed to fetch RAW netstat output.');
    } finally {
        el.refreshNow.disabled = false;
    }
}

el.refresh.addEventListener('change', schedule);
el.proto.addEventListener('change', render);
el.state.addEventListener('change', render);
el.q.addEventListener('input', render);
el.onlyRemote.addEventListener('change', render);
el.refreshNow.addEventListener('click', load);
el.exportJson.addEventListener('click', exportJSON);
el.exportCsv.addEventListener('click', exportCSV);
document.addEventListener('keydown', (e) => { if (e.key === 'r' || e.key === 'R') load(); });

schedule();
load();
