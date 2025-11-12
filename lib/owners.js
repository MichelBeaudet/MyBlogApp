/**
 * lib/owners.js — Determine process owner usernames per platform.
 * Best-effort and dependency-free.
 */
const os = require('os');
const fs = require('fs');
const { execPromise } = require('./sysExec');

async function getOwnerMap() {
  const platform = os.platform();
  if (platform === 'win32') return await ownersWindows();
  if (platform === 'linux')  return await ownersLinux();
  if (platform === 'darwin') return await ownersDarwin();
  return {};
}

/* --------------------------- Windows --------------------------- */
async function ownersWindows() {
  // Using WMI GetOwner; can be slow on large systems. Requires sufficient privileges.
  const ps = 'powershell -NoProfile -Command "Get-WmiObject Win32_Process | Select-Object ProcessId, @{Name=\\\"Owner\\\";Expression={(($_.GetOwner()).User)}} | ConvertTo-Csv -NoTypeInformation"';
  try {
    const { stdout } = await execPromise(ps);
    const lines = stdout.split(/\\r?\\n/).filter(Boolean);
    const map = {};
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i].replace(/^"|"$/g, '');
      const parts = raw.split('","'); // ["ProcessId","Owner"]
      const pid = Number(parts[0]);
      const owner = parts[1] || null;
      if (Number.isFinite(pid) && owner) map[pid] = owner;
    }
    return map;
  } catch {
    return {};
  }
}

/* ---------------------------- Linux --------------------------- */
function readPasswd() {
  try { return fs.readFileSync('/etc/passwd', 'utf8'); } catch { return ''; }
}
function buildUidNameMap() {
  const txt = readPasswd();
  const map = {};
  for (const line of txt.split(/\\r?\\n/)) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(':');
    if (parts.length >= 3) {
      const name = parts[0];
      const uid = Number(parts[2]);
      if (Number.isFinite(uid)) map[uid] = name;
    }
  }
  return map;
}
function pidToUid(pid) {
  try {
    const txt = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const m = txt.match(/^Uid:\\s+(\\d+)/m);
    if (m) return Number(m[1]);
  } catch {}
  return null;
}
async function ownersLinux() {
  const uidName = buildUidNameMap();
  const map = {};
  let entries = [];
  try { entries = fs.readdirSync('/proc'); } catch {}
  for (const name of entries) {
    const pid = Number(name);
    if (!Number.isFinite(pid)) continue;
    const uid = pidToUid(pid);
    if (uid != null && uidName[uid]) map[pid] = uidName[uid];
  }
  return map;
}

/* ---------------------------- macOS --------------------------- */
async function ownersDarwin() {
  // Use `ps -axo pid,user` to map PID→USER quickly.
  try {
    const { stdout } = await execPromise('ps -axo pid,user');
    const lines = stdout.split(/\\r?\\n/).slice(1);
    const map = {};
    for (const line of lines) {
      const parts = line.trim().split(/\\s+/);
      if (parts.length >= 2) {
        const pid = Number(parts[0]);
        const user = parts[1];
        if (Number.isFinite(pid) && user) map[pid] = user;
      }
    }
    return map;
  } catch {
    return {};
  }
}

module.exports = { getOwnerMap };
