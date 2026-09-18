// FREE HTML/Canvas renderer — Product DNA + Scene JSON -> PNG/JPG. Zero AI calls.
// Product pixels are immutable source artwork: contain-fit only, never
// mirrored, recolored, stretched or deformed. Clearly labeled FREE HTML RENDER.
const RATIO_DIMS = {
  '1:1': [1080, 1080], '16:9': [1280, 720], '9:16': [720, 1280],
  '4:5': [1080, 1350], '3:4': [1080, 1440], '4:3': [1280, 960]
};
const BG_PRESETS = {
  'dark-studio': { type: 'gradient', from: '#161d29', to: '#05070b', dir: 'v' },
  'oem-white': { type: 'gradient', from: '#ffffff', to: '#e9edf1', dir: 'v' },
  'warm-gray': { type: 'gradient', from: '#2a2d33', to: '#101216', dir: 'v' },
  navy: { type: 'gradient', from: '#16233d', to: '#070b14', dir: 'v' },
  solid: { type: 'solid', color: '#0b0e13' }
};
const LAYOUT_PRESETS = {
  'product-hero': { product: { x: 0.5, y: 0.56, scale: 0.72 }, bg: 'dark-studio', rim: { color: '#ffd76a', opacity: 0.22 } },
  'product-center': { product: { x: 0.5, y: 0.5, scale: 0.6 }, bg: 'dark-studio', rim: { color: '#4aa3ff', opacity: 0.18 } },
  'product-left': { product: { x: 0.32, y: 0.55, scale: 0.55 }, bg: 'dark-studio', rim: { color: '#ffd76a', opacity: 0.2 } },
  'product-right': { product: { x: 0.68, y: 0.55, scale: 0.55 }, bg: 'dark-studio', rim: { color: '#4aa3ff', opacity: 0.2 } },
  catalog: { product: { x: 0.5, y: 0.5, scale: 0.62 }, bg: 'oem-white', rim: null },
  marketplace: { product: { x: 0.36, y: 0.5, scale: 0.55 }, bg: 'oem-white', rim: null },
  social: { product: { x: 0.5, y: 0.58, scale: 0.8 }, bg: 'navy', rim: { color: '#ff9f43', opacity: 0.25 } },
  'storyboard-keyframe': { product: { x: 0.5, y: 0.5, scale: 0.66 }, bg: 'dark-studio', rim: { color: '#ffd76a', opacity: 0.2 } },
  'minimal-oem': { product: { x: 0.5, y: 0.46, scale: 0.5 }, bg: 'oem-white', rim: null }
};
const PRESET_LABELS = {
  'product-hero': 'Hero', 'product-center': 'Center', 'product-left': 'Left', 'product-right': 'Right',
  catalog: 'Catalog', marketplace: 'Marketplace', social: 'Social', 'storyboard-keyframe': 'Keyframe', 'minimal-oem': 'Minimal OEM'
};

function defaultScene(product, refs) {
  return {
    canvas: { ratio: '1:1', width: 1080, height: 1080 },
    background: { type: 'gradient', preset: 'dark-studio' },
    product: { source: (refs && refs[0] && refs[0].url) || '', x: 0.5, y: 0.56, scale: 0.72, rotation: 0 },
    lighting: { rimColor: '#ffd76a', rimOpacity: 0.22 },
    textSafeArea: { top: 120, bottom: 120 },
    text: []
  };
}
function applyPreset(key, scene) {
  const p = LAYOUT_PRESETS[key] || LAYOUT_PRESETS['product-hero'];
  const s = JSON.parse(JSON.stringify(scene || {}));
  s.background = { type: 'gradient', preset: p.bg };
  s.product = { ...(s.product || {}), x: p.product.x, y: p.product.y, scale: p.product.scale, rotation: 0 };
  s.lighting = p.rim ? { rimColor: p.rim.color, rimOpacity: p.rim.opacity } : { rimColor: '#000000', rimOpacity: 0 };
  s.preset = key;
  return s;
}
// Pure layout math (node-testable): returns absolute draw ops, no DOM.
function computeLayout(scene) {
  scene = scene || {};
  scene.canvas = scene.canvas || { width: 1080, height: 1080 };
  scene.product = scene.product || {};
  scene.lighting = scene.lighting || {};
  scene.textSafeArea = scene.textSafeArea || { top: 0, bottom: 0 };
  const W = scene.canvas.width, H = scene.canvas.height;
  const box = Math.min(W, H) * (scene.product.scale || 0.7);
  return {
    W, H,
    bg: scene.background,
    productBox: { cx: scene.product.x * W, cy: scene.product.y * H, size: box, rotation: scene.product.rotation || 0 },
    rim: scene.lighting,
    safe: { top: scene.textSafeArea.top || 0, bottom: H - (scene.textSafeArea.bottom || 0) },
    texts: scene.text || []
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.__imgRenderer = globalThis.__imgRenderer || { RATIO_DIMS, BG_PRESETS, LAYOUT_PRESETS, defaultScene, applyPreset, computeLayout };
}

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('โหลดภาพอ้างอิงไม่สำเร็จ'));
    im.src = url;
  });
}
function paintBackground(ctx, L) {
  const { W, H, bg } = L;
  const preset = (bg && bg.preset && BG_PRESETS[bg.preset]) || BG_PRESETS['dark-studio'];
  if (preset.type === 'solid' || bg.type === 'solid') {
    ctx.fillStyle = (bg && bg.color) || preset.color || '#0b0e13';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const g = preset.dir === 'h' ? ctx.createLinearGradient(0, 0, W, 0) : ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, preset.from);
  g.addColorStop(1, preset.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function paintRim(ctx, L) {
  const op = Number((L.rim && L.rim.rimOpacity) ?? 0);
  if (!op) return;
  const color = (L.rim && L.rim.rimColor) || '#ffd76a';
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.max(0, Math.min(0.6, op));
  const g = ctx.createRadialGradient(L.W * 0.5, L.H * 0.42, 10, L.W * 0.5, L.H * 0.42, Math.max(L.W, L.H) * 0.75);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.restore();
}
function paintGuides(ctx, L) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,215,106,.55)';
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, L.safe.top); ctx.lineTo(L.W, L.safe.top); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, L.safe.bottom); ctx.lineTo(L.W, L.safe.bottom); ctx.stroke();
  ctx.restore();
}
async function renderSceneToCanvas(canvas, scene, opts = {}) {
  const L = computeLayout(scene);
  canvas.width = L.W;
  canvas.height = L.H;
  const ctx = canvas.getContext('2d');
  paintBackground(ctx, L);
  const src = scene.product && scene.product.source;
  if (src) {
    const im = await loadImageEl(src);
    const nat = Math.min(im.naturalWidth, im.naturalHeight) || 1;
    const scale = L.productBox.size / nat;
    const dw = im.naturalWidth * scale, dh = im.naturalHeight * scale;
    ctx.save();
    ctx.translate(L.productBox.cx, L.productBox.cy);
    ctx.rotate(((L.productBox.rotation || 0) * Math.PI) / 180);
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = Math.round(L.W * 0.03);
    ctx.shadowOffsetY = Math.round(L.H * 0.012);
    ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh); // contain-fit, uniform scale: no stretch, no mirror
    ctx.restore();
  }
  paintRim(ctx, L);
  for (const t of L.texts) {
    ctx.save();
    ctx.fillStyle = t.color || '#ffffff';
    ctx.font = `700 ${t.size || 48}px Inter, system-ui, sans-serif`;
    ctx.textAlign = t.align || 'center';
    ctx.fillText(t.str || '', (t.x || 0.5) * L.W, (t.y || 0.1) * L.H);
    ctx.restore();
  }
  if (opts.guides !== false) paintGuides(ctx, L);
  return L;
}
function canvasDownload(canvas, name, type) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL(type === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
  a.download = name;
  a.click();
}

// ---------- FREE panel (lives beside AI canvas; never calls AI image APIs) ----------
function freeRefs() {
  const sc = (typeof curScene === 'function' ? curScene() : null) || {};
  const b = (window._img || {}).board;
  const out = [];
  const push = u => { u = String(u || '').trim(); if (u && !out.includes(u)) out.push(u); };
  try {
    const p = (window.current || {});
    push(p['Main Image URL']);
    String(p['Additional Images'] || '').split(';').forEach(push);
  } catch {}
  return out.slice(0, 6).map(u => (typeof imageUrl === 'function' ? imageUrl(u) : u));
}
function freeScene() {
  if (!window._free) {
    const p = window.current || {};
    window._free = defaultScene(p, freeRefs().map(u => ({ url: u })));
    window._free.preset = 'product-hero';
  }
  return window._free;
}
function showFreePanel() {
  const host = $('canvasHost');
  if (!host) return;
  let el = $('freePanel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'freePanel';
    host.after(el);
  }
  const s = freeScene();
  const dims = RATIO_DIMS[s.canvas.ratio] || RATIO_DIMS['1:1'];
  el.innerHTML = `<div class="box" style="margin-top:10px;border-color:#2f6b4a"><div class="box-title"><h3>🖌 FREE HTML RENDER <small style="opacity:.6">Canvas only · no AI · no billing</small></h3></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
    <select id="freeRatio" aria-label="ratio" style="min-height:38px;background:#121720;color:#fff;border:1px solid #303744;border-radius:9px">${Object.keys(RATIO_DIMS).map(r => `<option${s.canvas.ratio === r ? ' selected' : ''}>${r}</option>`).join('')}</select>
    <select id="freePreset" aria-label="preset" style="min-height:38px;background:#121720;color:#fff;border:1px solid #303744;border-radius:9px">${Object.keys(LAYOUT_PRESETS).map(k => `<option value="${k}"${(s.preset || 'product-hero') === k ? ' selected' : ''}>${PRESET_LABELS[k] || k}</option>`).join('')}</select>
    <label style="font-size:12px">scale <input id="freeScale" type="range" min="30" max="100" value="${Math.round((s.product.scale || 0.7) * 100)}" style="width:110px;vertical-align:middle"></label>
    <button class="secondary" onclick="freePreview()">Preview</button>
    <button class="secondary" onclick="freeAiCompose(this)">AI Compose Layout</button>
  </div>
  <div style="display:grid;place-items:center;background:#05070b;border-radius:12px;padding:14px"><canvas id="freeCanvas" width="${dims[0]}" height="${dims[1]}" style="max-width:100%;border-radius:10px;border:1px solid #303846"></canvas></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
    <button class="secondary" onclick="freeExport('png',this)">Download PNG</button>
    <button class="secondary" onclick="freeExport('jpg',this)">Download JPG</button>
    <button class="secondary" onclick="freeAttach(this)">Attach to scene</button>
  </div><div id="freeMsg" style="font-size:12px;margin-top:6px"></div></div>`;
  freePreview();
}
function freeCollect() {
  const s = freeScene();
  const r = ($('freeRatio') || {}).value || s.canvas.ratio;
  const dims = RATIO_DIMS[r] || RATIO_DIMS['1:1'];
  s.canvas = { ratio: r, width: dims[0], height: dims[1] };
  const pk = ($('freePreset') || {}).value || s.preset || 'product-hero';
  const base = { ...s, product: { ...s.product } };
  delete base.preset;
  const out = applyPreset(pk, base);
  out.product.scale = (Number(($('freeScale') || {}).value) || 70) / 100;
  window._free = out;
  return out;
}
async function freePreview() {
  try {
    const s = freeCollect();
    await renderSceneToCanvas($('freeCanvas'), s, { guides: true });
  } catch (e) { const m = $('freeMsg'); if (m) m.textContent = e.message || ''; }
}
function freeExport(fmt, btn) {
  try {
    const s = freeCollect();
    const cv = $('freeCanvas');
    renderSceneToCanvas(cv, s, { guides: false }).then(() => {
      canvasDownload(cv, `free-${s.canvas.ratio.replace(':', 'x')}.${fmt}`, fmt);
      renderSceneToCanvas(cv, s, { guides: true });
    }).catch(e => showToast(e.message || '', false));
  } catch (e) { showToast(e.message || '', false); }
}
async function freeAiCompose(btn) {
  const m = $('freeMsg');
  try {
    if (btn) btn.disabled = true;
    if (m) m.textContent = 'AI กำลังจัด layout (text model, ไม่ใช่ image model)...';
    const p = window.current || {};
    const sc = (typeof curScene === 'function' ? curScene() : null) || {};
    const r = await fetch('/api/canvas-director', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_code: p['Product Code'] || '', scene: { purpose: sc.purpose || '', shot: sc.shot || '' }, W: 1080, H: 1080 }) }).then(r => r.json());
    if (r.error) throw new Error(r.error);
    const cur = freeScene();
    const next = { ...cur, ...(r.scene || {}) };
    next.canvas = cur.canvas;
    window._free = next;
    showFreePanel();
    if (m) m.textContent = '';
  } catch (e) { if (m) m.textContent = e.message || ''; }
  finally { if (btn) btn.disabled = false; }
}
async function freeAttach(btn) {
  try {
    if (btn) btn.disabled = true;
    const s = freeCollect();
    const cv = document.createElement('canvas');
    await renderSceneToCanvas(cv, s, { guides: false });
    const dataUrl = cv.toDataURL('image/png');
    const sc = (typeof curScene === 'function' ? curScene() : null) || {};
    const r = await fetch('/api/canvas-asset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene_db_id: sc.id || 0, dataUrl, sceneJson: s, aspect: s.canvas.ratio }) }).then(r => r.json());
    if (r.error) throw new Error(r.error);
    showToast(`แนบกับ ${r.scene} v${r.version} ✓`);
    if (typeof openBoard === 'function' && window._img && window._img.boardId) openBoard(window._img.boardId);
  } catch (e) { showToast(e.message || '', false); }
  finally { if (btn) btn.disabled = false; }
}
