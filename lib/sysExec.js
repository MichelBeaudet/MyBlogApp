/**
 * lib/sysExec.js — Thin wrapper helpers around child_process.exec
 * Provides Promise-based exec and a 'tryExec' that tries a list of commands.
 */

const { exec } = require('child_process');

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout: stdout.toString('utf8'), stderr: (stderr || '').toString() });
    });
  });
}

async function tryExec(cmds) {
  for (const item of cmds) {
    const cmd = typeof item === 'string' ? item : item.cmd;
    try {
      const out = await execPromise(cmd);
      return { cmd, ...out };
    } catch {
      // proceed to next
    }
  }
  throw new Error('All commands failed.');
}

module.exports = { execPromise, tryExec };
