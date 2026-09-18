// Set Builder workspace — campaign composition above products.
// Product workflow untouched. All set logic via /api/sets*.
let setModeCur = 'product', curSetId = 0, curSet = null, setPlanVer = 0;

const WS_TITLES = { product: 'Product Studio', set: 'Set Builder', map: 'Vehicle Product Map', image: 'Image Studio', dist: 'Content Distribution', pub: 'Publishing' };
function setMode(m) {
  setModeCur = m;
  const secs = { product: document.querySelector('.workspace-main'), set: $('setWorkspace'), map: $('mapWorkspace'), image: $('imgWorkspace'), dist: $('distWorkspace'), pub: $('pubWorkspace') };
  for (const [k, el] of Object.entries(secs)) {
    if (!el) continue;
    if (k === 'product') el.style.display = (m === 'product') ? '' : 'none';
    else el.hidden = m !== k;
  }
  document.querySelectorAll('#rail button').forEach(b => b.classList.toggle('primary', b.dataset.mode === m));
  const prodUI = m === 'product';
  const tb = document.querySelector('.toolbar'); if (tb) tb.style.display = prodUI ? '' : 'none';
  const ds = $('dashstrip'); if (ds) ds.style.display = prodUI ? '' : 'none';
  const wn = $('wsName'); if (wn) wn.textContent = WS_TITLES[m] || 'Product Studio';
  if (m === 'set') renderSetHome();
  else if (m === 'map') { if (typeof renderMapHome === 'function') renderMapHome(); }
  else if (m === 'image') { if (typeof renderImageHome === 'function') renderImageHome(); }
  else if (m === 'dist') { if (typeof renderDistHome === 'function') renderDistHome(); }
  else if (m === 'pub') { if (typeof renderPubHome === 'function') renderPubHome(); }
  else if (m === 'image') { if (typeof renderImageHome === 'function') renderImageHome(); }
}
function navDist() {
  if (!window.current) { showToast('เลือกสินค้าก่อน แล้วค่อยเปิด Distribution', false); setMode('product'); return; }
  setMode('dist');
  if (typeof openDistStudio === 'function') openDistStudio();
}
function navPub() {
  setMode('pub');
  if (typeof openDistStudio === 'function') { /* publishing lives in pub workspace */ }
}

async function apiSet(url, method, body) {
  const r = await fetch(url, { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
  if (r.error) throw new Error(r.error);
  return r;
}

async function renderSetHome() {
  const el = $('setBody');
  el.innerHTML = '<div class="loading">กำลังโหลด sets...</div>';
  try {
    const sets = await apiSet('/api/sets');
    const sc = $('setCount'); if (sc) sc.textContent = sets.length + ' sets';
    const cards = sets.map(s => '<div class="box"><div class="box-title"><h3>' + esc(s.set_name || ('SET #' + s.id)) + '</h3><span>' + s.items + ' SKU · ' + esc(s.status || '') + '</span></div>'
      + '<div style="font-size:12px;opacity:.75">' + esc(s.vehicle_family || '') + ' · Day ' + (s.campaign_day || 0) + '/' + (s.planned_days || 0) + '</div>'
      + '<div style="margin-top:8px"><button class="secondary" onclick="openSet(' + s.id + ')">เปิด Set</button></div></div>').join('');
    el.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
      + '<button class="secondary" onclick="setCreateUI()">+ สร้าง Set</button>'
      + '<button class="secondary" onclick="setImportUI()">Import ตาราง Campaign</button></div>'
      + '<div id="setCreate"></div>'
      + (cards || '<div class="empty-state">ยังไม่มี Set — สร้างหรือ import ตาราง campaign</div>');
  } catch (e) { el.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}

function setCreateUI() {
  $('setCreate').innerHTML = `<div class="box"><div class="box-title"><h3>Set ใหม่</h3></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap"><input id="nsName" placeholder="ชื่อ Set เช่น Revo 2020-2025" style="flex:2;min-width:200px"><input id="nsCode" placeholder="รหัส" style="flex:1;min-width:90px"><input id="nsVehicle" placeholder="Vehicle family" style="flex:2;min-width:160px"><input id="nsDays" placeholder="วัน" type="number" style="width:80px"><button class="generate" onclick="setCreate()">สร้าง</button></div></div>`;
}
async function setCreate() {
  try {
    const r = await apiSet('/api/sets', 'POST', { name: $('nsName').value, code: $('nsCode').value, vehicle: $('nsVehicle').value, days: Number($('nsDays').value) || 0 });
    openSet(r.set.id);
  } catch (e) { showToast(e.message || '', false); }
}
function setImportUI() {
  $('setCreate').innerHTML = `<div class="box"><div class="box-title"><h3>Import ตาราง (Set No / Vehicle / Code / Name ต่อแถว)</h3></div>
  <textarea id="impText" rows="6" style="width:100%;background:#0a0e15;color:#fff;border:1px solid #303744;border-radius:8px;padding:8px" placeholder="1&#9;Revo 2020-2025&#9;04-60600L&#9;เสื้อไฟท้าย..."></textarea>
  <div style="margin-top:6px"><button class="generate" onclick="setImport()">Import</button></div></div>`;
}
async function setImport() {
  try {
    const r = await apiSet('/api/sets/import', 'POST', { text: $('impText').value });
    showToast(`Import ${r.sets.length} sets ✓`); renderSetHome();
  } catch (e) { showToast(e.message || '', false); }
}

async function openSet(id) {
  curSetId = id;
  const el = $('setBody');
  el.innerHTML = '<div class="loading">กำลังโหลด Set...</div>';
  try {
    const d = await apiSet('/api/sets/' + id);
    curSet = d;
    const items = d.items.map(it => {
      const sh = (d.sheets || {})[it.product_code];
      return `<div class="box"><div class="box-title"><h3>${esc(it.product_code)}</h3><span>${esc(it.role || '')}${it.group_name ? ' · ' + esc(it.group_name) : ''}</span></div>
      <div style="display:flex;gap:10px;align-items:center">${it.main_image_url ? `<img src="${esc(imageUrl(it.main_image_url))}" loading="lazy" style="width:64px;height:64px;object-fit:cover;border-radius:8px;background:#fff">` : ''}
      <div style="font-size:12px;flex:1">${esc(it.product_name_th || it.product_name_en || '')}<br><small style="opacity:.65">${esc(it.category || '')} · fitment: ${esc((it.fitment_text || '').slice(0, 60) || '—')} · sheet: ${sh ? `v${sh.version} ${sh.status}` : 'ไม่มี'}</small></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap"><select onchange="setItemUpd(${it.id},{role:this.value})" aria-label="role">${['PRIMARY', 'PAIR_LH', 'PAIR_RH', 'OPTION', 'SECONDARY'].map(r => `<option${r === it.role ? ' selected' : ''}>${r}</option>`).join('')}</select><button class="secondary" onclick="setItemDel(${it.id})">ลบ</button></div></div>`;
    }).join('') || '<div class="empty-state">ยังไม่มีสินค้าใน Set</div>';
    const plans = (d.plans || []).map(p => `<option value="${p.version}"${p.is_current ? ' selected' : ''}>v${p.version} ${esc(p.note || '')}</option>`).join('');
    el.innerHTML = `
    <div style="margin-bottom:10px"><button class="secondary" onclick="renderSetHome()">← Sets ทั้งหมด</button></div>
    <h2 style="margin:4px 0">${esc(d.set.set_name)}</h2>
    <div style="font-size:12px;opacity:.75;margin-bottom:10px">${esc(d.set.vehicle_family || '')} · Day ${d.set.campaign_day || 0}/${d.set.planned_days || 0} · ${d.items.length} SKU · สถานะ ${esc(d.set.status || '')}</div>
    <div class="box"><div class="box-title"><h3>+ เพิ่มสินค้า (รหัส/ชื่อ หรือวางหลายบรรทัด)</h3></div>
    <div style="display:flex;gap:6px"><input id="addCodes" placeholder="04-60600L, 04-60600R..." style="flex:1"><button class="secondary" onclick="setAddItems()">เพิ่ม</button><button class="secondary" onclick="setAutoGroup()">⚡ จัดกลุ่มอัตโนมัติ</button></div></div>
    <h3>รายการ (${d.items.length})</h3>${items}
    <div class="box"><div class="box-title"><h3>🗺 Set Storyboard</h3></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <select id="sbDur" aria-label="ความยาวรวม">${['15s', '30s', '45s', '60s'].map(x => `<option${x === '30s' ? ' selected' : ''}>${x}</option>`).join('')}</select>
      <select id="sbModel" aria-label="โมเดล"><option value="gemini-omni-flash-1.1">Gemini Omni Flash</option><option value="veo-3.1">Veo 3.1</option></select>
      <button class="generate" onclick="setBuildPlan()">✨ สร้าง Set Content Plan</button>
      <select id="planVer" onchange="setLoadPlan(this.value)" aria-label="เวอร์ชันแผน">${plans || '<option value="">ยังไม่มีแผน</option>'}</select>
    </div><div id="setPlan"></div></div>`;
  } catch (e) { el.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}
async function setAddItems() {
  try {
    const v = $('addCodes').value || '';
    const codes = v.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (!codes.length) {
      const q = prompt('ค้นหา WDI (รหัส/ชื่อ):', '');
      if (!q) return;
      const d = await fetch('/api/products?q=' + encodeURIComponent(q) + '&limit=10').then(r => r.json());
      const list = Array.isArray(d) ? d : (d.products || []);
      if (!list.length) return showToast('ไม่พบสินค้า', false);
      const pick = prompt('เลือก (พิมพ์รหัส คั่นด้วย comma):\n' + list.map(x => x['Product Code'] + ' ' + (x['Product Name (TH)'] || '')).join('\n'), list[0]['Product Code']);
      if (!pick) return;
      await apiSet('/api/sets/' + curSetId + '/items', 'POST', { codes: pick.split(',') });
    } else {
      await apiSet('/api/sets/' + curSetId + '/items', 'POST', { codes });
    }
    openSet(curSetId);
  } catch (e) { showToast(e.message || '', false); }
}
async function setItemUpd(id, patch) {
  try { await apiSet('/api/set-items/' + id, 'PATCH', patch); openSet(curSetId); }
  catch (e) { showToast(e.message || '', false); }
}
async function setItemDel(id) {
  if (!confirm('ลบออกจาก Set?')) return;
  try { await apiSet('/api/set-items/' + id, 'DELETE'); openSet(curSetId); }
  catch (e) { showToast(e.message || '', false); }
}
async function setAutoGroup() {
  try {
    const r = await apiSet('/api/sets/' + curSetId + '/auto-group', 'POST', {});
    showToast(`จัดกลุ่ม ${r.assigned} รายการ ✓`); openSet(curSetId);
  } catch (e) { showToast(e.message || '', false); }
}
async function setBuildPlan() {
  const el = $('setPlan');
  el.innerHTML = '<div class="loading">กำลังวาง storyboard + เขียน scene prompts...</div>';
  try {
    const r = await apiSet('/api/sets/' + curSetId + '/storyboard', 'POST', {
      totalSecs: parseInt(($('sbDur').value || '30s')), model: $('sbModel').value, note: 'manual'
    });
    setRenderPlan(r);
    openSetRefreshPlans();
  } catch (e) { el.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}
async function openSetRefreshPlans() { try { const d = await apiSet('/api/sets/' + curSetId); } catch {} }
function setRenderPlan(r) {
  const el = $('setPlan');
  const qc = r.qc || {};
  el.innerHTML = `<div class="qa-box ${qc.status === 'READY' ? 'qa-pass' : 'qa-review'}"><b>${qc.status === 'READY' ? '✅ SET READY' : '⚠ SET NOT READY'} · v${r.version} · ${(r.plan.generations || 0)} generations · ${esc(r.plan.planned_total || '')}</b>
  ${(qc.issues || []).map(x => `<div>✕ [${esc(x.scope)}] ${esc(x.problem)} → ${esc(x.fix)}</div>`).join('')}</div>
  ${(r.plan.scenes || []).map(sc => `<details class="out-sec" style="margin-top:8px"><summary>${esc(sc.id)} · ${esc(sc.duration || '')} — ${esc(sc.title || sc.kind || '')}</summary>
  <div class="sec-body"><div style="font-size:12px;line-height:1.8">🎬 ${(sc.product_codes || []).join(', ') || '(intro/final)'}<br>🖼 ${(sc.reference_images || []).length} refs · ▶ ${esc(sc.start_source || '')} → ${esc(sc.end_goal || '')}<br>🔗 ${esc(sc.continuity || '')}</div>
  <div class="out" style="white-space:pre-wrap;margin-top:6px">${esc(((r.prompts || {})[sc.id]) || '')}</div>
  <div style="display:flex;gap:6px;margin-top:6px"><button class="secondary" onclick="copyText((window._setPrompts||{})['${sc.id}']||'',this)">Copy</button><button class="secondary" onclick="setRegenScene('${sc.id}',this)">Regen scene นี้</button></div></div></details>`).join('')}
  <div style="margin-top:10px"><button class="secondary" onclick="setCopyAllFlow(this)">Copy All Flow Prompts</button></div>`;
  window._setPrompts = r.prompts || {};
}
async function setLoadPlan(v) {
  if (!v) return;
  try {
    const p = await apiSet(`/api/sets/${curSetId}/plan?version=${v}`);
    const data = p.plan_json || {};
    setRenderPlan({ version: p.version, plan: data.plan || {}, prompts: data.prompts || {}, qc: { status: '—', issues: [] } });
  } catch (e) { showToast(e.message || '', false); }
}
async function setRegenScene(scId, btn) {
  btn.disabled = true;
  try {
    const r = await apiSet(`/api/sets/${curSetId}/regenerate-scene`, 'POST', { scene_id: scId });
    showToast(`${scId} ใหม่เป็น plan v${r.version} ✓`);
    window._setPrompts = { ...(window._setPrompts || {}), [scId]: r.prompt };
    openSet(curSetId);
  } catch (e) { showToast(e.message || '', false); }
  finally { btn.disabled = false; }
}
function setCopyAllFlow(btn) {
  const pr = window._setPrompts || {};
  copyText(Object.entries(pr).map(([k, v]) => `[${k}]\n${v}`).join('\n\n---\n\n'), btn);
}
