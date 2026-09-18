// Set Builder engine — campaign composition above products. Pure logic + AI prompt builders.
// NEVER merges SKUs. NEVER moves fitment across products. Set label is title context only.
import { planDurations, loadCapabilities } from './flow.mjs';

const clean = v => String(v ?? '').trim();
export const SET_ROLES = ['PRIMARY', 'PAIR_LH', 'PAIR_RH', 'OPTION', 'SECONDARY'];

function sideOf(code, name) {
  const t = `${clean(code)} ${clean(name)}`;
  if (/[A-Z0-9-]*L\s*\/\s*[A-Z0-9-]*R/i.test(t) || /[A-Z0-9-]*R\s*\/\s*[A-Z0-9-]*L/i.test(t)) return 'PAIR';
  if (/(^|[^A-Z])LH([^A-Z]|$)/.test(t)) return 'LH';
  if (/(^|[^A-Z])RH([^A-Z]|$)/.test(t)) return 'RH';
  const trail = clean(code).match(/\d(L|R)$/);
  if (trail) return trail[1] === 'L' ? 'LH?' : 'RH?';
  const trailNum = clean(code).match(/([LR])\d+$/);
  if (trailNum) return trailNum[1] === 'L' ? 'LH?' : 'RH?';
  return '';
}

function baseCode(code) {
  return clean(code).replace(/\s*\/\s*[A-Z0-9-]*[LR]\s*$/i, '').replace(/(LH|RH)$/, '').replace(/([LR])\d+$/, '$1').replace(/[LR]$/, '').trim();
}

// Auto-group ACTIVE items. Returns [{itemId, group_code, group_name, role}]. User can override.
export function autoGroupItems(items) {
  const act = items.filter(i => (i.status || 'ACTIVE') === 'ACTIVE');
  const out = [];
  const used = new Set();
  // 1) pairs: same base code with L and R variants
  const byBase = new Map();
  for (const it of act) {
    const b = baseCode(it.product_code);
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(it);
  }
  let g = 0;
  for (const [b, list] of byBase) {
    const sides = list.map(it => ({ it, s: sideOf(it.product_code, it.product_name_th || it.product_name_en) }));
    const hasL = sides.some(x => x.s.startsWith('LH'));
    const hasR = sides.some(x => x.s.startsWith('RH'));
    const isPairCode = sides.some(x => x.s === 'PAIR');
    if ((hasL && hasR) || isPairCode || (list.length > 1 && /L.*R|R.*L/.test(list.map(x => x.it.product_code).join(' ')))) {
      g++;
      for (const x of sides) {
        const role = x.s.startsWith('LH') ? 'PAIR_LH' : x.s.startsWith('RH') ? 'PAIR_RH' : 'SECONDARY';
        out.push({ itemId: x.it.id, group_code: 'PAIR-' + g, group_name: 'คู่ซ้าย-ขวา', role });
        used.add(x.it.id);
      }
    }
  }
  // 2) family: housing + lamp in same set (keyword match)
  const rest = act.filter(i => !used.has(i.id));
  const housings = rest.filter(i => /เสื้อ|housing/i.test(`${i.product_code} ${i.product_name_th} ${i.product_name_en}`));
  const lamps = rest.filter(i => !/เสื้อ|housing/i.test(`${i.product_code} ${i.product_name_th} ${i.product_name_en}`) && /ไฟ|lamp|light/i.test(`${i.product_code} ${i.product_name_th} ${i.product_name_en}`));
  if (housings.length && lamps.length) {
    g++;
    for (const h of housings.slice(0, 4)) { out.push({ itemId: h.id, group_code: 'FAMILY-' + g, group_name: 'เสื้อ+ไฟ', role: 'PRIMARY' }); used.add(h.id); }
    for (const l of lamps.slice(0, 4)) {
      if (used.has(l.id)) continue;
      out.push({ itemId: l.id, group_code: 'FAMILY-' + g, group_name: 'เสื้อ+ไฟ', role: 'SECONDARY' }); used.add(l.id);
    }
  }
  // 3) options: same base name with variants (e.g. กระจก 3/5/7 สาย)
  const rest2 = act.filter(i => !used.has(i.id));
  const byName = new Map();
  for (const it of rest2) {
    const key = clean(it.product_name_th || it.product_name_en).replace(/[\d\/\-สายwire\s]+$/i, '').trim() || it.product_code;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(it);
  }
  for (const [key, list] of byName) {
    if (list.length > 1) {
      g++;
      for (const it of list) { out.push({ itemId: it.id, group_code: 'OPT-' + g, group_name: 'ตัวเลือก: ' + key.slice(0, 24), role: 'OPTION' }); used.add(it.id); }
    }
  }
  for (const it of act) {
    if (!used.has(it.id)) out.push({ itemId: it.id, group_code: '', group_name: '', role: 'SECONDARY' });
  }
  return out;
}

// Storyboard: intro + group scenes + final, fitted to model durations.
export function buildSetPlan({ set, items, sheets = {}, totalSecs = 30, modelKey = 'gemini-omni-flash' }) {
  const act = items.filter(i => (i.status || 'ACTIVE') === 'ACTIVE');
  if (!act.length) throw new Error('Set ไม่มีสินค้า');
  const plan = planDurations(totalSecs, modelKey);
  // order groups: family, pairs, options, secondary
  const groups = new Map();
  for (const it of act) {
    const gk = it.group_code || ('SINGLE-' + it.id);
    if (!groups.has(gk)) groups.set(gk, { code: it.group_code, name: it.group_name, items: [] });
    groups.get(gk).items.push(it);
  }
  const rank = g => /^FAMILY/i.test(g.code) ? 0 : /^PAIR/i.test(g.code) ? 1 : /^OPT/i.test(g.code) ? 2 : 3;
  const ordered = [...groups.values()].sort((a, b) => rank(a) - rank(b));
  // scene defs: intro + groups + final
  let defs = [{ kind: 'intro', title: 'SET INTRO', items: [] }];
  for (const gr of ordered) defs.push({ kind: gr.code?.startsWith('PAIR') ? 'pair' : gr.code?.startsWith('FAMILY') ? 'family' : gr.code?.startsWith('OPT') ? 'options' : 'secondary', title: gr.name || 'สินค้า', items: gr.items });
  defs.push({ kind: 'final', title: 'FINAL OVERVIEW', items: act });
  // fit scene count to plan segments
  let segs = [...plan.segments];
  while (defs.length > segs.length && defs.length > 2) {
    // merge smallest non-intro/final group scene into a NEIGHBORING group scene (never into intro/final)
    let mi = -1;
    for (let i = defs.length - 2; i >= 1; i--) {
      if (defs[i].kind !== 'intro' && defs[i].kind !== 'final' && (mi < 0 || defs[i].items.length < defs[mi].items.length)) mi = i;
    }
    if (mi < 0) break;
    const fwd = defs[mi + 1] && defs[mi + 1].kind !== 'intro' && defs[mi + 1].kind !== 'final';
    const back = defs[mi - 1] && defs[mi - 1].kind !== 'intro' && defs[mi - 1].kind !== 'final';
    if (fwd && (!back || defs[mi + 1].items.length <= defs[mi - 1].items.length)) {
      defs[mi + 1].items.unshift(...defs[mi].items);
      defs[mi + 1].title = defs[mi].title + ' + ' + defs[mi + 1].title;
    } else if (back) {
      defs[mi - 1].items.push(...defs[mi].items);
      defs[mi - 1].title += ' + ' + defs[mi].title;
    } else break;
    defs.splice(mi, 1);
  }
  while (defs.length < segs.length) {
    // split largest group scene
    let mi = -1;
    for (let i = 1; i < defs.length - 1; i++) {
      if (defs[i].items.length > 1 && (mi < 0 || defs[i].items.length > defs[mi].items.length)) mi = i;
    }
    if (mi < 0) break;
    const half = Math.ceil(defs[mi].items.length / 2);
    const tail = defs[mi].items.splice(half);
    defs.splice(mi + 1, 0, { ...defs[mi], title: defs[mi].title + ' (ต่อ)', items: tail });
  }
  const scenes = defs.map((d, i) => {
    const n = i + 1;
    const id = 'SC' + String(n).padStart(2, '0');
    const dur = segs[i] !== undefined ? segs[i] : segs[segs.length - 1];
    return {
      id, duration: dur + 's', seconds: dur, kind: d.kind, title: d.title,
      product_ids: d.items.map(x => x.product_id),
      product_codes: d.items.map(x => x.product_code),
      reference_images: d.items.map(x => x.main_image_url).filter(Boolean).slice(0, 3),
      start_source: i === 0 ? 'SET INTRO card' : `SC${String(n - 1).padStart(2, '0')} final frame`,
      end_goal: i === defs.length - 1 ? 'final set hero' : 'clean handoff',
      continuity: i === 0 ? 'set title context only' : 'same product geometry from references',
      risk: '', qc: ''
    };
  });
  return {
    set_id: set.id, set_code: set.set_code, vehicle_family: set.vehicle_family,
    total_requested: plan.requested + 's', planned_total: plan.planned_total + 's',
    remainder: plan.remainder ? plan.remainder + 's' : '0s',
    model: plan.model, modelLabel: plan.modelLabel, generations: scenes.length,
    scenes, sheet_versions: Object.fromEntries(Object.entries(sheets).map(([c, s]) => [c, s ? `v${s.version_number}/${s.status}` : 'none']))
  };
}

export function buildScenePrompt({ set, scene, sheetBlocks = {}, fitments = {} }) {
  const prodList = scene.product_codes.map(c => {
    const f = fitments[c];
    return `- ${c}${f ? ` (fitment: ${f})` : ' (fitment: per own SKU only)'}`;
  }).join('\n');
  const identities = scene.product_codes.map((c, idx) => {
    const b = sheetBlocks[c];
    return `PRODUCT ${String.fromCharCode(65 + idx)}:\n${c}\n${b ? String(b).slice(0, 1200) : '[identity: use attached reference, no invention]'}`;
  }).join('\n\n');
  return `SET CONTEXT (title only, NOT fitment): "${set.set_name}"${set.vehicle_family ? ` — ${set.vehicle_family}` : ''}. This label must never be used as compatibility for any product.
SCENE: ${scene.id} ${scene.title} (${scene.duration}).
PURPOSE: ${scene.kind}.

PRODUCT LIST (each keeps its OWN verified fitment):
${prodList || '(intro/final — no single product focus)'}

PRODUCT SHEET REFERENCES (authoritative identity per SKU):
${identities || 'none — use attached references only'}

CAMERA: slow, controlled product videography; reference-first framing.
ACTION: ${scene.kind === 'intro' ? 'present set title card, then reveal first product' : scene.kind === 'final' ? 'balanced overview of all set products' : 'showcase listed products in order'}.
CONTINUITY: ${scene.continuity}. Start: ${scene.start_source}. End: ${scene.end_goal}.

NEGATIVE LOCK: never merge SKUs; never mirror LH to fake RH; never move fitment across products; no invented specs, prices, compatibility, text, logos, QR; text-safe area for post.`;
}

export function qcSetPlan({ set, items, plan, prompts = {} }) {
  const issues = [];
  const fail = (scope, problem, fix) => issues.push({ scope, problem, fix, level: 'FAIL' });
  const act = items.filter(i => (i.status || 'ACTIVE') === 'ACTIVE');
  for (const it of act) {
    if (!clean(it.product_code)) fail(it.id, 'สินค้าไม่มี code', 'ลบออกหรือใส่ code');
    if (!clean(it.main_image_url)) fail(it.product_code, 'ไม่มีรูป WDI', 'ซิงค์รูปก่อน');
  }
  const covered = new Set();
  for (const sc of plan.scenes || []) for (const c of sc.product_codes || []) covered.add(c);
  for (const it of act) {
    if (!covered.has(it.product_code)) fail(it.product_code, 'หลุดจาก storyboard', 'เพิ่มเข้า scene');
  }
  const seen = {};
  for (const sc of plan.scenes || []) {
    if (sc.kind === 'final') continue;
    for (const c of sc.product_codes || []) {
      seen[c] = (seen[c] || 0) + 1;
      if (seen[c] > 1) fail(c, `ซ้ำใน ${sc.id} (ซ้ำได้เฉพาะ final)`, 'เอาออกเหลือ scene เดียว');
    }
  }
  const vf = clean(set.vehicle_family);
  if (vf) {
    const claimRe = /(ใส่ได้|รองรับ|ใช้ได้กับ|เหมาะกับ|compatible|fits?\s+(with|for)?)/i;
    for (const sc of plan.scenes || []) {
      if (sc.kind === 'intro' || sc.kind === 'final') continue;
      const t = `${prompts[sc.id] || ''}`;
      if (t.includes(vf) && claimRe.test(t)) fail(sc.id, `เอา "${vf}" ไปเคลม fitment`, 'Set label เป็นได้แค่ title context');
    }
  }
  for (const it of act) {
    if (!clean(it.fitment_text)) fail(it.product_code, 'ไม่มี fitment text', 'ห้ามเคลมรุ่นรถให้ตัวนี้');
  }
  let caps = plan._caps || [];
  if (!caps.length) {
    try {
      const all = loadCapabilities();
      const key = Object.keys(all.models).find(k => k === plan.model) || all.defaultModel;
      caps = (all.models[key] || {}).durations || [];
    } catch {}
  }
  for (const sc of plan.scenes || []) {
    const d = parseInt(sc.seconds);
    if (caps.length && !caps.includes(d)) fail(sc.id, `duration ${d}s ไม่อยู่ใน capability`, 'แก้ตาม model');
  }
  return { status: issues.length ? 'NOT_READY' : 'READY', issues };
}

export function parseCampaignTSV(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    const cells = line.split(/\t|;/).map(s => s.trim());
    if (cells.length < 3 || !cells[2]) continue;
    if (/set\s*no|vehicle|product\s*code/i.test(cells.join(' ')) && /set/i.test(cells[0])) continue;
    rows.push({ set_no: cells[0], vehicle: cells[1], code: cells[2], name: cells[3] || '' });
  }
  return rows;
}
