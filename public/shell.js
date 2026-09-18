// Studio shell: global search, smart-next bar, history drawer, dist/pub workspaces.
// Presentation + navigation only. All data via existing APIs.
function renderDistHome() {
  const ctx = $('distCtx');
  if (window.current) {
    if (ctx) ctx.textContent = window.current['Product Code'] || '';
    if (typeof openDistStudio === 'function') openDistStudio();
  } else {
    if (ctx) ctx.textContent = '';
    const el = $('distBody');
    if (el) el.innerHTML = '<div class="empty-state">เลือกสินค้าใน Product mode ก่อน<br><small>แล้ว Distribution จะสร้าง content ให้สินค้านั้น</small></div>';
  }
}
function renderPubHome() {
  const el = $('pubBody');
  if (!el) return;
  el.innerHTML = `<div style="display:flex;gap:6px;margin-bottom:10px" role="tablist">
  <button class="secondary" onclick="pubTab('queue')" id="pubTQueue">Queue</button>
  <button class="secondary" onclick="pubTab('cal')" id="pubTCal">Calendar</button>
  <button class="secondary" onclick="pubTab('done')" id="pubTDone">Published</button></div><div id="pubTabBody"><div class="loading">กำลังโหลด...</div></div>`;
  pubTab('queue');
}
async function pubTab(t) {
  const el = $('pubTabBody');
  if (!el) return;
  if (t === 'cal') {
    el.innerHTML = '<div id="adTabBody"></div>';
    try { renderCalendar(); } catch (e) { el.innerHTML = 'เปิด calendar ไม่สำเร็จ'; }
    el.innerHTML += `<div class="box" style="margin-top:10px"><div class="box-title"><h3>Automation (n8n)</h3></div><div style="font-size:12px">Webhook: <code>${esc(typeof n8nWebhookBase === 'function' ? n8nWebhookBase() : '')}</code></div></div>`;
    return;
  }
  try {
    const d = await fetch('/api/dashboard').then(r => r.json());
    const acts = await fetch('/api/activity?limit=60').then(r => r.json()).catch(() => []);
    if (t === 'done') {
      const pubs = acts.filter(a => /^PUBLISHED_/.test(a.action_type || ''));
      el.innerHTML = pubs.length
        ? pubs.map(a => `<div style="font-size:12px;padding:6px 4px;border-bottom:1px solid #1c2430">🚀 ${esc(a.product_code || '')} ${esc(a.v_code || '')} · ${esc(a.action_type.replace('PUBLISHED_', ''))} <small style="opacity:.6">${esc((a.created_at || '').slice(0, 16).replace('T', ' '))}</small></div>`).join('')
        : '<div class="empty-state">ยังไม่มีงานที่ publish</div>';
      return;
    }
    const s = d.jobs_by_status || {};
    const attn = d.attention || [];
    el.innerHTML = `<div style="font-size:13px;margin-bottom:8px">พร้อมลง: <b>${(s.QC_PASSED || 0) + (s.READY_TO_PUBLISH || 0)}</b> · กำลังทำ: <b>${s.IN_PROGRESS || 0}</b> · ต้องดู: <b>${attn.length}</b></div>`
      + (attn.map(a => `<div style="font-size:12px;padding:6px 4px;border-bottom:1px solid #1c2430">⚠ ${esc(a.product_code || '')} ${esc(a.v_code || '')} · ${esc(a.status || '')} <button class="secondary" style="font-size:11px;padding:2px 8px" onclick="pubOpenProduct('${esc(a.product_code || '')}')">เปิด</button></div>`).join('') || '<div class="empty-state">คิวว่าง</div>');
  } catch (e) { el.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}
async function pubOpenProduct(code) {
  if (!code) return;
  setMode('product');
  $('search').value = code;
  await loadProducts();
  const btn = document.querySelector('#products .item:not(.load-more)');
  if (btn && items.length) selectProduct(0, btn);
}
// ---------- history drawer ----------
function addHistoryBtn() {
  try {
    const bar = document.querySelector('#detail .ph-actions');
    if (!bar || bar.querySelector('[data-hist]')) return;
    const b = document.createElement('button');
    b.className = 'secondary'; b.dataset.hist = '1'; b.textContent = '🕘 ประวัติ';
    b.onclick = openHistory;
    bar.appendChild(b);
  } catch {}
}
async function openHistory() {
  const m = $('histDrawer'), b = $('histBody');
  if (!m || !b) return;
  m.classList.add('open');
  const s = $('histScrim'); if (s) s.classList.add('on');
  if (!window.current) { b.innerHTML = '<div class="empty-state">เลือกสินค้าก่อน</div>'; return; }
  b.innerHTML = '<div class="loading">กำลังโหลดประวัติ...</div>';
  try {
    const d = await fetch('/api/job?code=' + encodeURIComponent(window.current['Product Code'] || '')).then(r => r.json());
    if (!d.exists || !d.jobs.length) { b.innerHTML = '<div class="empty-state">สินค้านี้ยังไม่มีงาน</div>'; return; }
    b.innerHTML = d.jobs.map(j => `<div class="box"><div class="box-title"><h3>${esc(j.v_code)} / ${esc(j.s_code || '-')}</h3><span>${esc(j.status)}</span></div>
    <div style="font-size:12px">versions: ${j.versions} (current v${j.current_version}) · ${esc(j.updated_at || '').slice(0, 16).replace('T', ' ')}</div></div>`).join('')
      + `<div class="box"><div class="box-title"><h3>Actions ล่าสุด</h3></div><div style="font-size:12px">${(d.actions || []).slice(0, 15).map(a => `<div>${esc((a.created_at || '').slice(5, 16).replace('T', ' '))} ${esc(a.action_type)}</div>`).join('')}</div></div>`;
  } catch (e) { b.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}
function closeHistory() {
  const m = $('histDrawer'); if (m) m.classList.remove('open');
  const s = $('histScrim'); if (s) s.classList.remove('on');
}
// ---------- global search ----------
let gSearchTimer = null;
function initGlobalSearch() {
  const inp = $('gSearch');
  if (!inp || inp._bound) return;
  inp._bound = true;
  inp.addEventListener('input', () => {
    clearTimeout(gSearchTimer);
    gSearchTimer = setTimeout(globalSearch, 300);
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') $('gResults').hidden = true; });
  document.addEventListener('click', e => {
    if (!e.target.closest || (!e.target.closest('.gsearch') && !e.target.closest('#gResults'))) $('gResults').hidden = true;
  });
}
async function globalSearch() {
  const q = ($('gSearch').value || '').trim();
  const box = $('gResults');
  if (q.length < 2) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<div style="padding:8px;font-size:12px;opacity:.7">กำลังค้นหา...</div>';
  try {
    const [pd, sets, veh] = await Promise.all([
      fetch('/api/products?q=' + encodeURIComponent(q) + '&limit=8').then(r => r.json()).catch(() => ({ products: [] })),
      fetch('/api/sets').then(r => r.json()).catch(() => []),
      fetch('/api/vehicle/search?q=' + encodeURIComponent(q)).then(r => r.json()).catch(() => ({ brands: [], models: [] }))
    ]);
    const plist = Array.isArray(pd) ? pd : (pd.products || []);
    const ssl = (sets || []).filter(s => ((s.set_name || '') + ' ' + (s.vehicle_family || '')).toLowerCase().includes(q.toLowerCase())).slice(0, 4);
    let html = '';
    html += '<div style="font-size:11px;opacity:.6;padding:4px 8px">Products</div>' + (plist.map(p => `<button onclick="gGoProduct('${esc(p['Product Code'] || '')}')">📦 ${esc(p['Product Code'] || '')} ${esc(p['Product Name (TH)'] || '')}</button>`).join('') || '<div style="font-size:12px;opacity:.6;padding:0 8px">—</div>');
    html += '<div style="font-size:11px;opacity:.6;padding:4px 8px">Sets</div>' + (ssl.map(s => `<button onclick="gGoSet(${s.id})">🎬 ${esc(s.set_name || '')}</button>`).join('') || '<div style="font-size:12px;opacity:.6;padding:0 8px">—</div>');
    html += '<div style="font-size:11px;opacity:.6;padding:4px 8px">Vehicles</div>' + (((veh.brands || []).map(b => `<button onclick="gGoVehicle('${esc(b.brand)}','')">🚙 ${esc(b.brand)}</button>`).join('') + (veh.models || []).map(m => `<button onclick="gGoVehicle('${esc(m.brand)}','${esc(m.model)}')">${esc(m.brand)} ${esc(m.model)}</button>`).join('')) || '<div style="font-size:12px;opacity:.6;padding:0 8px">—</div>');
    box.innerHTML = html || '<div style="padding:8px;font-size:12px">ไม่พบ</div>';
  } catch { box.hidden = true; }
}
async function gGoProduct(code) {
  $('gResults').hidden = true; $('gSearch').value = '';
  setMode('product');
  $('search').value = code;
  await loadProducts();
  const btn = document.querySelector('#products .item:not(.load-more)');
  if (btn && items.length) selectProduct(0, btn);
}
async function gGoSet(id) {
  $('gResults').hidden = true; $('gSearch').value = '';
  setMode('set');
  setTimeout(() => openSet(id), 150);
}
async function gGoVehicle(brand, model) {
  $('gResults').hidden = true; $('gSearch').value = '';
  setMode('map');
  setTimeout(() => mapPreselect(brand, model), 150);
}
async function mapPreselect(brand, model) {
  try {
    if (!$('mapBrand').options.length || $('mapBrand').options.length <= 1) await renderMapHome();
    $('mapBrand').value = brand;
    await mapBrandChange();
    if (model) { $('mapModel').value = model; mapFetch(); }
  } catch (e) { showToast(e.message || '', false); }
}
// ---------- smart next bar ----------
async function loadNextBar() {
  const el = $('nextBar');
  if (!el) return;
  try {
    const n = await fetch('/api/next?limit=1').then(r => r.json());
    if (!n.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<span>งานถัดไป: <b>${esc(n[0].product_code)}</b> ${esc(n[0].product_name_th || n[0].product_name_en || '')}</span><button class="secondary" onclick="startNext()">เปิดงาน</button>`;
  } catch { el.hidden = true; }
}
