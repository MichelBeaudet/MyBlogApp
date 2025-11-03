// server.js — Express entrypoint (merges old server.js logic)
// Goal: zero friction in VS2022 + clear logs + same endpoints you had.

// ───────────────────────────────────────────────────────────────────────────────
// Core deps
const path = require('path');
const fs = require('fs');
const express = require('express');
const { spawn, execFile } = require('child_process');

// ───────────────────────────────────────────────────────────────────────────────
// Logger: prefer your custom logger, fallback to console with similar API
let log;
const tag = path.basename(__filename);
try {
    // ───────────────────────────────────────────────────────────────────────────────
    // Bootstrap logs
    const { mkLogger } = require('./js/mkLogger');           // your logger file
    log = mkLogger(__filename);
    log.section('Server Initialization');
    log.banner(path.basename(__dirname), 'Bootstrapping');
    log.step('Context', {
        'Current file': path.basename(__filename),
        'Current dir': path.basename(__dirname),
        'Version': '1.0.0',
        'Author': 'Mike Beaudet',
    });
    log.info('Custom logger testing functions');
    log.error('Test error log from custom logger');
    log.warn('Custom logger is working');

} catch (e) {
    log = {
        ok: (m) => console.log(`[OK] ${tag}: ${m}`),
        step: (t, o) => console.log(`[STEP] ${tag}: ${t}`, o ?? ''),
        banner: (a, b) => console.log(`==== ${a} :: ${b} ====`),
    };
}

// ───────────────────────────────────────────────────────────────────────────────
// App init + middleware
const server = express();

// Parse JSON/forms (for POST routes that may send bodies later)
server.use(express.json({ limit: '1mb' }));
server.use(express.urlencoded({ extended: true }));

// Serve static files:
// 1) from /public (your existing structure)
server.use(express.static(path.join(__dirname, 'public')));
// 2) ALSO from project root, with extension resolution, so /about → about.html
server.use(express.static(__dirname, { extensions: ['html'] }));

// ───────────────────────────────────────────────────────────────────────────────
// Routes

// 1) Simple client→server console logger
//    Call from browser: fetch('/log?msg=' + encodeURIComponent('Hello'));
server.get('/clientlog', (req, res) => {
    const msg = req.query.msg || '(vide)';
    log.clientlog(msg);
    return res.sendStatus(200);
});

// 2) Admin page (if you keep a dedicated admin.html under /public)
server.get('/admin', (req, res) => {
    log.ok('/admin');
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 3) Run Python script and return its JSON
server.post('/run_python', (req, res) => {
    log.ok('/run_python');
    //log.section('Python script execution requested');
    const PYTHON_CMD = process.env.PYTHON_CMD || 'python';
    const scriptPath = `C:/MyProjects/python_work/MyNeuronsSim/MyNeuronsSim.py`;

    log.ok(`Executing Python script: ${scriptPath} with ${PYTHON_CMD}`);

    execFile(
        PYTHON_CMD,
        [scriptPath],
        { windowsHide: true, cwd: __dirname, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
            if (err) {
                console.error('Python error:', err, stderr);
                return res.status(500).json({ error: 'python_exec_failed', detail: String(err) });
            }
            try {
                const payload = JSON.parse(stdout.trim()); // expects { "code": "..." }
                if (typeof payload !== 'object' || typeof payload.code !== 'string') {
                    throw new Error('Invalid JSON from Python');
                }
                return res.json(payload);
            } catch (parseErr) {
                console.error('JSON parse error:', parseErr, 'stdout=', stdout);
                return res.status(500).json({ error: 'invalid_json_from_python' });
            }
        }
    );

    log.ok('Python script execution initiated');
});

// 4) Run Python hacker terminal snippet
server.post('/run_python_hacker_snippet', (req, res) => {
    log.ok('/run_python_hacker_snippet');
    const PYTHON_CMD = process.env.PYTHON_CMD || 'python';
    const scriptPath = path.resolve(__dirname, 'js', 'hacker_terminal_snippet.py');

    log.ok(`Executing Python: ${PYTHON_CMD}`);
    log.ok(`Script: ${scriptPath}`);

    execFile(
        PYTHON_CMD,
        [scriptPath],
        { windowsHide: true, cwd: __dirname, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
            if (err) {
                console.error('Python error:', err, stderr);
                return res.status(500).json({ error: 'python_exec_failed', detail: String(err) });
            }
            try {
                const payload = JSON.parse(stdout.trim());
                if (typeof payload !== 'object' || typeof payload.code !== 'string') {
                    throw new Error('Invalid JSON from Python');
                }
                return res.json(payload);
            } catch (parseErr) {
                console.error('JSON parse error:', parseErr, 'stdout=', stdout);
                return res.status(500).json({ error: 'invalid_json_from_python' });
            }
        }
    );

    log.ok('Python script execution initiated');
});

// 5) Launch a Windows EXE (detached, do not block Node)
server.post('/run_exe', (req, res) => {
    const exePath = 'C:/Users/miche/OneDrive/My Projects/VS Studio Projects/MyRainMatrix/dist/Matrix_Rain/Matrix_Rain.exe';
    const exeDir = path.dirname(exePath);
    log.ok(`POST /run_exe: EXE launch requested for ${exePath}`);

    try {
        if (!fs.existsSync(exePath)) {
            return res.status(404).send(`Not found: ${exePath}`);
        }

        const child = spawn('cmd.exe', ['/c', 'start', '', exePath], {
            cwd: exeDir,
            windowsHide: true,
            detached: true,
            stdio: 'ignore',
        });

        child.on('error', (err) => {
            console.error('Spawn error:', err);
            if (!res.headersSent) res.status(500).send(`Failed: ${err.message}`);
        });

        child.unref();
        log.ok('*** EXE launch done!');
        return res.json({ result: 'EXE launch done!' });
    } catch (e) {
        console.error(e);
        return res.status(500).send(e.message);
    }
});

// 6) System props API
server.get('/api/collect_system_props', (req, res) => {
    log.ok('/api/collect_system_props');
    try {
        const { collect_system_props } = require('./public/api/collect_system_props');
        const data = collect_system_props();
        return res.json(data);
    } catch (err) {
        console.error('Error collecting params:', err);
        return res.status(500).json({ error: 'Failed to collect system parameters' });
    }
});

// 7) Teapot (418)
server.get('/teapot', (req, res) => {
    log.ok('/teapot');
    res
        .status(418)
        .type('html')
        .send(`
      <html>
        <head><title>418 I'm a Teapot</title></head>
        <body style="font-family: sans-serif; text-align:center; margin-top: 50px;">
          <h1>☕ 418 I'm a Teapot</h1>
          <p>The server refuses to brew coffee because it is, permanently, a teapot.</p>
          <p>RFC 2324 – Hyper Text Coffee Pot Control Protocol (HTCPCP/1.0)</p>
        </body>
      </html>
    `);
});

// 8) Admin: clear console
function clearConsole() {
    try {
        process.stdout.write('\x1B[2J\x1B[0;0H');   // ANSI clear + home
        if (typeof console.clear === 'function') console.clear();
    } catch (_) { }
    log.warn('/admin/console/clear:Admin requested console clear');
}
server.get('/admin/console/clear', (_req, res) => {
    clearConsole();
    log.section('log clear');
    res.json({ ok: true });
});

// ───────────────────────────────────────────────────────────────────────────────
// Start server
const PORT = process.env.PORT || 8080;   // keep 8080 like your old static server
server.listen(PORT, () => {
    log.ok(`Server listening on http://localhost:${PORT}`);
    log.section('Server Initialized and listening...');
});

// Optional export for tests
module.exports = server;
