/**
 * lib/windows.js — Windows-specific helpers.
 * Provides PID→ProcessName enrichment using PowerShell.
 */

const { execPromise } = require('./sysExec');

async function getWindowsPidMap() {
  // Using ConvertTo-Csv gives stable output without requiring extra parsing deps.
  const ps = 'powershell -NoProfile -Command "Get-Process | Select-Object Id,ProcessName | ConvertTo-Csv -NoTypeInformation"';
  try {
    const { stdout } = await execPromise(ps);
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const map = {};
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i].replace(/^"|"$/g, '');
      const [idStr, name] = raw.split('","');
      const pid = Number(idStr);
      if (Number.isFinite(pid)) map[pid] = name;
    }
    return map;
  } catch {
    return {};
  }
}

module.exports = { getWindowsPidMap };
