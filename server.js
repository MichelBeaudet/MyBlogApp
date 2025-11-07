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
        'Version': '2.0.0 Many implantations',
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
// /clientlog
server.get('/clientlog', (req, res) => {
    const msg = req.query.msg || '(vide)';
    log.clientlog(msg);
    return res.sendStatus(200);
});

// /nothing
server.get('/nothing', (req, res) => {
    log.section('/nothing');
    log.ok('Nothing to do!');
    res.sendFile(path.join(__dirname, 'public', 'nothing.html'));
});

// /admin/console/clear
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

// /run_python 
server.post('/run_python', (req, res) => {
    log.section('/run_python');
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

// /run_python_hacker_snippet
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

// /run_exe
server.post('/run_exe', (req, res) => {
    log.section('/run_exe');
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

// /collect_system_props
server.get('/collect_system_props', (req, res) => {
    log.ok('/collect_system_props');
    try {
        const { collect_system_props } = require('./js/collect_system_props');
        const data = collect_system_props();
        return res.json(data);
    } catch (err) {
        console.error('Error collecting params:', err);
        return res.status(500).json({ error: 'Failed to collect system parameters' });
    }
});

// /clear_sys_props_log
server.get('/clear_sys_props_log', (_req, res) => {
    log.section('clearing sys_props_log...');
    res.json({ ok: true });
});

// ----------------- Ports integration ----------------------------------------

// Import the new syslib_ports module (must exist at ./js/syslib_ports.js)
let syslibPorts;
try {
    syslibPorts = require('./syslib_ports');
    log.ok('syslib_ports module loaded');
} catch (e) {
    log.error('Failed to load ./js/syslib_ports.js: ' + String(e));
    syslibPorts = null;
}
// /scan_ports
server.get('/scan_ports', async (req, res) => {
    log.section('/scan_ports');
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

// Minimal analyze_url: JSON or SSE (progress) using syslib_analyze_url.js
const { analyzeUrl, analyzeUrlStream } = require('./js/syslib_analyze_url');

// analyze_url
server.get('/analyze_url', async (req, res) => {
    log.section('/analyze_url');
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

// /scan_bluetooth
server.get("/scan_bluetooth", (req, res) => {
    log.section('//scan_bluetooth');
    // Sanitize duration (float, 1..60 seconds)
    const PYTHON_BIN = process.env.PYTHON_BIN || "python";
    const dur = Math.max(1, Math.min(60, parseFloat(req.query.duration) || 8));
    const py = spawn(PYTHON_BIN, [path.join(__dirname, "./js/syslib_scan_bluetooth.py"), "--duration", String(dur)], {
        windowsHide: false,
    });

    let stdout = "";
    let stderr = "";

    // Collect scanner output
    py.stdout.on('data', (chunk) => {
        const text = chunk.toString();      // convert the buffer to readable text
        stdout += text;                     // accumulate all chunks
        //console.log('[PYTHON STDOUT]', text); // <-- print each chunk as it arrives
    });

    py.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        //console.error('[PYTHON STDERR]', text); // show errors if any
    });
    // Safety timeout (dur + 3s)
    const killTimer = setTimeout(() => {
        try { py.kill("SIGKILL"); } catch { }
    }, (dur + 3) * 1000);

    py.on("close", (code) => {
        clearTimeout(killTimer);

        // Try to parse JSON from the scanner
        let body;
        try {
            body = JSON.parse(stdout || "[]");
        } catch (e) {
            return res.status(500).json({
                error: "Invalid JSON from scanner",
                detail: e.message,
                stdout,
                stderr,
                exitCode: code,
            });
        }

        // If the scanner returned an {error: "..."} payload, forward as 502
        if (body && !Array.isArray(body) && body.error) {
            return res.status(502).json({ error: body.error, stderr, exitCode: code });
        }

        res.setHeader("Cache-Control", "no-store");
        return res.json({
            duration: dur,
            count: Array.isArray(body) ? body.length : 0,
            devices: Array.isArray(body) ? body : [],
        });
    });
});

// /scan_networks
const wifi = require("node-wifi");
wifi.init({ iface: null }); // Auto-detect

server.get("/scan_networks", async (req, res) => {
    log.section('/scan_networks');
    try {
        const networks = await wifi.scan();
        res.json(networks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// /teapot (418)
server.get('/teapot', (req, res) => {
    log.section('/teapot');
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

// ----------------- Remaining server start ----------------------------------
const PORT = process.env.PORT || 8080;   // keep 8080 like your old static server
server.listen(PORT, () => {
    log.section('Server Initialized and listening...');
    log.ok(`Server listening on http://localhost:${PORT}`);
});

module.exports = server;
