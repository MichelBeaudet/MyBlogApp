/**
 * lib/parsers.js — Parsing helpers for Windows / Linux / macOS.
 * - Windows: netstat -ano  (English + French locale)
 * - Linux  : ss -tunap
 * - macOS  : lsof -nP -i
 *
 * Exports:
 *   - splitHostPort(addr)
 *   - parseWindowsNetstat(text)
 *   - parseLinuxSS(text)
 *   - parseLsof(text)
 */

/* ---------------------------- Common utils ---------------------------- */

/**
 * Split "host:port" into {host, port} with IPv6 support "[::1]:443".
 * If no port, returns {host: addr, port: null}
 */
function splitHostPort(addr) {
  if (!addr) return { host: addr, port: null };

  // IPv6 in brackets: [::1]:443
  const mBracket = addr.match(/^\[([^\]]+)\]:(\d+)$/);
  if (mBracket) {
    return { host: mBracket[1], port: Number(mBracket[2]) };
  }

  // Plain "host:port" (but avoid splitting IPv6 literals without brackets)
  const lastColon = addr.lastIndexOf(':');
  if (lastColon > -1 && addr.indexOf(':') === lastColon) {
    const host = addr.slice(0, lastColon);
    const port = Number(addr.slice(lastColon + 1));
    return { host, port: Number.isFinite(port) ? port : null };
  }

  // Windows UDP sometimes shows "*:*"
  if (addr === '*:*') return { host: '*', port: null };

  return { host: addr, port: null };
}

/* ------------------------ Windows: netstat -ano ----------------------- */

/**
 * Parse output of "netstat -ano" on Windows.
 * Handles English and French localized headers/states.
 */

function parseWindowsNetstat(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // normalize French → English headers/states
    const normalized = lines.map(line =>
        line
            .replace(/^Connexions actives/i, 'Active Connections')
            .replace(/\bAdresse locale\b/i, 'Local Address')
            .replace(/\bAdresse distante\b/i, 'Foreign Address')
            .replace(/\b[ÉE]tat\b/i, 'State')
            .replace(/\bÉCOUTE\b/i, 'LISTENING')
            .replace(/\bECOUTE\b/i, 'LISTENING')
            .replace(/\bFERM[ÉE]E\b/i, 'CLOSED')
    );

    // ✅ allow optional leading space before TCP/UDP
    const dataLines = normalized.filter(l => /\b(TCP|UDP)\b/i.test(l));

    const results = [];
    for (const line of dataLines) {
        const parts = line.replace(/\s+/g, ' ').split(' ');
        const proto = (parts[0] || '').toUpperCase();

        if (proto === 'TCP' && parts.length >= 5) {
            const [, local, remote, state, pid] = parts;
            const { host: localAddress, port: localPort } = splitHostPort(local);
            const { host: remoteAddress, port: remotePort } = splitHostPort(remote);
            results.push({
                key: `${proto}|${local}|${remote}|${pid}`,
                protocol: 'TCP',
                localAddress, localPort, remoteAddress, remotePort,
                state: (state || '').toUpperCase(),
                pid: Number(pid) || null,
                processName: null,
                owner: null
            });
        } else if (proto === 'UDP' && parts.length >= 4) {
            const [, local, remote, pid] = parts;
            const { host: localAddress, port: localPort } = splitHostPort(local);
            const { host: remoteAddress, port: remotePort } = splitHostPort(remote);
            results.push({
                key: `${proto}|${local}|${remote}|${pid}`,
                protocol: 'UDP',
                localAddress, localPort, remoteAddress, remotePort,
                state: 'UNSPECIFIED',
                pid: Number(pid) || null,
                processName: null,
                owner: null
            });
        }
    }

    return results;
}


/* --------------------------- Linux: ss -tunap ------------------------- */

/**
 * Parse output of "ss -tunap" (Linux).
 * Looks for lines like:
 * tcp  LISTEN  0  4096  127.0.0.1:8080  0.0.0.0:*  users:(("node",pid=1234,fd=23))
 */
function parseLinuxSS(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const results = [];
  const data = lines.filter(l => !/^\s*Netid\s+/i.test(l)); // drop header row if present

  for (const line of data) {
    const m = line.match(/^(tcp|udp)\s+(\S+)\s+\S+\s+\S+\s+(\S+)\s+(\S+)(?:\s+users:\(\((.+)\)\))?/i);
    if (!m) continue;

    const protocol = m[1].toUpperCase();
    const state    = m[2].toUpperCase();
    const local    = m[3];
    const remote   = m[4];
    const users    = m[5] || '';

    const { host: localAddress, port: localPort }   = splitHostPort(local);
    const { host: remoteAddress, port: remotePort } = splitHostPort(remote);

    let pid = null, processName = null;
    const u = users.match(/"([^"]+)"[,)]\s*pid=(\d+)/);
    if (u) { processName = u[1]; pid = Number(u[2]); }

    results.push({
      key: `${protocol}|${local}|${remote}|${pid ?? ''}`,
      protocol,
      localAddress,
      localPort,
      remoteAddress,
      remotePort,
      state,
      pid,
      processName,
      owner: null
    });
  }

  return results;
}

/* ------------------------ macOS/Linux: lsof -i ------------------------ */

/**
 * Parse output of "lsof -nP -i" (macOS or Linux fallback).
 * Typical line:
 *   COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
 *   Google    123 user  ...  TCP  ...    ...      ...  127.0.0.1:8080->127.0.0.1:55555 (ESTABLISHED)
 */
function parseLsof(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const results = [];

  for (const line of lines) {
    const protoM = line.match(/\b(TCP|UDP)\b/i);
    if (!protoM) continue;

    const protocol = protoM[1].toUpperCase();

    // COMMAND PID USER ...
    const headM = line.match(/^(\S+)\s+(\d+)\s+(\S+)/);
    const pid   = headM ? Number(headM[2]) : null;
    const owner = headM ? headM[3] : null;

    // Extract state in parentheses at end, if present
    const afterProto = line.slice(line.indexOf(protoM[0]) + protoM[0].length).trim();
    const stateM = afterProto.match(/\(([^)]+)\)\s*$/);
    const state = stateM ? stateM[1].toUpperCase() : (protocol === 'UDP' ? 'UNSPECIFIED' : 'UNKNOWN');

    // Remove trailing "(STATE)" to isolate "local->remote" or just local
    const arrow = afterProto.replace(/\([^)]+\)\s*$/, '').trim();

    let local = null, remote = null;
    if (arrow.includes('->')) {
      const s = arrow.split('->');
      local  = s[0].trim();
      remote = s[1].trim();
    } else {
      local  = arrow.trim();
      remote = '*:*';
    }

    const { host: localAddress, port: localPort }   = splitHostPort(local);
    const { host: remoteAddress, port: remotePort } = splitHostPort(remote);
    const nameM = line.match(/^(\S+)/);
    const processName = nameM ? nameM[1] : null;

    results.push({
      key: `${protocol}|${local}|${remote}|${pid ?? ''}`,
      protocol,
      localAddress,
      localPort,
      remoteAddress,
      remotePort,
      state,
      pid,
      processName,
      owner
    });
  }

  return results;
}

/* ------------------------------- Exports ------------------------------ */

module.exports = {
  splitHostPort,
  parseWindowsNetstat,
  parseLinuxSS,
  parseLsof
};
