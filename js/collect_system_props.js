// collect_system_props.js
// Collects system parameters. Can be imported or run directly to write a JSON snapshot.

console.log(`***In collect_system_props.js`);

const os = require('os');
const fs = require('fs');
const path = require('path');
function collect_system_props() {
    return {
        capturedAt: new Date().toISOString(),
        environment: process.env, // NOTE: may include secrets in your shell
        process: {
            pid: process.pid,
            nodeVersion: process.version,
            argv: process.argv,
            execPath: process.execPath,
            cwd: process.cwd(),
            memoryUsage: process.memoryUsage(),
            uptimeSec: process.uptime()
        },
        os: {
            platform: os.platform(),
            type: os.type(),
            release: os.release(),
            arch: os.arch(),
            cpus: os.cpus(), // array with model/speed/times per core
            totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
            freeMemoryMB: Math.round(os.freemem() / (1024 * 1024)),
            hostname: os.hostname(),
            homedir: os.homedir(),
            tmpdir: os.tmpdir(),
            networkInterfaces: os.networkInterfaces()
        },
        versions: process.versions
    };
}

module.exports = { collect_system_props };
function writeStartupSnapshot() {
    try {
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
        fs.writeFileSync(snapshotFile, JSON.stringify(collect_system_props(), null, 2), 'utf-8');
        console.log(`\n***Startup snapshot written to ${snapshotFile}`);
    } catch (e) {
        console.warn('Could not write startup snapshot:', e.message);
    }
};
writeStartupSnapshot()
// --- Optional CLI usage: 
if (require.main === module) {
    const data = collect_system_props();
    const outDir = path.join(__dirname, 'public');
    const outFile = path.join(outDir, 'system_props.json');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`***Snapshot written to ${outFile}`);
}
