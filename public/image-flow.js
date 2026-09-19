// Image + Flow — visual stage, capability-aware settings, queued generation, Flow pack.
let flowCaps = null;
async function getFlowCaps() {
  if (flowCaps) return flowCaps;
  flowCaps = await fetch('/api/flow-models').then(r => r.json());
  return flowCaps;
}
function curScene() {
  const b = (window._img || {}).board;
  if (!b) return null;
  return (b.scenes || []).find(s => s.id === window._img.sceneDbId) || b.scenes[0] || null;
}
async function renderCanvas() {
  try { await loadImgCaps(); } catch {}
  imgProvSel = ((window._img.settings || {}).provider) || imgProvSel || 'auto';
  const host = document.createElement('div');
  host.id = 'canvasHost';
  const old = $('canvasHost');
  const boardEl = $('boardDetail');
  if (boardEl) boardEl.appendChild(host);
  else return;
  if (old) old.remove();
  const sc = curScene();
  if (!sc) { host.innerHTML = ''; return; }
  const cur = (sc.generations || []).find(g => g.is_current) || {};
  let imgHtml = `<div class="preview-placeholder">ยังไม่มีภาพ<br><small>กด Generate เพื่อสร้างภาพแรกของฉากนี้</small></div>`;
  const curAsset = (cur.assets || [])[0];
  if (curAsset) imgHtml = `<img src="/api/image/asset/${curAsset.id}" alt="generated" style="max-width:100%;border-radius:12px;border:1px solid #303846">`;
  const st = (window._img.settings || {});
  host.innerHTML = `<div class="box" style="margin-top:10px"><div class="box-title"><h3>🎞 Canvas · ${esc(sc.scene_id)} <small style="opacity:.6">${scenesPos()}</small></h3><span id="canvasQa"></span></div>
  <div id="stageBox" style="text-align:center;background:#05070b;border-radius:12px;padding:14px;min-height:200px;display:grid;place-items:center">${imgHtml}</div>
  <div id="provRow" style="margin-top:10px"></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center">
    <select id="cvAspect" aria-label="สัดส่วน">${imgAspects().map(a => `<option${(st.aspect || '1:1') === a ? ' selected' : ''}>${a}</option>`).join('')}</select>
    <select id="cvQuality" aria-label="คุณภาพ">${imgQualities().map(q => `<option${(st.quality || 'Standard') === q ? ' selected' : ''}>${q}</option>`).join('')}</select>
    <select id="cvSize" aria-label="ขนาด">${(imgSizes().length?imgSizes():['auto']).map(s => `<option${Number(st.size || 1024) === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
    <button class="secondary" onclick="showFreePanel()">FREE HTML</button>
    <button class="generate" onclick="genSelected(this)">Generate</button>
    <button class="secondary" onclick="genAllScenes(this)">Generate ทั้งบอร์ด</button>
    <button class="secondary" onclick="dlCurrentImage(this)">Download</button>
  </div>
  <details style="margin-top:8px"><summary style="font-size:12px;opacity:.75">Advanced (model · provider · negative · capabilities)</summary><div id="advBox" style="font-size:12px;margin-top:6px">กำลังโหลด capabilities...</div></details>
  <div id="queueBox" style="margin-top:8px"></div></div>`;
  loadAdvBox();
  paintStageRatio();
  paintProvRow();
  if (typeof renderFlowPack === 'function') renderFlowPack();
}
function scenesPos() {
  const b = (window._img || {}).board;
  if (!b) return '';
  const i = (b.scenes || []).findIndex(s => s.id === window._img.sceneDbId);
  return i >= 0 ? `${String(i + 1).padStart(2, '0')} / ${String(b.scenes.length).padStart(2, '0')}` : '';
}
async function loadAdvBox() {
  const el = $('advBox');
  if (!el) return;
  try {
    const caps = await getFlowCaps();
    const st = await providerNote();
    el.innerHTML = `models: ${Object.keys(caps.models || {}).join(', ')}<br>provider: ${st}`;
  } catch { el.innerHTML = 'โหลด capabilities ไม่สำเร็จ'; }
}
let _provNote = '';
async function providerNote() {
  if (_provNote) return _provNote;
  try {
    const s = await fetch('/api/image/status').then(r => r.json());
    const demo = ((s || {}).providers || {}).pollinations || {};
    _provNote = `${demo.label || s.defaultProvider || 'demo'} — ${demo.usable === false ? 'NOT CONFIGURED' : 'พร้อม'}` + (demo.textOnly ? ' (text-only: refs เป็นข้อความ ไม่ใช่พิกเซล)' : '');
  } catch { _provNote = 'unreachable'; }
  return _provNote;
}
function paintProvRow() {
  const el = $('provRow');
  if (!el) return;
  const ps = (imgCapsCache && imgCapsCache.providers) || {};
  const demo = ps.pollinations || {};
  const ref = ps['openrouter-image'] || {};
  if (imgProvSel !== 'demo' && imgProvSel !== 'openrouter-image') imgProvSel = 'demo';
  const refOff = !(ref.paidEnabled && ref.configured);
  const opts = `<option value="demo"${imgProvSel === 'demo' ? ' selected' : ''}>FREE DEMO — no charge, text only</option>`
    + `<option value="openrouter-image"${imgProvSel === 'openrouter-image' ? ' selected' : ''}${refOff ? ' disabled' : ''}>REFERENCE AI ~$0.04/image${refOff ? ' (OFF)' : ''}</option>`;
  el.innerHTML = `<div style="border:1px solid #2b3441;border-radius:10px;padding:8px 10px;margin-bottom:2px">`
    + `<div style="font-size:11px;opacity:.7;margin-bottom:6px">IMAGE ENGINE (paid calls need explicit selection + server opt-in; charges may vary by provider/model)</div>`
    + `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><select id="cvProv" aria-label="provider" style="min-height:38px;background:#121720;color:#fff;border:1px solid #303744;border-radius:9px" onchange="imgProvSel=this.value;persistImgSettings();renderCanvas();">${opts}</select>${imgProvBadge()}</div></div>`;
  const q = $('cvQuality'), z = $('cvSize');
  if (imgProvSel === 'openrouter-image') {
    if (q) { q.disabled = true; q.title = 'Provider native quality'; }
    if (z) { z.disabled = true; z.title = 'Provider native size'; }
  } else {
    if (q) q.disabled = false;
    if (z) z.disabled = false;
  }
}
function persistImgSettings() {
  try {
    const s = readSettings();
    window._img.settings = { ...(window._img.settings || {}), aspect: s.aspect, quality: s.quality, size: s.size, provider: s.provider };
  } catch {}
}
function paintStageRatio() {
  const a = ($('cvAspect') || {}).value || '1:1';
  const [w, h] = a.split(':').map(Number);
  const stage = document.querySelector('#stageBox img, #stageBox .preview-placeholder');
  const box = $('stageBox');
  if (box) box.style.aspectRatio = `${w || 1} / ${h || 1}`;
  const sel = $('cvAspect');
  if (sel && !sel._bound) { sel._bound = true; sel.addEventListener('change', paintStageRatio); }
}
let imgCapsCache = null, imgProvSel = 'demo';
async function loadImgCaps() {
  if (imgCapsCache) return imgCapsCache;
  imgCapsCache = await fetch('/api/image/status').then(r => r.json());
  return imgCapsCache;
}
function imgProvList() {
  const ps = (imgCapsCache && imgCapsCache.providers) || {};
  return Object.entries(ps).map(([k, v]) => ({ id: k === 'pollinations' ? 'demo' : 'auto', key: k, label: (v.label || k) + (v.paid ? ' (~$0.04/pic)' : ' (free)'), pixel: !v.textOnly, paid: !!v.paid, enabled: v.configured !== false }));
}
function imgAspects() {
  const ps = (imgCapsCache && imgCapsCache.providers) || {};
  const p = imgProvSel === 'demo' ? ps.pollinations : ps['openrouter-image'];
  return (p && p.caps && p.caps.aspectRatios) || ['1:1'];
}
function imgQualities() {
  const ps = (imgCapsCache && imgCapsCache.providers) || {};
  const p = imgProvSel === 'demo' ? ps.pollinations : ps['openrouter-image'];
  return (p && p.caps && p.caps.qualityModes) || ['Standard'];
}
function imgSizes() {
  const ps = (imgCapsCache && imgCapsCache.providers) || {};
  const p = imgProvSel === 'demo' ? ps.pollinations : ps['openrouter-image'];
  return (p && p.caps && p.caps.sizes) || [];
}
function imgProvBadge() {
  const ps = (imgCapsCache && imgCapsCache.providers) || {};
  const p = imgProvSel === 'demo' ? ps.pollinations : ps['openrouter-image'];
  if (!p) return '';
  if (p.textOnly) return '<span class="pill warn">TEXT ONLY — refs not transmitted</span>';
  if (p.paid && !p.paidEnabled) return '<span class="pill warn">PAID — currently OFF (no charges possible)</span>';
  return '<span class="pill ok">PIXEL REFERENCES</span>';
}
function readSettings() {
  return {
    aspect: ($('cvAspect') || {}).value || '1:1',
    quality: ($('cvQuality') || {}).value || 'Standard',
    size: Number(($('cvSize') || {}).value) || 1024,
    provider: ($('cvProv') || {}).value || imgProvSel || 'demo'
  };
}
async function genSelected(btn) {
  const b = (window._img || {}).board;
  const sc = curScene();
  if (!b || !sc) return showToast('เลือกฉากก่อน', false);
  await genScenes([sc.id], btn);
}
async function genAllScenes(btn) {
  const b = (window._img || {}).board;
  if (!b || !b.scenes.length) return showToast('ไม่มีฉาก', false);
  if (!confirm(`เจนทั้งหมด ${b.scenes.length} ฉากทีละคิว?`)) return;
  await genScenes(b.scenes.map(s => s.id), btn);
}
async function genScenes(ids, btn) {
  try { persistImgSettings(); } catch {}
  const b = window._img.board;
  if (btn) btn.disabled = true;
  const qbox = $('queueBox');
  const paintQ = (states) => {
    if (!qbox) return;
    qbox.innerHTML = states.map(s => `<div style="font-size:12px">Scene ${s.id}: ${s.st === 'done' ? '✓ Generated' : s.st === 'run' ? '⏳ Generating...' : s.st === 'fail' ? '✕ ' + (s.err || 'failed') : '○ Waiting'}</div>`).join('');
  };
  const states = ids.map(id => ({ id, st: 'wait' }));
  paintQ(states);
  try {
    const r = await fetch(`/api/storyboards/${b.id}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene_ids: ids, settings: readSettings() })
    }).then(r => r.json());
    if (r.error) throw new Error(r.error);
    (r.results || []).forEach((res, i) => {
      if (states[i]) { states[i].st = res.ok ? 'done' : 'fail'; states[i].err = res.error; }
    });
    paintQ(states);
    showToast('เจนเสร็จ ✓');
    openBoard(b.id);
  } catch (e) {
    states.forEach(s => { if (s.st !== 'done') { s.st = 'fail'; s.err = e.message; } });
    paintQ(states);
    showToast(e.message || '', false);
  } finally { if (btn) btn.disabled = false; }
}
async function dlCurrentImage() {
  try {
    const sc = curScene();
    if (!sc) return;
    const cur = (sc.generations || []).find(g => g.is_current) || (sc.generations || [])[0];
    const asset = cur && (cur.assets || [])[0];
    if (!asset) return showToast('ฉากนี้ยังไม่มีภาพ', false);
    const a = document.createElement('a');
    a.href = '/api/image/asset/' + asset.id;
    a.download = `scene-${sc.scene_id}-v${cur.version}.jpg`;
    a.click();
  } catch (e) { showToast(e.message || '', false); }
}
// ---------- flow pack ----------
async function renderFlowPack() {
  let host = $('flowHost');
  if (!host) {
    const anchor = $('canvasHost');
    if (!anchor) return;
    host = document.createElement('div');
    host.id = 'flowHost';
    anchor.after(host);
  }
  const b = (window._img || {}).board;
  if (!b) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="box"><div class="box-title"><h3>🚀 Flow Handoff</h3><span>
  <button class="secondary" onclick="compileFlow(this)">Compile Flow Pack</button></span></div>
  <div id="flowOut" style="font-size:12px;opacity:.7">ยังไม่ compile — กด Compile เพื่อรวม DNA + ภาพ + refs เป็น prompt แพ็ก</div></div>`;
}
async function compileFlow(btn) {
  const b = (window._img || {}).board;
  if (!b) return;
  if (btn) btn.disabled = true;
  try {
    const pack = await fetch(`/api/storyboards/${b.id}/flow-pack`).then(r => r.json());
    if (pack.error) throw new Error(pack.error);
    window._flowPack = pack;
    $('flowOut').innerHTML = pack.scenes.map((s, i) => `<details class="out-sec" style="margin-top:8px"${i === 0 ? ' open' : ''}>
    <summary>${esc(s.scene_id)} · ${esc(s.duration)} — ${esc((s.purpose || '').slice(0, 50))}</summary>
    <div class="sec-body"><div style="font-size:12px">refs: ${esc((s.references || []).map(r => r.url || r).join(' | ').slice(0, 160))}${s.image ? `<br>image: <code>${esc(s.image)}</code>` : '<br>image: —'}</div>
    <div class="out" style="white-space:pre-wrap;margin-top:6px">${esc(s.prompt || '')}</div>
    <div style="margin-top:6px"><button class="secondary" onclick="copyText(window._flowPack.scenes[${i}].prompt,this)">Copy Prompt</button></div></div></details>`).join('')
    + `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
    <button class="secondary" onclick="copyAllFlowPack(this)">Copy All Flow Prompts</button>
    <button class="secondary" onclick="dlPack('txt')">Export .txt</button>
    <button class="secondary" onclick="dlPack('json')">Export .json</button>
    <button class="secondary" onclick="dlPack('xlsx')">Export .xlsx</button></div>`;
  } catch (e) { $('flowOut').innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
  finally { if (btn) btn.disabled = false; }
}
function copyAllFlowPack(btn) {
  const p = window._flowPack;
  if (!p) return;
  copyText(p.scenes.map(s => `[${s.scene_id} ${s.duration}]\n${s.prompt}`).join('\n\n---\n\n'), btn);
}
function dlPack(fmt) {
  const b = (window._img || {}).board;
  if (!b) return;
  const a = document.createElement('a');
  a.href = `/api/storyboards/${b.id}/export.${fmt}`;
  a.click();
}
