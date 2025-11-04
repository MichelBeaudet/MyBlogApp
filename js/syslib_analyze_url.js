// js/syslib_analyze_url.js
// ----------------------------------------------------------------------------
// Pure-Node URL analyzer with SSE progress and ZERO DOM dependencies.
// - Uses Node 18+ global fetch
// - FULL HTML returned (no size cap; add cap easily if needed)
// - HTML parsed with lightweight regex/string scans (good enough for audits)
// - No jsdom, no DOMParser
//
// Exports:
//   - analyzeUrl(url, options?) -> Promise<Result>
//   - analyzeUrlStream(url, options?) -> AsyncGenerator<ProgressEvent>
//
// Result:
// {
//   ok: true,
//   source: 'node',
//   url, status, headers, html,
//   checks: { ... },
//   score, grade,
//   issues: [ { id, severity, title, recommendation } ]
// }
//
// Progress events (for SSE):
//   { type: 'start', url }
//   { type: 'fetch_start', url, contentLength? }
//   { type: 'fetch_progress', receivedBytes, contentLength? }
//   { type: 'fetch_done', status, receivedBytes }
//   { type: 'parse_start' }
//   { type: 'parse_done' }
//   { type: 'scoring_done', score, grade }
//   { type: 'done', result }
//
// Limitations (by design, to avoid DOM libs):
//   - Regex scans may miss edge-case HTML (broken markup, exotic quoting).
//   - That said, they cover the vast majority of practical pages.
// ----------------------------------------------------------------------------
const { mkLogger } = require('./mkLogger.js'); // your custom logger if present
log = mkLogger(__filename);

log.ok('inside syslib_analyze_url module ');
const { setTimeout: nodeSetTimeout, clearTimeout: nodeClearTimeout } = require('timers');

// ------------------------------- Utilities -----------------------------------

/** Lower-case all header keys for consistent access. */
function lowerHeaders(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) out[String(k).toLowerCase()] = v;
    return out;
}

/** Validate and normalize URL (http/https only). Throws on error. */
function normalizeHttpUrl(raw) {
    let u;
    try { u = new URL(String(raw || '').trim()); }
    catch (e) { const err = new Error('Invalid URL'); err.code = 'invalid_url'; throw err; }
    if (!/^https?:$/.test(u.protocol)) { const err = new Error('Only http/https URLs are allowed'); err.code = 'invalid_scheme'; throw err; }
    return u.toString();
}

/** Map numeric score to a grade. */
function gradeFromScore(s) {
    if (s >= 90) return 'A';
    if (s >= 80) return 'B';
    if (s >= 70) return 'C';
    if (s >= 60) return 'D';
    return 'F';
}

/** Extract attribute values from HTML for given tag(s) and attribute(s) using regex. */
function* scanAttributes(html, tags, attrs) {
    // Matches: <tag ... attr="value" ...>  (single or double quotes)
    // We keep it simple & robust: case-insensitive, non-greedy.
    const tagPattern = new RegExp(`<\\s*(?:${tags.join('|')})\\b[^>]*>`, 'gi');
    let tagMatch;
    while ((tagMatch = tagPattern.exec(html)) !== null) {
        const chunk = tagMatch[0];
        for (const attr of attrs) {
            const attrRe = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
            const m = chunk.match(attrRe);
            if (m) {
                const val = m[2] ?? m[3] ?? '';
                yield { tag: chunk, attr, value: val };
            }
        }
    }
}

/** Count elements like <script ...> and check attributes without DOM. */
function countScriptsAndSRI(html, baseUrl) {
    const scripts = [];
    const tagPattern = /<\s*script\b([^>]*)>/gi;
    let m;
    while ((m = tagPattern.exec(html)) !== null) {
        const attrs = m[1] || '';
        const srcM = attrs.match(/\bsrc\s*=\s*("([^"]+)"|'([^']+)')/i);
        const integrityM = attrs.match(/\bintegrity\s*=\s*("([^"]+)"|'([^']+)')/i);
        const src = srcM ? (srcM[2] ?? srcM[3] ?? '') : '';
        const hasIntegrity = !!integrityM;
        scripts.push({ src, hasIntegrity });
    }

    let scriptsCount = 0;
    let thirdParty = 0;
    let sriMissing = 0;

    const pageHost = new URL(baseUrl).host;

    for (const s of scripts) {
        if (!s.src) continue;
        scriptsCount++;
        let abs;
        try { abs = new URL(s.src, baseUrl); } catch { abs = null; }
        if (abs && abs.host && abs.host !== pageHost) thirdParty++;
        if (abs && (abs.protocol === 'http:' || abs.protocol === 'https:') && !s.hasIntegrity) {
            sriMissing++;
        }
    }
    return { scriptsCount, thirdParty, sriMissing };
}

/** Lightweight, DOM-free checks derived from headers + HTML string. */
function computeChecks(url, headers, html) {
    const checks = {};
    const targetUrl = new URL(url);
    const isHttps = targetUrl.protocol.toLowerCase() === 'https:';

    // Header presence
    checks.https = isHttps;
    checks.hsts = !!headers['strict-transport-security'];
    checks.csp = !!headers['content-security-policy'];
    checks.x_content_type_options = (headers['x-content-type-options'] || '').toLowerCase() === 'nosniff';
    checks.x_frame_options = !!headers['x-frame-options'];
    checks.referrer_policy = !!headers['referrer-policy'];
    checks.permissions_policy = !!(headers['permissions-policy'] || headers['feature-policy']);

    // Mixed content scan (only meaningful if page is HTTPS):
    // Look for http:// in common resource attributes: src, href, data, poster
    let mixed = false;
    if (isHttps) {
        const attrIter = scanAttributes(html, ['script', 'link', 'img', 'iframe', 'video', 'audio', 'source'], ['src', 'href', 'data', 'poster']);
        for (const a of attrIter) {
            if (typeof a.value === 'string' && a.value.toLowerCase().startsWith('http://')) {
                mixed = true;
                break;
            }
        }
    }
    checks.mixed_content = mixed;

    // Forms posting to absolute http:// actions
    let forms_ok = true;
    const formIter = scanAttributes(html, ['form'], ['action']);
    for (const a of formIter) {
        const action = (a.value || '').trim().toLowerCase();
        if (action.startsWith('http://')) { forms_ok = false; break; }
    }
    checks.forms_https = forms_ok;

    // Scripts: count, third-party, SRI
    const { scriptsCount, thirdParty, sriMissing } = countScriptsAndSRI(html, url);
    checks.scripts_count = scriptsCount;
    checks.third_party_scripts = thirdParty;
    checks.sri_missing = sriMissing;

    // Headers snapshot (handy for UI)
    checks.rawHeaders = {};
    ['server', 'content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy']
        .forEach(k => { if (headers[k]) checks.rawHeaders[k] = headers[k]; });

    return checks;
}

/** Compute score & issues from checks. */
function scoreAndIssues(checks) {
    const weights = { csp: 30, hsts: 15, https: 10, xfo: 8, xcto: 8, referrer: 4, perm: 5, mixed: 10, forms: 5, sri: 5 };
    let score = 0;
    score += (weights.https && checks.https) ? weights.https : 0;
    score += (weights.hsts && checks.hsts) ? weights.hsts : 0;
    score += (weights.xfo && checks.x_frame_options) ? weights.xfo : 0;
    score += (weights.xcto && checks.x_content_type_options) ? weights.xcto : 0;
    score += (weights.referrer && checks.referrer_policy) ? weights.referrer : 0;
    score += (weights.perm && checks.permissions_policy) ? weights.perm : 0;
    score += (weights.sri && checks.sri_missing === 0) ? weights.sri : 0;
    if (!checks.csp) score -= weights.csp;
    if (checks.mixed_content) score -= weights.mixed;
    if (!checks.forms_https) score -= weights.forms;
    score = Math.max(0, Math.min(100, score));
    const grade = gradeFromScore(score);

    const issues = [];
    if (!checks.csp) issues.push({ id: 'CSP_MISSING', severity: 'high', title: 'No Content-Security-Policy', recommendation: 'Add a strict CSP (script-src, object-src, base-uri, frame-ancestors).' });
    if (!checks.hsts && checks.https) issues.push({ id: 'HSTS_MISSING', severity: 'medium', title: 'No HSTS header', recommendation: 'Enable Strict-Transport-Security with a long max-age and preload if appropriate.' });
    if (checks.mixed_content) issues.push({ id: 'MIXED_CONTENT', severity: 'high', title: 'Mixed content', recommendation: 'Serve subresources only over HTTPS.' });
    if (!checks.forms_https) issues.push({ id: 'FORM_INSECURE', severity: 'medium', title: 'Form action over HTTP', recommendation: 'Use HTTPS endpoints or relative actions.' });
    if (checks.sri_missing) issues.push({ id: 'SRI_MISSING', severity: 'low', title: 'External scripts without SRI', recommendation: 'Add Subresource Integrity (integrity=) for CDN scripts.' });

    return { score, grade, issues };
}

// ----------------------------- Fetch engine ----------------------------------

/**
 * Fetch URL and stream HTML while reporting progress.
 * Returns { status, headers, html } with FULL html body.
 */
async function fetchWithProgress(url, options, onProgress) {
    const timeoutMs = Number.isFinite(options?.timeoutMs) ? options.timeoutMs : 20000;

    const controller = new AbortController();
    const to = nodeSetTimeout(() => controller.abort(), timeoutMs);

    try {
        const resp = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'user-agent': options?.userAgent || 'syslib-analyzer/1.0 (+local)',
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        const headersObj = {};
        resp.headers.forEach((v, k) => (headersObj[k.toLowerCase()] = v));
        const headers = lowerHeaders(headersObj);
        const status = resp.status;

        const reader = resp.body?.getReader?.();
        const chunks = [];
        let received = 0;
        const contentLength = Number(headers['content-length']) || undefined;

        if (typeof onProgress === 'function') onProgress({ type: 'fetch_start', url, contentLength });

        if (reader && typeof reader.read === 'function') {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.byteLength;
                if (typeof onProgress === 'function') onProgress({ type: 'fetch_progress', receivedBytes: received, contentLength });
            }
            if (typeof onProgress === 'function') onProgress({ type: 'fetch_done', status, receivedBytes: received });
            const html = new TextDecoder().decode(Buffer.concat(chunks));
            return { status, headers, html };
        } else {
            const html = await resp.text();
            const bytes = new TextEncoder().encode(html).byteLength;
            if (typeof onProgress === 'function') {
                onProgress({ type: 'fetch_progress', receivedBytes: bytes, contentLength });
                onProgress({ type: 'fetch_done', status, receivedBytes: bytes });
            }
            return { status, headers, html };
        }
    } finally {
        nodeClearTimeout(to);
    }
}

// ----------------------------- Public API ------------------------------------

async function analyzeUrl(rawUrl, options = {}) {
    const url = normalizeHttpUrl(rawUrl);
    const { status, headers, html } = await fetchWithProgress(url, options);
    const checks = computeChecks(url, headers, html);
    const { score, grade, issues } = scoreAndIssues(checks);
    return { ok: true, source: 'node', url, status, headers, html, checks, score, grade, issues };
}

// Replace ONLY this function in js/syslib_analyze_url.js

async function* analyzeUrlStream(rawUrl, options = {}) {
    const url = normalizeHttpUrl(rawUrl);

    // 1) Announce start
    yield { type: 'start', url };

    // 2) Fetch with progress, buffering events safely
    yield { type: 'fetch_start', url };

    // Define the queue BEFORE we pass the callback (important!)
    const events = [];

    const { status, headers, html } = await fetchWithProgress(
        url,
        options,
        (evt) => { if (evt) events.push(evt); }  // push into a defined queue
    );

    // Flush all fetch progress events (in order)
    for (const evt of events) yield evt;

    // 3) Parse + score
    yield { type: 'parse_start' };
    const checks = computeChecks(url, headers, html);
    yield { type: 'parse_done' };

    const { score, grade, issues } = scoreAndIssues(checks);
    yield { type: 'scoring_done', score, grade };

    // 4) Final result
    yield {
        type: 'done',
        result: {
            ok: true,
            source: 'node',
            url,
            status,
            headers,
            html,      // full HTML preserved
            checks,
            score,
            grade,
            issues
        }
    };
}




module.exports = {
    analyzeUrl,
    analyzeUrlStream,
    // for tests:
    lowerHeaders,
    normalizeHttpUrl
};
