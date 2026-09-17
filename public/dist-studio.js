// Content Distribution Studio — new UI (legacy ad-features.js untouched).
// Flow: PRODUCT TRUTH → SHEET → ANGLE → PLATFORM RULES → GENERATE → QA → COPY.
const DIST_PLATS = {
  facebook: { name: 'Facebook', fields: ['hook', 'body', 'details', 'cta', 'hashtags'] },
  tiktok: { name: 'TikTok', fields: ['hook', 'caption', 'search_keywords', 'hashtags'] },
  instagram: { name: 'Instagram', fields: ['hook', 'caption', 'cta', 'hashtags'] },
  line: { name: 'LINE OA', fields: ['headline', 'body', 'cta'] },
  shopee: { name: 'Shopee', fields: ['title', 'short_description', 'key_features', 'specifications', 'search_keywords'] }
};
const DIST_ANGLES = [['A', 'แนะนำสินค้า'], ['B', 'เน้นจุดเด่น'], ['C', 'เริ่มจากปัญหา'], ['D', 'รุ่นรถ/เลือกสินค้า'], ['E', 'เปรียบเทียบ'], ['F', 'FAQ'], ['G', 'เน้นขาย'], ['H', 'แคมเปญ']];
let distTab = 'content', distPlat = 'facebook', distEditing = false;

function openDistStudio() {
  if (!current) { showToast('เลือกสินค้าก่อน', false); return; }
  if (!window._dist || window._dist.code !== current['Product Code']) {
    window._dist = { code: current['Product Code'], angle: 'A', plan: null, versions: [], ab: null };
  }
  distTab = 'content';
  renderDistStudio();
}
function distCatCode() { return (($('catCode') || {}).value || selectedCatCode || ''); }

function renderDistStudio() {
  const o = $('output'), st = window._dist;
  const p = current, sheet = window.lastSheet;
  const platTabs = Object.entries(DIST_PLATS).map(([k, v]) => {
    const dot = st.plan ? distPlatDot(k) : '○';
    return `<button class="secondary" style="${k === distPlat ? 'border-color:#ffd76a;color:#ffd76a' : ''}" onclick="distSwitchPlat('${k}')">${dot} ${v.name}</button>`;
  }).join('');
  o.innerHTML = `<section class="result"><div class="result-head"><div><h2>Content Distribution Studio</h2>
  <small class="result-sub">สร้างข้อความพร้อมโพสต์จากข้อมูลสินค้าจริง โดยปรับรูปแบบให้เหมาะกับแต่ละแพลตฟอร์ม</small></div>
  <div style="display:flex;gap:7px"><button class="secondary ${distTab === 'content' ? '' : ''}" onclick="distSwitchTab('content')">Content</button><button class="secondary" onclick="distSwitchTab('publishing')">Publishing</button><button class="secondary" onclick="distSwitchTab('poster')">Poster</button></div></div>
  <div id="distBody"></div></section>`;
  if (distTab === 'publishing') { renderDistPublishing(); return; }
  if (distTab === 'poster') { renderAdPoster(); return; }
  const sheetOk = sheet && sheet.status === 'VERIFIED';
  $('distBody').innerHTML = `
  <div class="box"><div class="box-title"><h3>${esc(p['Product Code'] || '')} · ${esc(p['Product Name (TH)'] || p['Product Name (EN)'] || '')}</h3></div>
  <div style="font-size:12px">C ${esc(distCatCode() || '-')} · ${sheetOk ? '✓ Product Truth Ready · ✓ Sheet Verified' : '⚠ Sheet ' + esc((sheet || {}).status || '?') + ' — <a href="#" onclick="openSheetDrawer();return false">ตรวจ Sheet</a>'}</div></div>
  <h3>🎯 มุมขาย (Content Angle)</h3>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${DIST_ANGLES.map(([c, t]) => `<button class="secondary" style="${st.angle === c ? 'border-color:#ffd76a;color:#ffd76a' : ''}" onclick="distSetAngle('${c}')">${c} ${t}</button>`).join('')}</div>
  <div style="display:flex;gap:6px;margin-bottom:12px"><button class="generate" onclick="distGenerate(this)">✨ Generate ทุกแพลตฟอร์ม</button><button class="secondary" onclick="distAB()">สร้าง 2 มุมขาย (A/B)</button></div>
  <div id="distAB"></div><div id="distPlan"></div>`;
  if (st.plan) renderDistPlan();
}
function distPlatDot(k) {
  const st = window._dist; if (!st.plan) return '○';
  const iss = ((st.plan.qa || {}).issues || []).filter(i => i.platform === k || i.platform === 'all');
  return iss.length ? '◐' : '✓';
}
function distSwitchTab(t) { distTab = t; renderDistStudio(); }
function distSwitchPlat(k) { distPlat = k; distEditing = false; renderDistPlan(); }
function distSetAngle(c) { window._dist.angle = c; renderDistStudio(); }

async function distGenerate(btn, platforms, angleOv) {
  const st = window._dist; if (!st) return;
  const angle = angleOv || st.angle;
  const body = $('distPlan');
  if (btn) { btn.disabled = true; }
  if (body) body.innerHTML = '<div class="loading">กำลังสร้าง content ตามมุมขาย + กฎแต่ละแพลตฟอร์ม...</div>';
  try {
    const r = await fetch('/api/content-distribution', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: current, categoryCode: distCatCode(), angle, platforms }) }).then(r => r.json());
    if (!r.ok && !r.plan) throw new Error(r.error || 'สร้างไม่สำเร็จ');
    st.plan = r.plan; st.versions = r.versions || [];
    renderDistPlan(); loadDashboard();
  } catch (e) { if (body) body.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
  finally { if (btn) btn.disabled = false; }
}

function distFieldText(k, f, v) {
  if (Array.isArray(v)) return v.join('\n');
  return v || '';
}
function renderDistPlan() {
  const st = window._dist, el = $('distPlan');
  if (!el || !st.plan) return;
  const P = st.plan, body = P.platforms[distPlat] || {};
  const platTabs = Object.entries(DIST_PLATS).map(([k, v]) => `<button class="secondary" style="${k === distPlat ? 'border-color:#ffd76a;color:#ffd76a' : ''}" onclick="distSwitchPlat('${k}')">${distPlatDot(k)} ${v.name}</button>`).join('');
  const ver = (st.versions || []).find(v => v.platform === distPlat);
  const fields = DIST_PLATS[distPlat].fields.map(f => {
    const v = body[f];
    const shown = distEditing
      ? `<textarea data-df="${f}" style="width:100%;min-height:64px;background:#0a0e15;color:#fff;border:1px solid #303744;border-radius:8px;padding:8px">${esc(distFieldText(distPlat, f, v))}</textarea>`
      : `<div class="out" style="white-space:pre-wrap">${esc(distFieldText(distPlat, f, v)) || '<span style="opacity:.5">—</span>'}</div>`;
    return `<div class="box"><div class="box-title"><h3>${esc(f)}</h3><button onclick="distCopyField('${f}',this)">Copy</button></div>${shown}</div>`;
  }).join('');
  const qa = P.qa || {}, score = P.score || {};
  const qaHtml = `<div class="qa-box ${qa.status === 'PASS' ? 'qa-pass' : 'qa-review'}"><b>${qa.status === 'PASS' ? '✅ READY' : '⚠ ต้องตรวจ'} · ${score.total || 0}/100</b>${(qa.issues || []).slice(0, 8).map(x => `<div>✕ [${esc(x.platform)}] ${esc(x.problem)} → ${esc(x.fix)}</div>`).join('')}</div>`;
  el.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">${platTabs}</div>${qaHtml}${fields}
  <div class="box"><div class="box-title"><h3>📦 Facts / CTA / Tags</h3></div>
  <div style="font-size:12px;line-height:1.9">Facts: ${esc((P.facts?.verified || []).map(f => f.label + '=' + f.value).join(' · '))}<br>Hashtags: ${esc(((P.hashtags || {})[distPlat] || []).join(' '))}<br>Keywords: ${esc(Object.values(P.keywords || {}).flat().join(', '))}</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="secondary" onclick="distCopy('caption',this)">Copy Caption</button><button class="secondary" onclick="distCopy('facts',this)">Copy Facts</button><button class="secondary" onclick="distCopy('cta',this)">Copy CTA</button><button class="secondary" onclick="distCopy('tags',this)">Copy Hashtags</button><button class="secondary" onclick="distCopy('kw',this)">Copy Keywords</button></div></div>
  <div class="box"><div class="box-title"><h3>🛠 Rewrite / Version / Publish</h3><span>v${ver ? ver.version : 1} · ${esc(ver ? ver.status : 'DRAFT')}</span></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap">${['สั้นลง', 'อ่านง่าย', 'เน้นขาย', 'เน้น SEO', 'เน้น Hook', 'ลด emoji'].map(x => `<button class="secondary" onclick="distRewrite('${x}',this)">${x}</button>`).join('')}
  <button class="secondary" onclick="distToggleEdit(this)">${distEditing ? 'Save (mark DRAFT)' : 'Edit'}</button>
  <button class="secondary" onclick="distRefreshQA()">ตรวจ QA ใหม่</button>
  <button class="secondary" onclick="distRegen(this)">Regenerate แพลตฟอร์มนี้</button>
  <button class="secondary" onclick="distHistory(this)">ดูประวัติ</button>
  <button class="secondary" onclick="distPublish(this)">Mark Published</button></div>
  <div id="distHist" style="font-size:12px;margin-top:6px"></div></div>
  <div style="margin-top:10px"><button class="secondary" onclick="distCopyAll(this)">Copy All Platforms</button></div>
  <div style="margin-top:10px">${distPreview(distPlat, body)}</div>`;
}
function distPreview(k, body) {
  const img = current && current['Main Image URL'] ? `<img src="${esc(imageUrl(current['Main Image URL']))}" style="width:100%;border-radius:8px" loading="lazy">` : '';
  const name = esc(current ? (current['Product Name (TH)'] || current['Product Name (EN)'] || '') : '');
  const j = a => esc((a || []).join(' '));
  if (k === 'facebook') return `<div class="box"><div class="box-title"><h3>Preview · Facebook</h3></div><div style="border:1px solid #2b3441;border-radius:10px;padding:10px"><b>💎 DIAMOND · ไฟตราเพชร</b> <small style="opacity:.6">· เพิ่งโพสต์</small><p style="white-space:pre-wrap">${esc(body.hook || '')}\n\n${esc(body.body || '')}</p>${img}<p style="white-space:pre-wrap;opacity:.85">${esc(body.details || '')}</p><p>${esc(body.cta || '')}</p><p style="color:#7fa8d8">${j(body.hashtags)}</p></div></div>`;
  if (k === 'instagram') return `<div class="box"><div class="box-title"><h3>Preview · Instagram</h3></div><div style="border:1px solid #2b3441;border-radius:10px;padding:10px;max-width:380px">${img}<p style="white-space:pre-wrap">${esc(body.hook || '')}\n${esc(body.caption || '')}</p><p>${esc(body.cta || '')}</p><p style="color:#7fa8d8">${j(body.hashtags)}</p></div></div>`;
  if (k === 'tiktok') return `<div class="box"><div class="box-title"><h3>Preview · TikTok</h3></div><div style="border:1px solid #2b3441;border-radius:10px;padding:10px;background:#0a0a0c;max-width:340px"><b>${esc(body.hook || '')}</b><p style="white-space:pre-wrap">${esc(body.caption || '')}</p><p style="opacity:.7">🔍 ${esc((body.search_keywords || []).join(' · '))}</p><p style="opacity:.8">${j(body.hashtags)}</p></div></div>`;
  if (k === 'line') return `<div class="box"><div class="box-title"><h3>Preview · LINE</h3></div><div style="max-width:340px"><div style="background:#06c755;color:#06281a;border-radius:12px;padding:10px 12px;margin-bottom:6px"><b>${esc(body.headline || '')}</b><br>${esc(body.body || '')}</div><div style="background:#1c2532;border-radius:12px;padding:10px 12px">${esc(body.cta || '')}<br><small style="opacity:.7">wdi.co.th · @017cuovn · 089 177 7464</small></div></div></div>`;
  const sp = body;
  return `<div class="box"><div class="box-title"><h3>Preview · Shopee</h3></div><div style="border:1px solid #2b3441;border-radius:10px;padding:10px;display:flex;gap:10px"><div style="width:120px;flex:none">${img}</div><div><b>${esc(sp.title || '')}</b><p style="white-space:pre-wrap;font-size:12px">${esc(sp.short_description || '')}</p><ul style="font-size:12px;padding-left:18px">${(sp.key_features || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul></div></div></div>`;
}
function distCaptionText() {
  const P = window._dist.plan, b = P.platforms[distPlat] || {};
  if (distPlat === 'shopee') return [b.title, b.short_description, (b.key_features || []).join('\n'), (b.specifications || []).join('\n')].filter(Boolean).join('\n\n');
  return [b.hook || b.headline, b.body || b.caption, b.details, b.cta, (b.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
}
function distCopy(what, btn) {
  const P = window._dist.plan; if (!P) return;
  const b = P.platforms[distPlat] || {};
  const map = {
    caption: distCaptionText(),
    facts: (P.facts?.verified || []).map(f => f.label + ': ' + f.value).join('\n'),
    cta: b.cta || '',
    tags: ((P.hashtags || {})[distPlat] || []).join(' '),
    kw: Object.values(P.keywords || {}).flat().join(', ')
  };
  copyText(map[what] || '', btn);
}
function distCopyField(f, btn) {
  const b = (window._dist.plan.platforms[distPlat] || {});
  copyText(distFieldText(distPlat, f, b[f]), btn);
}
function distCopyAll(btn) {
  const P = window._dist.plan; if (!P) return;
  const parts = Object.keys(DIST_PLATS).map(k => {
    const b = P.platforms[k] || {};
    const txt = DIST_PLATS[k].fields.map(f => distFieldText(k, f, b[f])).filter(Boolean).join('\n\n');
    return `=== ${k.toUpperCase()} ===\n${txt}`;
  });
  copyText(parts.join('\n\n---\n\n'), btn);
}
async function distToggleEdit(btn) {
  if (distEditing) {
    document.querySelectorAll('[data-df]').forEach(t => {
      const f = t.dataset.df; let v = t.value;
      const b = window._dist.plan.platforms[distPlat];
      b[f] = (f === 'hashtags' || f === 'search_keywords' || f === 'key_features' || f === 'specifications') ? v.split('\n').map(s => s.trim()).filter(Boolean) : v;
    });
    distEditing = false;
    const st = window._dist;
    const ver = (st.versions || []).find(v => v.platform === distPlat);
    if (ver) { await fetch('/api/content-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ver.id, status: 'DRAFT' }) }); ver.status = 'DRAFT'; }
    showToast('บันทึกฉบับแก้ (DRAFT) — กดตรวจ QA ใหม่');
  } else distEditing = true;
  renderDistPlan();
}
async function distReQA(btn) { await distRefreshQA(); }
async function distRefreshQA() {
  const st = window._dist; if (!st || !st.plan) return;
  const r = await fetch('/api/content-qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: st.plan, product: current }) }).then(r => r.json());
  st.plan.qa = r.qa; st.plan.score = r.score; renderDistPlan();
}
async function distRegen(btn) { await distGenerate(btn, [distPlat]); }
async function distHistory(btn) {
  const st = window._dist;
  const h = await fetch(`/api/content-history?code=${encodeURIComponent(st.code)}&platform=${distPlat}&angle=${st.angle}`).then(r => r.json()).catch(() => []);
  const el = $('distHist');
  if (el) el.innerHTML = 'ประวัติ: ' + ((h || []).map(v => `v${v.version} (${v.score}คะแนน, ${v.status})`).join(' · ') || '—');
}
async function distPublish(btn) {
  const st = window._dist;
  const ver = (st.versions || []).find(v => v.platform === distPlat);
  if (!ver) return showToast('ไม่มี version', false);
  await fetch('/api/content-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ver.id, status: 'PUBLISHED' }) });
  ver.status = 'PUBLISHED'; showToast(distPlat + ' → Published ✓'); renderDistPlan();
}
async function distRewrite(label, btn) {
  const map = { 'สั้นลง': 'shorten to half length', 'อ่านง่าย': 'simpler sentences', 'เน้นขาย': 'stronger sales push with CTA', 'เน้น SEO': 'add searchable keywords naturally', 'เน้น Hook': 'stronger first-line hook', 'ลด emoji': 'remove all emoji' };
  const st = window._dist;
  const b = st.plan.platforms[distPlat] || {};
  const mainF = DIST_PLATS[distPlat].fields.find(f => !Array.isArray(b[f])) || DIST_PLATS[distPlat].fields[0];
  btn.disabled = true;
  try {
    const r = await fetch('/api/content-rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: distPlat, text: distFieldText(distPlat, mainF, b[mainF]), instruction: map[label] || label, product: current }) }).then(r => r.json());
    if (r.error || !r.text) throw new Error(r.error || 'rewrite ไม่สำเร็จ');
    b[mainF] = r.text;
    const ver = (st.versions || []).find(v => v.platform === distPlat);
    if (ver) { await fetch('/api/content-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ver.id, status: 'DRAFT' }) }); }
    showToast('Rewrite แล้ว (DRAFT) — ตรวจ QA ก่อนใช้');
    renderDistPlan(); distRefreshQA();
  } catch (e) { showToast(e.message || '', false); }
  finally { btn.disabled = false; }
}
async function distAB() {
  const st = window._dist;
  const other = st.angle === 'C' ? 'B' : 'C';
  const el = $('distAB');
  el.innerHTML = '<div class="loading">กำลังสร้างมุมที่สองเพื่อเทียบ...</div>';
  try {
    const r = await fetch('/api/content-distribution', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: current, categoryCode: distCatCode(), angle: other }) }).then(r => r.json());
    if (!r.plan) throw new Error(r.error || '');
    st.ab = { angle: other, plan: r.plan };
    const A = st.plan ? 'ปัจจุบัน (' + st.angle + ')' : '—';
    el.innerHTML = `<div class="box"><div class="box-title"><h3>A/B: ${st.angle} vs ${other}</h3><span><button class="secondary" onclick="distUseAB('a')">ใช้ ${st.angle}</button> <button class="secondary" onclick="distUseAB('b')">ใช้ ${other}</button></span></div>
    <div style="font-size:12px">A (${st.angle}): score ${st.plan ? st.plan.score.total : '—'} · B (${other}): score ${r.plan.score.total} · ${esc((r.plan.platforms.facebook || {}).hook || '')}</div></div>`;
  } catch (e) { el.innerHTML = `<div class="error">${esc(e.message || '')}</div>`; }
}
function distUseAB(which) {
  const st = window._dist;
  if (which === 'b' && st.ab) { st.angle = st.ab.angle; st.plan = st.ab.plan; }
  st.ab = null; $('distAB').innerHTML = ''; renderDistStudio();
}
function renderDistPublishing() {
  const el = $('distBody');
  el.innerHTML = `<div class="box"><div class="box-title"><h3>📅 Publishing</h3></div><div id="distCal"></div></div>
  <div class="box"><div class="box-title"><h3>🔌 n8n</h3></div><div style="font-size:12px">Webhook: <code>${esc(typeof n8nWebhookBase === 'function' ? n8nWebhookBase() : '')}</code></div></div>`;
  try {
    const cal = $('distCal');
    const tmp = document.createElement('div'); tmp.id = 'adTabBody'; cal.appendChild(tmp);
    renderCalendar();
  } catch (e) { $('distCal').innerHTML = 'เปิด calendar ไม่สำเร็จ'; }
}
