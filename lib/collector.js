/**
 * lib/collector.js — Orchestrates OS detection, parsing, and enrichment.
 */
const os = require('os');
const { execPromise, tryExec } = require('./sysExec');
const { parseWindowsNetstat, parseLinuxSS, parseLsof } = require('./parsers');
const { getWindowsPidMap } = require('./windows');
const { getOwnerMap } = require('./owners');

function normalize(records) {
  return records.map(d => ({
    key: String(d.key || ''),
    protocol: d.protocol || null,
    localAddress: d.localAddress || null,
    localPort: Number.isFinite(d.localPort) ? d.localPort : null,
    remoteAddress: d.remoteAddress || null,
    remotePort: Number.isFinite(d.remotePort) ? d.remotePort : null,
    state: d.state || null,
    pid: Number.isFinite(d.pid) ? d.pid : null,
    processName: d.processName || null,
    owner: d.owner || null
  }));
}

async function collectConnections() {
  const platform = os.platform();
  let conns = [];

  if (platform === 'win32') {
    const { stdout } = await execPromise('netstat -ano');
    console.log('[collector] first 200 bytes:', stdout.slice(0, 200));
    conns = parseWindowsNetstat(stdout);
    const pidMap = await getWindowsPidMap().catch(() => ({}));
    for (const c of conns) if (c.pid && pidMap[c.pid]) c.processName = pidMap[c.pid];
  } else if (platform === 'linux') {
    try {
      const { stdout } = await execPromise('ss -tunap');
      conns = parseLinuxSS(stdout);
      if (!conns.length) throw new Error('empty');
    } catch {
      const { stdout } = await execPromise('lsof -nP -i');
      conns = parseLsof(stdout);
    }
  } else {
    const { stdout } = await tryExec(['lsof -nP -i']);
    conns = parseLsof(stdout);
  }

  // Owner enrichment (best-effort)
  const ownerMap = await getOwnerMap().catch(() => ({}));
  for (const c of conns) {
    if (c.pid && ownerMap[c.pid]) c.owner = ownerMap[c.pid];
  }

  const norm = normalize(conns);
  return { ok: true, count: norm.length, connections: norm, platform };
}

async function getRawOSOutput() {
  const platform = os.platform();
  if (platform === 'win32') {
    const { stdout } = await execPromise('netstat -ano');
    return stdout;
  } else if (platform === 'linux') {
    try {
      const { stdout } = await execPromise('ss -tunap'); return stdout;
    } catch {
      const { stdout } = await execPromise('lsof -nP -i'); return stdout;
    }
  } else {
    const { stdout } = await execPromise('lsof -nP -i'); return stdout;
  }
}

module.exports = { collectConnections, getRawOSOutput };
