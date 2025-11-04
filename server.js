// server.js
// Recreated server with all previous endpoints and added ports scan endpoints.
// - Serves /public static files
// - Existing endpoints preserved (clientlog, admin, run_python, run_exe, etc.)
// - New: GET /scan_ports?max=65535  -> returns JSON list (one-shot)
// - New: GET /scan?max=65535        -> Server-Sent Events (progress + final data)
//
// Usage:
//   npm i express
//   node server.js
//
// Notes:
//   - This file expects js/syslib_ports.js to export { scanPorts, splitHostPort }
//   - SSE endpoint uses heartbeat and X-Accel-Buffering header to reduce proxy timeouts.

const path = require('path');
const fs = require('fs');
const express = require('express');
const { spawn, execFile } = require('child_process');

// Logger: prefer your custom logger, fallback to console with similar API
let log;
const tag = path.basename(__filename);
try {
    const { mkLogger } = require('./js/mkLogger'); // your custom logger if present
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
} catch (e) {
    // Minimal fallback logger with same methods used below
    log = {
        ok: (m) => console.log(`[OK] ${tag}: ${m}`),
        step: (t, o) => console.log(`[STEP] ${tag}: ${t}`, o ?? ''),
        banner: (a, b) => console.log(`==== ${a} :: ${b} ====`),
        warn: (m) => console.warn(`[WARN] ${tag}: ${m}`),
        error: (m) => console.error(`[ERR] ${tag}: ${m}`),
        clientlog: (m) => console.log(`[CLIENT] ${tag}: ${m}`),
        section: (s) => console.log(`\n---- ${s} ----`)
    };
}

// Create express server instance
const server = express();

// Parse JSON/forms
server.use(express.json({ limit: '1mb' }));
server.use(express.urlencoded({ extended: true }));

// Serve static files from public and project root (extension resolution)
server.use(express.static(path.join(__dirname, 'public')));
server.use(express.static(__dirname, { extensions: ['html'] }));

// ----------------- Existing routes (preserved) --------------------------------

// Client logger endpoint
server.get('/clientlog', (req, res) => {
    const msg = req.query.msg || '(vide)';
    log.clientlog(msg);
    return res.sendStatus(200);
});

// Admin page
server.get('/admin', (req, res) => {
    log.ok('/admin');
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Run Python script (existing)
server.post('/run_python', (req, res) => {
    log.ok('/run_python');
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
                const payload = JSON.parse(stdout.trim()); // expects JSON from Python
                if (typeof payload !== 'object') throw new Error('Invalid JSON from Python');
                return res.json(payload);
            } catch (parseErr) {
                console.error('JSON parse error:', parseErr, 'stdout=', stdout);
                return res.status(500).json({ error: 'invalid_json_from_python' });
            }
        }
    );

    log.ok('Python script execution initiated');
});

// Run Python hacker snippet (existing)
server.post('/run_python_hacker_snippet', (req, res) => {
    log.ok('/run_python_hacker_snippet');
    const PYTHON_CMD = process.env.PYTHON_CMD || 'python';
    const scriptPath = path.resolve(__dirname, 'js', 'hacker_terminal_snippet.py');

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
                return res.json(payload);
            } catch (parseErr) {
                console.error('JSON parse error:', parseErr, 'stdout=', stdout);
                return res.status(500).json({ error: 'invalid_json_from_python' });
            }
        }
    );

    log.ok('Python snippet execution initiated');
});

// Launch a Windows EXE (existing)
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

// System props API (existing)
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

// Teapot (418)
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

// Admin: clear console (existing)
function clearConsole() {
    try {
        process.stdout.write('\x1B[2J\x1B[0;0H');
        if (typeof console.clear === 'function') console.clear();
    } catch (_) { }
    log.warn('/admin/console/clear:Admin requested console clear');
}
server.get('/admin/console/clear', (_req, res) => {
    clearConsole();
    log.section('log clear');
    res.json({ ok: true });
});

// ----------------- Ports integration ----------------------------------------

// Import the new syslib_ports module (must exist at ./js/syslib_ports.js)
let syslibPorts;
try {
    syslibPorts = require('./js/syslib_ports');
    log.ok('syslib_ports module loaded');
} catch (e) {
    log.error('Failed to load ./js/syslib_ports.js: ' + String(e));
    syslibPorts = null;
}

/**
 * GET /scan_ports?max=65535
 * Simple one-shot JSON endpoint that returns the list of port entries filtered by max.
 * Useful for quick checks from the frontend or scripts.
 */
server.get('/scan_ports', async (req, res) => {
    if (!syslibPorts || typeof syslibPorts.scanPorts !== 'function') {
        return res.status(500).json({ ok: false, error: 'syslib_ports not available' });
    }
    const maxPort = Math.min(65535, Math.max(1, parseInt(req.query.max, 10) || 65535));
    try {
        const data = await syslibPorts.scanPorts(maxPort);
        return res.json({ ok: true, maxPort, count: data.length, data });
    } catch (err) {
        console.error('scan_ports failed:', err);
        return res.status(500).json({ ok: false, error: String(err) });
    }
});

/**
 * GET /scan?max=65535
 * SSE endpoint streaming progress updates and final data.
 * Messages:
 *  - { type: 'start', maxPort }
 *  - { type: 'progress', current, total }   // total is estimated while streaming
 *  - { type: 'done', data: [...] }
 *  - { type: 'error', message }
 */
server.get('/scan', async (req, res) => {
    // Basic SSE headers + disable buffering for proxies (nginx)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // hint for nginx to not buffer
    res.flushHeaders?.();

    // Heartbeat to keep intermediaries from closing idle SSE
    const hb = setInterval(() => {
        try { res.write(': hb\n\n'); } catch (_) { }
    }, 15000);

    const safeEnd = () => {
        clearInterval(hb);
        try { res.end(); } catch (_) { }
    };

    if (!syslibPorts || typeof syslibPorts.scanPorts !== 'function') {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'syslib_ports not available' })}\n\n`);
        return safeEnd();
    }

    const maxPort = Math.min(65535, Math.max(1, parseInt(req.query.max, 10) || 65535));
    res.write(`data: ${JSON.stringify({ type: 'start', maxPort })}\n\n`);

    // Use scanPorts with a progress callback to stream progress messages
    try {
        const entries = await syslibPorts.scanPorts(maxPort, (current, estimateTotal) => {
            // progress callback invoked by syslib_ports periodically
            try {
                res.write(`data: ${JSON.stringify({ type: 'progress', current, total: estimateTotal })}\n\n`);
            } catch (e) {
                // ignore write errors (client may have disconnected)
            }
        });

        // final send
        res.write(`data: ${JSON.stringify({ type: 'done', data: entries })}\n\n`);
        safeEnd();
    } catch (err) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`);
        safeEnd();
    }

    // If client disconnects, nothing to do because scanPorts uses spawn and will end, but listen anyway
    req.on('close', () => {
        safeEnd();
    });
});

// Minimal /proxy_fetch: JSON or SSE (progress) using syslib_analyze_url.js

const { analyzeUrl, analyzeUrlStream } = require('./js/syslib_analyze_url');

server.get('/proxy_fetch', async (req, res) => {
    const raw = (req.query.url || '').trim();
    const wantsStream = req.query.stream === '1' || (req.get('accept') || '').includes('text/event-stream');

    if (!wantsStream) {
        // ---------- JSON mode ----------
        try {
            const result = await analyzeUrl(raw, {
                timeoutMs: 20000,
                userAgent: 'syslib-analyzer/1.0 (+local)'
            });
            return res.json(result);
        } catch (e) {
            const code = e.code === 'invalid_url' || e.code === 'invalid_scheme' ? 400 : 502;
            return res.status(code).json({ ok: false, error: e.code || 'analyze_failed', detail: String(e.message || e) });
        }
    }

    // ---------- SSE mode ----------
    // Standard SSE headers (+ anti-buffering hint for Nginx)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Heartbeat so proxies don’t cut the stream
    const hb = setInterval(() => {
        try { res.write(': hb\n\n'); } catch (_) { }
    }, 15000);

    const safeEnd = () => {
        clearInterval(hb);
        try { res.end(); } catch (_) { }
    };

    try {
        for await (const evt of analyzeUrlStream(raw, {
            timeoutMs: 20000,
            userAgent: 'syslib-analyzer/1.0 (+local)'
        })) {
            // Each event becomes one SSE message
            res.write(`data: ${JSON.stringify(evt)}\n\n`);
        }
        safeEnd();
    } catch (e) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: e.code || 'analyze_failed', detail: String(e.message || e) })}\n\n`);
        safeEnd();
    }

    // If client disconnects, just stop writing
    req.on('close', safeEnd);
});


// ----------------- Remaining server start ----------------------------------

const PORT = process.env.PORT || 8080;   // keep 8080 like your old static server
server.listen(PORT, () => {
    log.section('Server Initialized and listening...');
    log.ok(`Server listening on http://localhost:${PORT}`);
});

module.exports = server;
