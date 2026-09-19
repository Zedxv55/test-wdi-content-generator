// Vehicle Product Map — WDI-sourced discovery workspace (separate from Set Builder).
// Vehicle is the anchor; categories branch; products are leaves. No SKU merges.
let mapState = { brand: '', model: '', data: null, tab: 'map', selected: [], q: '', side: '', zoom: 1, panX: 0, panY: 0, collapsed: {} };

async function renderMapHome() {
  const el = $('mapBody');
  el.innerHTML = `
    <div class="wp-toolbar">
      <select id="mapBrand" class="wp-select grow" aria-label="ยี่ห้อรถ"><option value="">เลือกยี่ห้อรถ</option></select>
      <select id="mapModel" class="wp-select grow" aria-label="รุ่นรถ"><option value="">เลือกรุ่นรถ</option></select>
      <button class="generate" onclick="mapFetch()">ค้นจาก WDI</button>
      <button class="secondary" onclick="mapFetch(true)">รีเฟรช</button>
    </div>
    <div id="mapView" class="map-shell-grid">
      <section class="map-col"><div class="wp-card"><div class="wp-card-head"><h2>Vehicle</h2><span>Brand</span></div><div class="wp-card-body" id="mapBrandInfo"><div class="wp-empty"><div class="wp-icon">🚙</div><b>เลือกยี่ห้อ</b>เพื่อเริ่มค้นหา</div></div></div></section>
      <section class="map-col"><div class="wp-card"><div class="wp-card-head"><h2>Model</h2><span>WDI</span></div><div class="wp-card-body" id="mapModelInfo"><div class="wp-empty"><div class="wp-icon">◈</div><b>เลือกรุ่น</b>แล้วค้นจาก WDI</div></div></div></section>
      <section class="map-col"><div class="wp-card"><div class="wp-card-head"><h2>Products</h2><span id="mapCount">—</span></div><div class="map-scroll" id="mapProductInfo"><div class="wp-empty"><div class="wp-icon">📦</div><b>ยังไม่มีสินค้า</b>เลือก Vehicle → Model → ค้นจาก WDI</div></div></div></section>
    </div>`;
  try {
    const d = await fetch('/api/vehicle/brands').then(r => r.json());
    const brands = d.brands || [];
    $('mapBrand').innerHTML = '<option value="">เลือกยี่ห้อรถ ('+brands.length+')</option>' + brands.map(b => `<option value="${esc(b.brand)}">${esc(b.brand)}</option>`).join('');
    $('mapBrand').onchange = mapBrandChange;
  } catch (e) { $('mapView').innerHTML = `<div class="error">โหลด Vehicle Map ไม่สำเร็จ: ${esc(e.message || '')}</div>`; }
}
async function mapBrandChange() {
  const b = $('mapBrand').value;
  $('mapModel').innerHTML = '<option value="">กำลังโหลดรุ่น...</option>';
  if (!b) { $('mapModel').innerHTML = '<option value="">— รุ่น —</option>'; return; }
  try {
    const d = await fetch('/api/vehicle/models?brand=' + encodeURIComponent(b)).then(r => r.json());
    $('mapModel').innerHTML = '<option value="">— รุ่น (' + d.models.length + ') —</option>' + d.models.map(m => `<option value="${esc(m.model)}">${esc(m.model)}</option>`).join('');
  } catch (e) { $('mapModel').innerHTML = '<option value="">โหลดไม่สำเร็จ</option>'; }
}
async function mapFetch(force) {
  const b = $('mapBrand').value, m = $('mapModel').value;
  if (!b || !m) return showToast('เลือกยี่ห้อและรุ่นก่อน', false);
  const el = $('mapView');
  el.innerHTML = '<div class="loading">กำลังดึงข้อมูลจาก WDI...</div>';
  try {
    const d = await fetch(`/api/vehicle/map?brand=${encodeURIComponent(b)}&model=${encodeURIComponent(m)}${force ? '&refresh=1' : ''}`).then(r => r.json());
    if (d.error) throw new Error(d.error);
    mapState = { brand: b, model: m, data: d, tab: 'map', selected: [], q: '', side: '', zoom: 1, panX: 0, panY: 0, collapsed: {} };
    renderMapView();
  } catch (e) { el.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}
function mapFilteredGroups() {
  const d = mapState.data;
  if (!d) return [];
  const q = mapState.q.trim().toLowerCase(), side = mapState.side;
  return d.groups.map(g => ({
    ...g,
    items: g.items.filter(it => {
      if (q && !((it.code || '') + ' ' + (it.name_th || '') + ' ' + (it.name_en || '') + ' ' + g.name).toLowerCase().includes(q)) return false;
      if (side && it.side !== side && !(side === 'Pair' && it.side === 'Pair')) return false;
      return true;
    })
  })).filter(g => g.items.length);
}
function mapSheetBadge(it) {
  if (!it.matched) return '<small style="opacity:.55">นอก master</small>';
  if (!it.sheet) return '<small>sheet: -</small>';
  const c = it.sheet.status === 'VERIFIED' ? '#2ed573' : '#ffd76a';
  return `<small style="color:${c}">sheet v${it.sheet.version} ${it.sheet.status}</small>`;
}
function mapFitBadge(it) {
  if (!it.matched) return '';
  return it.fit.status === 'verified'
    ? '<span class="pill ok">✓ fitment</span>'
    : '<span class="pill warn" title="' + esc(it.fit.reason || '') + '">⚠ fitment review</span>';
}
function renderMapView() {
  const el = $('mapView'), d = mapState.data;
  if (!d) return;
  el.classList.remove('map-shell-grid');
  const v = d.vehicle;
  const total = d.groups.reduce((a, g) => a + g.count, 0);
  const verified = d.groups.flatMap(g => g.items).filter(i => i.fit.status === 'verified').length;
  const withSheet = d.groups.flatMap(g => g.items).filter(i => i.sheet).length;
  const imgHtml = v.image && v.image_status === 'VEHICLE'
    ? `<img src="/api/wdi/image?url=${encodeURIComponent(v.image)}" alt="vehicle" style="width:120px;height:90px;object-fit:cover;border-radius:10px;background:#fff" loading="lazy" onerror="this.outerHTML='<div class=image-missing style=min-height:90px>ไม่มีภาพ</div>'">`
    : `<div class="image-missing" style="min-height:90px;min-width:120px">ยังไม่พบภาพรถจาก WDI${v.image_status === 'REVIEW' ? ' (รอตรวจ)' : ''}</div>`;
  el.innerHTML = `
  <div class="box"><div class="box-title"><h3>${esc(v.brand)} ${esc(v.model)}</h3><span>
    <button class="secondary" onclick="window.open('${esc(v.url)}','_blank')">Open WDI</button>
    <button class="secondary" onclick="mapFetch(true)">Refresh</button>
    <button class="secondary" onclick="mapExport(this)">Export Excel</button>
    <button class="secondary" onclick="mapImagePrompt(this)">✨ ภาพ Map</button></span></div>
  <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${imgHtml}
  <div style="font-size:12px">Source: WDI · ${esc(d.checked_at || '').slice(0, 10)}<br>สินค้า WDI ${d.total_wdi} · ตรง master ${d.matched}</div></div></div>
  <div style="display:flex;gap:14px;align-items:start;flex-wrap:wrap;margin-top:10px">
  <div class="box" style="flex:1;min-width:220px"><div class="box-title"><h3>สรุป</h3></div>
  <div style="font-size:12px;line-height:2">Products: <b>${total}</b><br>Categories: <b>${d.groups.length}</b><br>Sheets: <b>${withSheet}/${total}</b><br>Fitment OK: <b>${verified}</b></div>
  <div style="margin-top:8px"><button class="secondary" onclick="mapSelectAll(true)">ใช้ทั้งหมดสร้าง Set</button></div></div>
  <div class="box" style="flex:3;min-width:280px"><div class="box-title"><h3>มุมมอง</h3><span>
    <button class="secondary" onclick="mapSetTab('map')">MAP</button>
    <button class="secondary" onclick="mapSetTab('list')">LIST</button></span></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><input id="mapQ" placeholder="ค้นหา code/ชื่อ/หมวด" style="flex:2;min-width:140px" value="${esc(mapState.q)}" onkeydown="if(event.key==='Enter'){mapState.q=this.value;renderMapView();}">
  ${['', 'LH', 'RH', 'Pair'].map(s => `<button class="secondary" style="${mapState.side === s ? 'border-color:#ffd76a;color:#ffd76a' : ''}" onclick="mapState.side='${s}';renderMapView()">${s || 'ทุกฝั่ง'}</button>`).join('')}
  <button class="secondary" onclick="mapFit()">Fit</button>
  <button class="secondary" onclick="mapZoom(0.15)">+</button><button class="secondary" onclick="mapZoom(-0.15)">−</button></div>
  <div id="mapCanvas" style="overflow:auto;max-height:60vh;border:1px solid #232b36;border-radius:10px;padding:12px"><div id="mapInner" style="transform-origin:top center;min-width:520px">${mapState.tab === 'map' ? mapHtml() : mapListHtml()}</div></div></div>
  <div class="box" style="flex:1;min-width:200px"><div class="box-title"><h3>Selected (<span id="mapSelN">${mapState.selected.length}</span>)</h3></div>
  <div id="mapSel" style="font-size:12px;max-height:30vh;overflow:auto">${mapSelHtml()}</div>
  <div style="display:flex;gap:6px;margin-top:8px"><button class="secondary" onclick="mapCreateSet()">สร้าง Set</button><button class="secondary" onclick="mapClearSel()">Clear</button></div></div>
  </div><div id="mapPromptOut" style="margin-top:10px"></div>`;
  applyMapTransform();
}
function mapHtml() {
  const groups = mapFilteredGroups();
  const v = mapState.data.vehicle;
  return `<div style="text-align:center;margin-bottom:6px"><div class="selv" style="display:inline-flex"><b>🚙 ${esc(v.brand)} ${esc(v.model)}</b></div>
  <div style="font-size:11px;opacity:.65">VEHICLE CONTEXT (title only — ไม่ใช่หลักฐาน fitment)</div></div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">` + groups.map((g, gi) => {
    const over = g.count > 50;
    const shut = over && !mapState.collapsed[gi];
    const show = shut ? g.items.slice(0, 6) : g.items;
    return `<div class="box" style="flex:1;min-width:200px;max-width:320px"><div class="box-title"><h3>${esc(g.name)} (${g.count})</h3>${over ? `<button onclick="mapToggleCat(${gi})">${shut ? 'expand' : 'collapse'}</button>` : ''}</div>`
      + show.map(it => mapNodeHtml(it)).join('')
      + (shut ? `<div style="font-size:11px;opacity:.6">+ อีก ${g.count - 6} — กด expand</div>` : '') + `</div>`;
  }).join('') + `</div>`;
}
function mapNodeHtml(it) {
  const key = it.matched ? it.code : it.url;
  const on = mapState.selected.includes(key);
  return `<div class="box" style="margin:6px 0;${on ? 'border-color:#ffd76a' : ''}"><div style="display:flex;gap:8px;align-items:center">
  ${it.img ? `<img src="/api/wdi/image?url=${encodeURIComponent(it.img)}" loading="lazy" style="width:52px;height:52px;object-fit:cover;border-radius:8px;background:#fff" onerror="this.style.display='none'">` : ''}
  <div style="flex:1;min-width:0;font-size:12px"><b>${esc(it.code || '(WDI only)')}</b><br>${esc(it.name_th || it.name_en || '')}<br>
  <small style="opacity:.65">${it.side ? esc(it.side) + ' · ' : ''}${mapSheetBadge(it)}</small><br>${mapFitBadge(it)}</div>
  <div style="display:flex;flex-direction:column;gap:4px"><button class="secondary" onclick='mapToggleSel(${JSON.stringify(key)})'>${on ? '✓' : '+'}</button>
  ${it.matched ? `<button class="secondary" onclick="mapOpenSheet('${esc(it.code)}')">sheet</button>` : ''}</div></div></div>`;
}
function mapListHtml() {
  const groups = mapFilteredGroups();
  return groups.map(g => `<h4 style="margin:10px 0 4px">${esc(g.name)} (${g.count})</h4>` + g.items.map(it =>
    `<div style="font-size:12px;padding:5px 4px;border-bottom:1px solid #1c2430"><b>${esc(it.code || '(WDI)')}</b> ${esc(it.name_th || it.name_en || '')} ${it.side ? '[' + esc(it.side) + ']' : ''} ${it.fit.status === 'verified' ? '✓' : '⚠'} <button class="secondary" style="font-size:11px;padding:2px 8px" onclick='mapToggleSel(${JSON.stringify(it.matched ? it.code : it.url)})'>+</button></div>`
  ).join('')).join('');
}
function mapSelHtml() {
  if (!mapState.selected.length) return '<span style="opacity:.6">0 selected — แตะ + ที่สินค้า</span>';
  return mapState.selected.map(k => `<div>✓ ${esc(String(k).length > 42 ? String(k).slice(0, 42) + '…' : k)}</div>`).join('');
}
function mapToggleSel(key) {
  const i = mapState.selected.indexOf(key);
  if (i >= 0) mapState.selected.splice(i, 1); else mapState.selected.push(key);
  const n = $('mapSelN'); if (n) n.textContent = mapState.selected.length;
  const box = $('mapSel'); if (box) box.innerHTML = mapSelHtml();
  renderMapViewKeep();
}
function renderMapViewKeep() {
  const pos = $('mapCanvas') ? $('mapCanvas').scrollTop : 0;
  renderMapView();
  const c = $('mapCanvas'); if (c) c.scrollTop = pos;
}
function mapToggleCat(gi) { mapState.collapsed[gi] = !mapState.collapsed[gi]; renderMapViewKeep(); }
function mapSetTab(t) { mapState.tab = t; renderMapView(); }
function mapZoom(d) { mapState.zoom = Math.max(0.5, Math.min(1.6, +(mapState.zoom + d).toFixed(2))); applyMapTransform(); }
function mapFit() { mapState.zoom = 1; mapState.panX = 0; mapState.panY = 0; applyMapTransform(); }
function applyMapTransform() {
  const el = $('mapInner');
  if (el) el.style.transform = `translate(${mapState.panX}px,${mapState.panY}px) scale(${mapState.zoom})`;
}
function mapOpenSheet(code) {
  // Sheet lives on the Product page (section 02). Take the user there with context.
  location.href = 'index.html?code=' + encodeURIComponent(code || '');
}
async function mapSelectAll(all) {
  const groups = mapFilteredGroups();
  const keys = [];
  groups.forEach(g => g.items.forEach(it => { if (it.matched) keys.push(it.code); }));
  mapState.selected = [...new Set(keys)];
  renderMapViewKeep();
  showToast(`เลือก ${mapState.selected.length} SKU ✓`);
}
function mapClearSel() { mapState.selected = []; renderMapViewKeep(); }
async function mapCreateSet() {
  if (!mapState.selected.length) return showToast('ยังไม่เลือกสินค้า', false);
  const codes = mapState.selected.filter(k => !/^https?:/.test(k));
  if (!codes.length) return showToast('รายการที่เลือกไม่มีใน master', false);
  try {
    const v = mapState.data.vehicle;
    const r = await fetch('/api/sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `SET ${v.brand} ${v.model}`, vehicle: `${v.brand} ${v.model}` }) }).then(r => r.json());
    if (r.error) throw new Error(r.error);
    const a = await fetch(`/api/sets/${r.set.id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codes }) }).then(r => r.json());
    showToast(`สร้าง Set + ${a.added} SKU ✓`);
    location.href = 'set.html?set=' + r.set.id;
  } catch (e) { showToast(e.message || '', false); }
}
async function mapExport(btn) {
  btn.disabled = true;
  try {
    const { brand, model } = mapState;
    const r = await fetch(`/api/vehicle/export?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`);
    if (!r.ok) throw new Error('export ไม่สำเร็จ');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Vehicle-Map_${brand}_${model}.xlsx`;
    a.click(); URL.revokeObjectURL(a.href);
  } catch (e) { showToast(e.message || '', false); }
  finally { btn.disabled = false; }
}
async function mapImagePrompt(btn) {
  const el = $('mapPromptOut');
  el.innerHTML = '<div class="loading">กำลังประกอบ prompt...</div>';
  try {
    const { brand, model } = mapState;
    const r = await fetch(`/api/vehicle/image-prompt?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`).then(r => r.json());
    if (r.error) throw new Error(r.error);
    window._mapPrompt = r.prompt;
    el.innerHTML = `<div class="box"><div class="box-title"><h3>✨ Vehicle Map Prompt</h3><button onclick="copyText(window._mapPrompt,this)">Copy</button></div><div class="out" style="white-space:pre-wrap">${esc(r.prompt)}</div></div>`;
  } catch (e) { el.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}
// ---------- map preselect (moved from shell.js; no duplicates) ----------
async function mapPreselect(brand, model) {
  try {
    if (!$('mapBrand').options.length || $('mapBrand').options.length <= 1) await renderMapHome();
    $('mapBrand').value = brand;
    await mapBrandChange();
    if (model) { $('mapModel').value = model; mapFetch(); }
  } catch (e) { showToast(e.message || '', false); }
}
