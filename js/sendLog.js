// sendLog.js
console.log("***sendLog.js called");

// ── tiny DOM-ready helper
function onReady(fn) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
        fn();
    }
}

// ── global logger (kept global on purpose)
window.sendLog = function sendLog(msg) {
    try {
        // NOTE: change to "/log" if your server route is /log
        fetch(`/clientlog?msg=${encodeURIComponent(msg)}`).catch(() => { });
    } catch {
        console.log("[sendLog fallback]", msg);
    }
};

// ── early, non-DOM work is safe here
const pageName = window.location.pathname.split("/").pop() || "index.html";
try {
    if (document.currentScript?.src) {
        const parts = document.currentScript.src.split("/");
     //   sendLog(`[${pageName}]: running ${parts.pop()}`);
    } else {
        sendLog(`page ${pageName}: running no script`);
    }
} catch { /* ignore */ }

// ── everything that touches the DOM goes here
onReady(() => {
    // Hidden error log container
    let hiddenLog = document.getElementById("hiddenErrorLog");
    if (!hiddenLog) {
        hiddenLog = document.createElement("div");
        hiddenLog.id = "hiddenErrorLog";
        hiddenLog.style.display = "none";
        // body is guaranteed to exist now
        document.body.appendChild(hiddenLog);
    }

    // Global error handler (suppress extension noise)
    window.onerror = function (message, source, lineno, colno) {
        const isExtension =
            source && (source.startsWith("chrome-extension://") ||
                source.startsWith("edge-extension://"));

        if (isExtension) {
            const entry = document.createElement("pre");
            entry.textContent = `[EXT ERROR] ${message} at ${source}:${lineno}:${colno}`;
            hiddenLog.appendChild(entry);
            return true; // suppress in console
        }

        console.error("App Error:", message, "at", source, ":", lineno, colno);
        const errBox = document.createElement("pre");
        errBox.style.color = "red";
        errBox.textContent = `Error: ${message}\nSource: ${source}\nLine: ${lineno}, Col: ${colno}`;
        document.body.appendChild(errBox);
    };
});
// ------------------------------------------------------
// Auto logger for current page
// ------------------------------------------------------
window.startPageLog = function startPageLog() {
    // Determine current HTML page name
    const pageName = window.location.pathname.split("/").pop() || "index.html";

    // Wait until sendLog() is available and then call it
    if (typeof window.sendLog === "function") {
        window.sendLog(`Starting ${pageName}`);
    } else {
        const retry = setInterval(() => {
            if (typeof window.sendLog === "function") {
                clearInterval(retry);
                window.sendLog(`Starting ${pageName}`);
            }
        }, 50);
    }
};
