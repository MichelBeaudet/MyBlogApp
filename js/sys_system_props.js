// sys_system_props.js

const output = document.getElementById('output');
const statusEl = document.getElementById('status');
const refreshBtn = document.getElementById('refreshBtn');
const saveBtn = document.getElementById('saveBtn');
const run_collect_system_prop = document.getElementById('run_collect_system_prop'); 

// Get the current script file name
const currentScript = document.currentScript;
const parts = currentScript.src.split("/");
sendLog("*** Running script system_props.js:", parts.pop());

async function loadLive() {
    setStatus('Fetching /collect_system_prop …');
    try {
        console.log("*** await fetch(/collect_system_props", parts.pop());

        const res = await fetch('/collect_system_props', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log("*** fetch ok, data:", data);
        output.textContent = JSON.stringify(data, null, 2);
        setStatus(`Live snapshot at ${new Date().toLocaleString()}`);
    } catch (err) {
        output.textContent = `Error: ${err.message}`;
        setStatus('Error');
    }
}
function setStatus(msg) {
    statusEl.textContent = msg;
}
// Download whatever is currently displayed as a file
function downloadCurrent() {
    try {
        const blob = new Blob([output.textContent || '{}'], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `system_props-${ts}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        setStatus('Download failed: ' + e.message);
    }
}

// Wire up buttons
//refreshBtn.addEventListener('click', loadLive);
//saveBtn.addEventListener('click', downloadCurrent);
//run_systemParams.addEventListener('click', "<h1>i am here to run it!!!</h1>");

// Initial load
loadLive();
console.log("*** End of system_props.js");
