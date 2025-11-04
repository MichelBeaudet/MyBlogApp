// js/syslib_ports.js
// Helper library to parse netstat / tasklist on Windows and expose scanPorts()
// - Uses spawn to stream output and avoid exec buffers
// - Exported functions:
//    * scanPorts(maxPort = 65535, progressCb) -> Promise<Array<entry>>
//    * splitHostPort(addr) -> { host, port }
// Notes:
//    - progressCb(currentCount, estimatedTotal) is optional and called periodically.
//    - entry: { protocol, localAddress, localPort, foreignAddress, foreignPort, state, pid, processName }

const { spawn } = require('child_process');

/**
 * splitHostPort(addr)
 * - Handle IPv6 [::1]:port and IPv4/host:port
 * - Returns { host, port } where port is Number or NaN
 */
function splitHostPort(addr) {
    if (!addr) return { host: '', port: NaN };
    const m6 = addr.match(/^\[(.+)\]:(\d+)$/);
    if (m6) return { host: m6[1], port: Number(m6[2]) };
    const idx = addr.lastIndexOf(':');
    if (idx === -1) return { host: addr, port: NaN };
    const host = addr.slice(0, idx);
    const port = Number(addr.slice(idx + 1));
    return { host, port: Number.isFinite(port) ? port : NaN };
}

/**
 * buildPidMapWindows()
 * - Streams `tasklist /fo csv /nh` and builds Map<pid, imageName>
 * - Returns Promise<Map>
 */
function buildPidMapWindows() {
    return new Promise((resolve) => {
        const map = new Map();
        const ps = spawn('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true });

        let leftover = '';
        ps.stdout.on('data', (buf) => {
            const chunk = leftover + buf.toString('utf8');
            const lines = chunk.split(/\r?\n/);
            leftover = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim()) continue;
                // CSV parsing for quoted fields; simple state machine
                const cols = [];
                let cur = '', inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') { inQuotes = !inQuotes; continue; }
                    if (ch === ',' && !inQuotes) { cols.push(cur); cur = ''; } else cur += ch;
                }
                cols.push(cur);
                const imageName = (cols[0] || '').trim();
                const pid = parseInt((cols[1] || '').trim(), 10);
                if (imageName && !Number.isNaN(pid)) map.set(pid, imageName);
            }
        });

        ps.stdout.on('end', () => {
            if (leftover.trim()) {
                const line = leftover.trim();
                const cols = [];
                let cur = '', inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') { inQuotes = !inQuotes; continue; }
                    if (ch === ',' && !inQuotes) { cols.push(cur); cur = ''; } else cur += ch;
                }
                cols.push(cur);
                const imageName = (cols[0] || '').trim();
                const pid = parseInt((cols[1] || '').trim(), 10);
                if (imageName && !Number.isNaN(pid)) map.set(pid, imageName);
            }
            resolve(map);
        });

        ps.on('error', () => resolve(map));
        ps.stderr.on('data', () => { }); // ignore stderr
    });
}

/**
 * scanPorts(maxPort = 65535, progressCb)
 * - Streams `netstat -ano`
 * - progressCb(currentCount, estimatedTotal) called periodically if provided
 * - Resolves to array of entries
 */
async function scanPorts(maxPort = 65535, progressCb) {
    if (!Number.isFinite(maxPort)) maxPort = 65535;
    maxPort = Math.min(65535, Math.max(1, Math.floor(maxPort)));

    // Build pid->process map first (so we can join names while parsing)
    const pidMap = await buildPidMapWindows();

    return new Promise((resolve, reject) => {
        const ns = spawn('netstat', ['-ano'], { windowsHide: true });
        const entries = [];
        let leftover = '';
        let parsedCount = 0;
        let estimateTotal = 200; // growing estimate; caller should treat as heuristic

        function maybeProgress() {
            if (typeof progressCb === 'function') {
                try { progressCb(parsedCount, Math.max(parsedCount + 1, estimateTotal)); } catch (_) { }
            }
        }

        ns.stdout.on('data', (buf) => {
            const chunk = leftover + buf.toString('utf8');
            const lines = chunk.split(/\r?\n/);
            leftover = lines.pop() || '';

            for (const raw of lines) {
                const line = raw.trim();
                if (!line || !/^(TCP|UDP)\s+/i.test(line)) continue;
                const parts = line.split(/\s+/);
                const protocol = parts[0].toUpperCase();

                if (protocol === 'TCP' && parts.length >= 5) {
                    const local = parts[1] || '';
                    const foreign = parts[2] || '';
                    const state = parts[3] || '';
                    const pid = parseInt(parts[4], 10);
                    const { host: localAddress, port: localPort } = splitHostPort(local);
                    const { host: foreignAddress, port: foreignPort } = splitHostPort(foreign);
                    parsedCount++;
                    if (Number.isFinite(localPort) && localPort <= maxPort) {
                        entries.push({
                            protocol,
                            localAddress,
                            localPort,
                            foreignAddress,
                            foreignPort,
                            state,
                            pid: Number.isNaN(pid) ? null : pid,
                            processName: Number.isNaN(pid) ? '' : (pidMap.get(pid) || '')
                        });
                    }
                } else if (protocol === 'UDP') {
                    // UDP line: UDP local foreign pid (pid often at the end)
                    const possiblePid = parts[parts.length - 1];
                    const pid = parseInt(possiblePid, 10);
                    const local = parts[1] || '';
                    const foreign = parts[2] || '*:*';
                    const { host: localAddress, port: localPort } = splitHostPort(local);
                    const { host: foreignAddress, port: foreignPort } = splitHostPort(foreign);
                    parsedCount++;
                    if (Number.isFinite(localPort) && localPort <= maxPort) {
                        entries.push({
                            protocol,
                            localAddress,
                            localPort,
                            foreignAddress,
                            foreignPort,
                            state: '',
                            pid: Number.isNaN(pid) ? null : pid,
                            processName: Number.isNaN(pid) ? '' : (pidMap.get(pid) || '')
                        });
                    }
                }

                // Throttle progress emissions for performance
                if ((parsedCount % 25) === 0) {
                    estimateTotal = Math.max(estimateTotal, parsedCount + 50);
                    maybeProgress();
                }
            }
        });

        ns.stdout.on('end', () => {
            if (leftover.trim()) {
                const line = leftover.trim();
                if (/^(TCP|UDP)\s+/i.test(line)) {
                    const parts = line.split(/\s+/);
                    const protocol = parts[0].toUpperCase();
                    if (protocol === 'TCP' && parts.length >= 5) {
                        const local = parts[1] || '';
                        const foreign = parts[2] || '';
                        const state = parts[3] || '';
                        const pid = parseInt(parts[4], 10);
                        const { host: localAddress, port: localPort } = splitHostPort(local);
                        const { host: foreignAddress, port: foreignPort } = splitHostPort(foreign);
                        parsedCount++;
                        if (Number.isFinite(localPort) && localPort <= maxPort) {
                            entries.push({
                                protocol,
                                localAddress,
                                localPort,
                                foreignAddress,
                                foreignPort,
                                state,
                                pid: Number.isNaN(pid) ? null : pid,
                                processName: Number.isNaN(pid) ? '' : (pidMap.get(pid) || '')
                            });
                        }
                    } else if (protocol === 'UDP') {
                        const possiblePid = parts[parts.length - 1];
                        const pid = parseInt(possiblePid, 10);
                        const local = parts[1] || '';
                        const foreign = parts[2] || '*:*';
                        const { host: localAddress, port: localPort } = splitHostPort(local);
                        const { host: foreignAddress, port: foreignPort } = splitHostPort(foreign);
                        parsedCount++;
                        if (Number.isFinite(localPort) && localPort <= maxPort) {
                            entries.push({
                                protocol,
                                localAddress,
                                localPort,
                                foreignAddress,
                                foreignPort,
                                state: '',
                                pid: Number.isNaN(pid) ? null : pid,
                                processName: Number.isNaN(pid) ? '' : (pidMap.get(pid) || '')
                            });
                        }
                    }
                }
            }

            // Final progress callback before resolve
            if (typeof progressCb === 'function') {
                try { progressCb(parsedCount, parsedCount); } catch (_) { }
            }

            // Sort results for nicer presentation (by port then protocol)
            entries.sort((a, b) => (a.localPort - b.localPort) || a.protocol.localeCompare(b.protocol));
            resolve(entries);
        });

        ns.on('error', (err) => {
            reject(err);
        });

        ns.stderr.on('data', (buf) => {
            // If netstat writes to stderr, expose the message as an error condition
            const s = String(buf || '').trim();
            if (s) {
                // don't abort immediately; append to stderr and reject on error event
                // but inform caller by rejecting with stderr content
                // small safeguard: only reject if problem seems critical
                // we'll reject here to make failures explicit
                reject(new Error('netstat stderr: ' + s));
            }
        });
    });
}

module.exports = {
    splitHostPort,
    buildPidMapWindows,
    scanPorts
};
