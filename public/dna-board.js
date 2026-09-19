// DNA + Board — product identity panel, creative brief, storyboard strip, scene editor.
// Reuses Product Sheet backend + sheet drawer. No business-logic duplication.
function dnaProduct() { return window.current || null; }

async function renderImageHome() {
  const el = $('imgBody');
  if (!el) return;
  const p = dnaProduct();
  if (!p) { el.innerHTML = '<div class="empty-state">เลือกสินค้าใน Product mode ก่อน<br><small>แล้วมาสร้าง DNA → Storyboard → Image → Flow ที่นี่</small></div>'; return; }
  if (!window._img) window._img = { boardId: 0, sceneDbId: 0, settings: { aspect: '1:1', quality: 'Standard', size: 1024 }, brief: {} };
  el.innerHTML = `
  <div class="steps-mini" aria-label="ขั้นตอน">
    <span class="sm on">01 DNA</span><span class="sm">02 Brief</span><span class="sm">03 Board</span><span class="sm">04 Images</span><span class="sm">05 Flow</span>
  </div>
  <div id="dnaPanel"></div>
  <details class="out-sec" id="briefBox"><summary>📝 Creative Brief (ค่าเริ่มต้นจาก V ที่เลือก)</summary><div class="sec-body" id="briefBody"></div></details>
  <div id="boardBox" style="margin-top:12px"></div>
  <div id="canvasBox" style="margin-top:12px"></div>
  <div id="flowBox" style="margin-top:12px"></div>`;
  await Promise.all([renderDnaPanel(), renderBriefForm(), refreshBoards()]);
}
async function renderDnaPanel() {
  const el = $('dnaPanel'), p = dnaProduct();
  if (!el || !p) return;
  try {
    const d = await fetch('/api/sheet/detail?code=' + encodeURIComponent(p['Product Code'] || '')).then(r => r.json());
    if (d.error) throw new Error(d.error);
    const idn = d.identity || {};
    const comps = idn.components || {};
    const has = k => comps[k] && comps[k].status === 'VERIFIED';
    const row = (l, ok) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span>${l}</span><b>${ok ? '✓' : '⚠'}</b></div>`;
    const img = p['Main Image URL'] ? `<img src="${esc(imageUrl(p['Main Image URL']))}" loading="lazy" style="width:84px;height:84px;object-fit:cover;border-radius:10px;background:#fff">` : '';
    const stColor = d.sheet.status === 'VERIFIED' ? '#2ed573' : '#ffd76a';
    el.innerHTML = `<div class="box"><div class="box-title"><h3>🧬 PRODUCT DNA</h3><span class="pill" style="border-color:${stColor};color:${stColor}">${esc(d.sheet.status)} · v${d.sheet.version}</span></div>
    <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">${img}
    <div style="flex:1;min-width:200px"><b>${esc(p['Product Code'] || '')}</b><br>${esc(p['Product Name (TH)'] || p['Product Name (EN)'] || '')}<br>
    <small style="opacity:.65">${esc((idn.identity || {}).category || '')}</small>
    <div style="margin-top:6px;max-width:280px">${row('Shape', true)}${row('Lens', has('lens'))}${row('Housing', has('housing') || has('housing_body') || has('mirror_shell'))}${row('Connector', has('connector'))}${row('Fitment', !!((idn.fitment || {}).verified))}</div>
    <div style="margin-top:8px"><button class="secondary" onclick="openSheetDrawer()">Open Full DNA</button></div></div></div></div>`;
    window._dna = d;
  } catch (e) {
    el.innerHTML = `<div class="box"><div class="box-title"><h3>🧬 PRODUCT DNA</h3><span>—</span></div><div style="font-size:12px">ยังไม่มี sheet: <button class="secondary" onclick="dnaEnsure()">สร้าง Product Sheet</button></div></div>`;
  }
}
async function dnaEnsure() {
  try {
    const p = dnaProduct(); if (!p) return;
    await fetch('/api/sheet?code=' + encodeURIComponent(p['Product Code'] || '')).then(r => r.json());
    renderDnaPanel();
  } catch (e) { showToast(e.message || '', false); }
}
function briefDefaults() {
  const v = (typeof seriesV !== 'undefined' ? seriesV.find(x => x.code === (typeof selectedV !== 'undefined' ? selectedV : '')) : null) || {};
  return {
    objective: '', angle: v.name || '', audience: '', mood: 'premium automotive',
    environment: 'dark studio', lighting: 'soft key + edge light', camera: 'slow push-in',
    visual_style: 'clean OEM product photo', placement: 'center hero', cta: '', ref_image: ''
  };
}
function renderBriefForm() {
  const el = $('briefBody');
  if (!el) return;
  const b = (window._img && window._img.brief) || {};
  const d = { ...briefDefaults(), ...b };
  const F = [['objective', 'เป้าหมายแคมเปญ'], ['angle', 'มุมขาย'], ['audience', 'กลุ่มเป้าหมาย'], ['mood', 'อารมณ์'], ['environment', 'ฉาก'], ['lighting', 'แสง'], ['camera', 'กล้อง'], ['visual_style', 'สไตล์ภาพ'], ['placement', 'ตำแหน่งสินค้า'], ['cta', 'CTA'], ['ref_image', 'ภาพอ้างอิง (URL, ถ้ามี)']];
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">` +
    F.map(([k, l]) => `<label style="font-size:11px;opacity:.75">${l}<input data-brief="${k}" value="${esc(d[k] || '')}" style="width:100%;min-height:36px;margin-top:3px;padding:7px 10px;border:1px solid #303744;border-radius:8px;background:#0a0e15;color:#fff"></label>`).join('') +
    `</div><div style="margin-top:8px"><button class="secondary" onclick="saveBrief(this)">บันทึก Brief</button></div>`;
}
function saveBrief() {
  const b = {};
  document.querySelectorAll('[data-brief]').forEach(i => { b[i.dataset.brief] = i.value; });
  window._img.brief = b;
  showToast('บันทึก Brief ✓');
}
async function refreshBoards() {
  const el = $('boardBox'), p = dnaProduct();
  if (!el || !p) return;
  try {
    const list = await fetch('/api/storyboards?code=' + encodeURIComponent(p['Product Code'] || '')).then(r => r.json());
    const cur = window._img.boardId && list.find(b => b.id === window._img.boardId) ? window._img.boardId : (list[0] ? list[0].id : 0);
    window._img.boardId = cur;
    el.innerHTML = `<div class="box"><div class="box-title"><h3>🎬 Storyboard</h3><span>
    <select id="boardSel" onchange="openBoard(Number(this.value))" aria-label="เลือกบอร์ด">${list.map(b => `<option value="${b.id}"${b.id === cur ? ' selected' : ''}>#${b.id} ${esc(b.name || '')} (${b.status || ''})</option>`).join('') || '<option value="">—</option>'}</select>
    <button class="secondary" onclick="newBoardUI()">+ บอร์ดใหม่</button></span></div><div id="boardDetail"></div></div>`;
    if (cur) openBoard(cur);
    else $('boardDetail').innerHTML = '<div class="empty-state">ยังไม่มีบอร์ด — สร้างบอร์ดแรกจากสินค้านี้</div>';
  } catch (e) { el.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}
function newBoardUI() {
  const el = $('boardDetail');
  el.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
  <input id="nbName" placeholder="ชื่อบอร์ด (ถ้ามี)" style="flex:2;min-width:160px;min-height:38px;padding:8px 10px;border:1px solid #303744;border-radius:9px;background:#0a0e15;color:#fff">
  <select id="nbSecs" aria-label="ความยาวรวม">${['15s', '30s', '45s', '60s'].map(x => `<option${x === '30s' ? ' selected' : ''}>${x}</option>`).join('')}</select>
  <select id="nbModel" aria-label="โมเดล"><option value="gemini-omni-flash-1.1">Gemini Omni Flash 1.1</option><option value="veo-3.1">Veo 3.1</option></select>
  <button class="generate" onclick="newBoard()">สร้างบอร์ด + ฉาก</button></div>`;
}
async function newBoard() {
  try {
    const p = dnaProduct(); if (!p) return;
    const secs = parseInt(($('nbSecs').value || '30s'));
    const r = await fetch('/api/storyboards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_code: p['Product Code'], name: $('nbName').value || '', totalSecs: secs, flow_model: $('nbModel').value, brief: (window._img || {}).brief || {} }) }).then(r => r.json());
    if (r.error) throw new Error(r.error);
    window._img.boardId = r.board.id;
    refreshBoards();
    showToast('สร้างบอร์ด ✓');
  } catch (e) { showToast(e.message || '', false); }
}
async function openBoard(id) {
  window._img.boardId = id;
  const el = $('boardDetail');
  if (!el) return;
  el.innerHTML = '<div class="loading">กำลังโหลดบอร์ด...</div>';
  try {
    const b = await fetch('/api/storyboards/' + id).then(r => r.json());
    if (b.error) throw new Error(b.error);
    window._img.board = b;
    if (!window._img.sceneDbId || !b.scenes.some(s => s.id === window._img.sceneDbId)) {
      window._img.sceneDbId = b.scenes.length ? b.scenes[0].id : 0;
    }
    el.innerHTML = `<div style="font-size:12px;opacity:.7;margin-bottom:6px">${b.scenes.length} scenes · ${esc(b.flow_model || '')} · ${esc(b.status || '')}</div>
    <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px">` + b.scenes.map(s => {
      const cur = (s.generations || []).find(g => g.is_current);
      return `<button onclick="pickScene(${s.id})" style="flex:none;width:150px;text-align:left;background:#0e141d;border:1px solid ${s.id === window._img.sceneDbId ? '#ffd76a' : '#2b3441'};border-radius:12px;padding:8px;cursor:pointer;color:#fff">
      <b style="font-size:12px">${esc(s.scene_id)} · ${s.duration_secs}s</b><br>
      <small style="opacity:.7">${esc((s.purpose || '').slice(0, 40))}</small><br>
      <small style="opacity:.7">${cur ? `v${cur.version} ${cur.status}` : '○ ยังไม่เจน'}</small></button>
      <button class="secondary" style="flex:none;align-self:center;font-size:11px;padding:4px 8px" onclick="event.stopPropagation();openSceneEditor(${s.id})" title="แก้ไขฉาก">✏️</button>`;
    }).join('') + `</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="secondary" onclick="addSceneUI()">+ เพิ่มฉาก</button></div>
    <div class="tl-timeline">` + b.scenes.map(s => `<div class="tl-seg"><b>${esc(s.scene_id)} · ${s.duration_secs}s</b><span>${esc((s.purpose || '').slice(0, 30))}</span><div class="tl-bar"><i></i></div></div>`).join('') + `</div>`;
    if (typeof renderCanvas === 'function') renderCanvas();
    if (typeof renderFlowPack === 'function') renderFlowPack();
  } catch (e) { el.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}
function pickScene(dbId) { window._img.sceneDbId = dbId; openBoard(window._img.boardId); }
async function addSceneUI() {
  try {
    await fetch(`/api/storyboards/${window._img.boardId}/scenes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'ฉากใหม่', duration_secs: 8 }) }).then(r => r.json());
    openBoard(window._img.boardId);
  } catch (e) { showToast(e.message || '', false); }
}
// ---------- scene editor drawer ----------
async function openSceneEditor(dbId) {
  const m = $('sceneDrawer'), b = $('sceneBody'), sc0 = $('sceneScrim');
  if (!m || !b) return;
  m.classList.add('open');
  if (sc0) sc0.classList.add('on');
  b.innerHTML = '<div class="loading">กำลังโหลด...</div>';
  try {
    const board = window._img.board;
    const sc = (board.scenes || []).find(s => s.id === dbId);
    if (!sc) throw new Error('not found');
    const F = [['purpose', 'Purpose'], ['duration_secs', 'Duration (วิ)'], ['shot', 'Shot'], ['camera', 'Camera'], ['environment', 'Environment'], ['lighting', 'Lighting'], ['action', 'Action'], ['continuity', 'Continuity'], ['start_state', 'Start state'], ['end_state', 'End state'], ['negative_prompt', 'Negative']];
    b.innerHTML = `<h3 style="margin-top:0">${esc(sc.scene_id)} <small style="opacity:.6">board #${board.id}</small></h3>` +
      F.map(([k, l]) => `<label style="font-size:11px;opacity:.75;display:block;margin-top:6px">${l}<input data-sc="${k}" value="${esc(sc[k] ?? '')}" style="width:100%;min-height:36px;margin-top:3px;padding:7px 10px;border:1px solid #303744;border-radius:8px;background:#0a0e15;color:#fff"></label>`).join('') +
      `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="generate" onclick="saveScene(${sc.id},this)">บันทึก</button><button class="secondary" onclick="moveScene(${sc.id},-1)">◀ ย้าย</button><button class="secondary" onclick="moveScene(${sc.id},1)">ย้าย ▶</button><button class="secondary" onclick="delScene(${sc.id},this)">ลบฉาก</button></div>
      <h4 style="margin:14px 0 6px">ประวัติ generation</h4><div id="scHist"><div class="loading">...</div></div>`;
    const h = await fetch(`/api/storyboards/${board.id}/history`).then(r => r.json()).catch(() => []);
    const mine = h.filter(g => g.scene === sc.scene_id);
    $('scHist').innerHTML = mine.length ? mine.map(g =>
      `<div style="font-size:12px;padding:6px 4px;border-bottom:1px solid #1c2430">v${g.version} ${esc(g.status)} ${esc(g.aspect_ratio || '')} ${esc(g.model || '')}
      <span style="float:right"><button class="secondary" style="font-size:11px;padding:2px 8px" onclick="restoreGen(${g.id})">ใช้เวอร์ชันนี้</button>
      <button class="secondary" style="font-size:11px;padding:2px 8px" onclick="copyText(${JSON.stringify('v' + g.version)},this)">Copy</button></span></div>`
    ).join('') : '<div class="empty-state">ยังไม่มี generation</div>';
  } catch (e) { b.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}
function closeSceneEditor() {
  const m = $('sceneDrawer'); if (m) m.classList.remove('open');
  const s = $('sceneScrim'); if (s) s.classList.remove('on');
}
async function saveScene(dbId) {
  try {
    const patch = {};
    document.querySelectorAll('[data-sc]').forEach(i => { patch[i.dataset.sc] = i.dataset.sc === 'duration_secs' ? Number(i.value) || 10 : i.value; });
    await fetch(`/api/storyboards/scenes/${dbId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then(r => r.json());
    showToast('บันทึกฉาก ✓'); closeSceneEditor(); openBoard(window._img.boardId);
  } catch (e) { showToast(e.message || '', false); }
}
async function delScene(dbId, btn) {
  if (!confirm('ลบฉากนี้? (รวม generations)')) return;
  try {
    await fetch(`/api/storyboards/scenes/${dbId}`, { method: 'DELETE' }).then(r => r.json());
    closeSceneEditor(); openBoard(window._img.boardId);
  } catch (e) { showToast(e.message || '', false); }
}
async function moveScene(dbId, dir) {
  try {
    const board = window._img.board;
    const ids = board.scenes.map(s => s.id);
    const i = ids.indexOf(dbId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await fetch(`/api/storyboards/${board.id}/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: ids }) }).then(r => r.json());
    closeSceneEditor(); openBoard(board.id);
  } catch (e) { showToast(e.message || '', false); }
}
async function restoreGen(gid) {
  try {
    await fetch(`/api/storyboards/generations/${gid}/restore`, { method: 'POST' }).then(r => r.json());
    showToast('ใช้เวอร์ชันนี้แล้ว ✓'); openSceneEditor(window._img.sceneDbId);
    if (typeof renderCanvas === 'function') renderCanvas();
  } catch (e) { showToast(e.message || '', false); }
}
