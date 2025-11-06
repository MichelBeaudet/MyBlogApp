// Serve via http://localhost — not file://
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

// === Import-map is defined in HTML so internal 'three' in example modules resolves ===

const el = id => document.getElementById(id);
const ui = {
    // existing inputs (unchanged IDs)
    wordA: el('wordA'), wordB: el('wordB'), angle: el('angle'),
    stroke: el('stroke'), fontFile: el('fontFile'), fontSize: el('fontSize'),
    voxX: el('voxX'), voxY: el('voxY'), voxZ: el('voxZ'),
    mmPerVoxel: el('mmPerVoxel'), imgW: el('imgW'), imgH: el('imgH'),
    btnGenerate: el('btnGenerate'), btnExport: el('btnExport'),
    btnExportBin: el('btnExportBin'), btnReset: el('btnReset'),
    progress: el('progress'),
    // new controls
    btnStop: el('btnStop'), preset30: el('preset30'), preset45: el('preset45'), preset60: el('preset60'),
    qDraft: el('qDraft'), qNormal: el('qNormal'), qHigh: el('qHigh'),
    btnCenter: el('btnCenter'), btnGrid: el('btnGrid'), btnAxes: el('btnAxes'),
    btnWire: el('btnWire'), btnAutorotate: el('btnAutorotate'),
    statsDims: el('statsDims'), statsVox: el('statsVox'), statsTime: el('statsTime')
};
const setProgress = (msg) => { ui.progress.textContent = msg; };

// --- Three.js scene ---
const container = document.getElementById('viewer');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 5000);
camera.position.set(200, 160, 220);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0x99bbff, 0x223344, 0.45);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(200, 240, 140); scene.add(dir);

const ground = new THREE.GridHelper(1200, 60, 0x335, 0x224);
ground.visible = false; scene.add(ground);
const axes = new THREE.AxesHelper(100); axes.visible = false; scene.add(axes);

let currentMesh = null;
let autorotate = false;
let wireframe = false;

function animate() {
    requestAnimationFrame(animate);
    if (autorotate && currentMesh) currentMesh.rotation.y += 0.004;
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
});

// --- Font loading ---
let loadedFontFamily = null;
async function loadUserFont(file, family = 'UserCursive') {
    const data = await file.arrayBuffer();
    const face = new FontFace(family, data); await face.load();
    document.fonts.add(face); await document.fonts.ready;
    return family;
}

// --- Text mask ---
function renderTextMask(text, w, h, { fontFamily, fontSize = 160, stroke = 3 }) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const fam = fontFamily ? `"${fontFamily}"` : `"Segoe Script","Brush Script MT","Comic Sans MS",sans-serif`;
    ctx.font = `${fontSize}px ${fam}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text); const x = (w - m.width) / 2; const y = (h + fontSize * 0.35) / 2;
    ctx.fillStyle = '#fff';
    const R = Math.max(0, stroke | 0);
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) if (dx * dx + dy * dy <= R * R) ctx.fillText(text, x + dx, y + dy);
    const img = ctx.getImageData(0, 0, w, h).data; const mask = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < img.length; i += 4, p++) mask[p] = img[i] > 128 ? 1 : 0;
    return { mask, imgW: w, imgH: h };
}

// --- Voxel generation (with cancel token) ---
let cancelToken = { cancelled: false };
function setCancellable(on) { ui.btnStop.disabled = !on; cancelToken.cancelled = false; }
function cancel() { cancelToken.cancelled = true; setProgress('Cancelled'); }

function generateVoxels(maskA, maskB, { VX, VY, VZ, angleDeg }) {
    const cos = Math.cos(angleDeg * Math.PI / 180), sin = Math.sin(angleDeg * Math.PI / 180);
    const vox = new Uint8Array(VX * VY * VZ);
    const lin = (v, lo, hi, Lo, Hi) => Lo + (v - lo) / (hi - lo) * (Hi - Lo);
    const idx = (i, j, k) => (i * VY + j) * VZ + k;
    const mA = maskA.mask, W_A = maskA.imgW, H_A = maskA.imgH;
    const mB = maskB.mask, W_B = maskB.imgW, H_B = maskB.imgH;
    const A = (Y, Z) => { const u = Math.round(lin(Y, -1, 1, 0, W_A - 1)), v = Math.round(lin(Z, -1, 1, H_A - 1, 0)); return (u >= 0 && u < W_A && v >= 0 && v < H_A) ? mA[v * W_A + u] : 0; };
    const B = (X, Y, Z) => { const Xc = 2 * X - 1, h = sin * Xc + cos * Y; const u = Math.round(lin(h, -1.5, 1.5, 0, W_B - 1)), v = Math.round(lin(Z, -1, 1, H_B - 1, 0)); return (u >= 0 && u < W_B && v >= 0 && v < H_B) ? mB[v * W_B + u] : 0; };

    for (let i = 0; i < VX; i++) {
        const X = VX === 1 ? 0 : i / (VX - 1);
        for (let j = 0; j < VY; j++) {
            const Y = (j / (VY - 1)) * 2 - 1;
            for (let k = 0; k < VZ; k++) {
                if (cancelToken.cancelled) return null;
                const Z = (k / (VZ - 1)) * 2 - 1;
                if (A(Y, Z) && B(X, Y, Z)) vox[idx(i, j, k)] = 1;
            }
        }
        if ((i & 3) === 0) setProgress(`Voxelizing ${Math.round((i + 1) / VX * 100)}%`);
    }
    return vox;
}

// --- Mesh builder ---
function voxelsToGeometry(vox, VX, VY, VZ, mm) {
    const pos = [], nor = [];
    const has = (i, j, k) => i >= 0 && i < VX && j >= 0 && j < VY && k >= 0 && k < VZ ? vox[(i * VY + j) * VZ + k] : 0;
    const V = (i, j, k) => [i * mm, j * mm, k * mm];
    const push = (p, n) => { const t = [0, 1, 2, 0, 2, 3]; for (const tt of t) { const q = p[tt]; pos.push(...q); nor.push(...n); } };
    for (let i = 0; i < VX; i++)for (let j = 0; j < VY; j++)for (let k = 0; k < VZ; k++) {
        if (!has(i, j, k)) continue;
        if (!has(i - 1, j, k)) push([V(i, j, k), V(i, j + 1, k), V(i, j + 1, k + 1), V(i, j, k + 1)], [-1, 0, 0]);
        if (!has(i + 1, j, k)) push([V(i + 1, j, k), V(i + 1, j, k + 1), V(i + 1, j + 1, k + 1), V(i + 1, j + 1, k)], [1, 0, 0]);
        if (!has(i, j - 1, k)) push([V(i, j, k), V(i, j, k + 1), V(i + 1, j, k + 1), V(i + 1, j, k)], [0, -1, 0]);
        if (!has(i, j + 1, k)) push([V(i, j + 1, k), V(i + 1, j + 1, k), V(i + 1, j + 1, k + 1), V(i, j + 1, k + 1)], [0, 1, 0]);
        if (!has(i, j, k - 1)) push([V(i, j, k), V(i + 1, j, k), V(i + 1, j + 1, k), V(i, j + 1, k)], [0, 0, -1]);
        if (!has(i, j, k + 1)) push([V(i, j, k + 1), V(i, j + 1, k + 1), V(i + 1, j + 1, k + 1), V(i + 1, j, k + 1)], [0, 0, 1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(nor), 3));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
}

// --- Export helpers ---
function exportSTLAscii(mesh, name) {
    const stl = new STLExporter().parse(mesh, { binary: false });
    const blob = new Blob([stl], { type: 'model/stl' });
    const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(blob); a.click(); URL.revokeObjectURL(a.href);
}
function exportSTLBinary(mesh, name) {
    const stl = new STLExporter().parse(mesh, { binary: true });
    const blob = new Blob([stl], { type: 'application/octet-stream' });
    const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(blob); a.click(); URL.revokeObjectURL(a.href);
}

// --- Generate ---
async function generate() {
    const A = ui.wordA.value || 'A', B = ui.wordB.value || 'B';
    const angle = +ui.angle.value || 45, stroke = +ui.stroke.value || 3, fontSize = +ui.fontSize.value || 160;
    const VX = +ui.voxX.value, VY = +ui.voxY.value, VZ = +ui.voxZ.value, mm = +ui.mmPerVoxel.value;
    const W = +ui.imgW.value, H = +ui.imgH.value;

    // quick perf estimate/guardrail
    const voxCount = VX * VY * VZ;
    ui.statsVox.textContent = `Voxels: ${voxCount.toLocaleString()}`;
    if (voxCount > 18_000_000) { setProgress('Grid too large. Reduce dimensions or use Draft preset.'); return; }

    if (ui.fontFile.files[0]) { setProgress('Loading font…'); loadedFontFamily = await loadUserFont(ui.fontFile.files[0]); }
    setCancellable(true);
    const t0 = performance.now();

    setProgress('Rendering text masks…');
    const maskA = renderTextMask(A, W, H, { fontFamily: loadedFontFamily, fontSize, stroke });
    const maskB = renderTextMask(B, W, H, { fontFamily: loadedFontFamily, fontSize, stroke });

    setProgress('Voxelizing…');
    const vox = generateVoxels(maskA, maskB, { VX, VY, VZ, angleDeg: angle });
    if (!vox) { setCancellable(false); return; }

    setProgress('Building mesh…');
    const geo = voxelsToGeometry(vox, VX, VY, VZ, mm);
    const mat = new THREE.MeshStandardMaterial({ color: 0xcfd8ff, metalness: 0.05, roughness: 0.55, wireframe });
    const mesh = new THREE.Mesh(geo, mat);
    if (currentMesh) scene.remove(currentMesh);
    currentMesh = mesh; scene.add(mesh);

    // center & frame
    geo.computeBoundingBox(); const bb = geo.boundingBox;
    const size = new THREE.Vector3(); bb.getSize(size);
    const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
    mesh.position.set(-cx, -cy, -cz);
    camera.position.set(Math.max(size.x, size.y, size.z) * 1.4, Math.max(size.x, size.y, size.z) * 1.0, Math.max(size.x, size.y, size.z) * 1.6);
    controls.target.set(0, 0, 0); controls.update();

    const t1 = performance.now();
    ui.statsDims.textContent = `Size: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;
    ui.statsTime.textContent = `Time: ${(t1 - t0).toFixed(0)} ms`;
    ui.btnExport.disabled = false; ui.btnExportBin.disabled = false;
    setCancellable(false);
    setProgress('Done');
}

// === Buttons & UI wiring ===
ui.btnGenerate.onclick = async () => {
    try {
        ui.btnGenerate.disabled = true; setProgress('Starting…');
        await generate();
    } catch (e) { console.error(e); setProgress('Error — see console'); }
    finally { ui.btnGenerate.disabled = false; }
};
ui.btnStop.onclick = () => { cancel(); ui.btnStop.disabled = true; };

ui.btnExport.onclick = () => {
    if (!currentMesh) return;
    const name = `${ui.wordA.value}_${ui.wordB.value}_${ui.angle.value}deg_voxel_ascii.stl`;
    exportSTLAscii(currentMesh, name);
};
ui.btnExportBin.onclick = () => {
    if (!currentMesh) return;
    const name = `${ui.wordA.value}_${ui.wordB.value}_${ui.angle.value}deg_voxel_bin.stl`;
    exportSTLBinary(currentMesh, name);
};

ui.btnReset.onclick = () => { controls.target.set(0, 0, 0); camera.position.set(200, 160, 220); controls.update(); setProgress('View reset.'); };
ui.btnCenter.onclick = () => { controls.target.set(0, 0, 0); controls.update(); };
ui.btnGrid.onclick = () => { ground.visible = !ground.visible; };
ui.btnAxes.onclick = () => { axes.visible = !axes.visible; };
ui.btnWire.onclick = () => {
    wireframe = !wireframe;
    if (currentMesh) currentMesh.material.wireframe = wireframe;
};
ui.btnAutorotate.onclick = () => { autorotate = !autorotate; };

// angle presets
ui.preset30.onclick = () => ui.angle.value = 30;
ui.preset45.onclick = () => ui.angle.value = 45;
ui.preset60.onclick = () => ui.angle.value = 60;

// quality presets
ui.qDraft.onclick = () => { ui.imgW.value = 384; ui.imgH.value = 192; ui.voxY.value = 160; ui.voxZ.value = 80; };
ui.qNormal.onclick = () => { ui.imgW.value = 512; ui.imgH.value = 256; ui.voxY.value = 192; ui.voxZ.value = 96; };
ui.qHigh.onclick = () => { ui.imgW.value = 768; ui.imgH.value = 384; ui.voxY.value = 256; ui.voxZ.value = 128; };
