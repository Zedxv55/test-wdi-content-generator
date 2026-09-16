// Product Sheet Builder — deterministic, evidence-based, category-aware.
// NEVER invents facts. Anything unverifiable => [NOT_VERIFIED].
// Visual detail beyond text evidence stays image-referenced, not hallucinated.
import crypto from 'node:crypto';
import {
  getProductRow, getCurrentSheet, saveSheetVersion,
  addSheetRefs, logSheetAction, initDb, now
} from './db.mjs';

export const NV = '[NOT_VERIFIED]';
export const BUILDER_V = '5';
const clean = v => String(v ?? '').trim();

function shade(root) {
  const d = initDb();
  let prod = getProductRow(root.code);
  if (!prod) {
    const r = d.prepare('INSERT INTO products (product_code,synced_at) VALUES (?,?)').run(root.code, now());
    prod = { id: Number(r.lastInsertRowid), product_code: root.code };
  }
  return prod;
}

// ---- field extractors (return {value, evidence} or null) ----
function fromDesc(p, re) {
  const t = `${clean(p['Description (EN)'])} \n ${clean(p['Description (TH)'])}`;
  const m = t.match(re);
  return m ? { value: clean(m[1] || m[0]), evidence: 'description' } : null;
}
const X = {
  lens: p => fromDesc(p, /lens\s*[:：]\s*([^\n,;]+)/i) || fromDesc(p, /เลนส์\s*([^\n,;\s][^\n,;]{0,28})/),
  base: p => fromDesc(p, /(?:base|แป้น)\s*[:：]\s*([^\n,;]+)/i),
  bulb: p => fromDesc(p, /bulb\s*[:：]\s*([^\n,;]+)/i) || fromDesc(p, /((?:H\d{1,2}|LED|T\d+)[^\n,;]{0,24})/i) || fromDesc(p, /(หลอด\s*[A-Z0-9ก-๙]+[^\n,;]{0,16})/) || (() => {
    const t = `${clean(p['Product Code'])} ${clean(p['Product Name (TH)'])} ${clean(p['Product Name (EN)'])}`;
    const m = t.match(/\(No ([^)]+)\)/) || t.match(/\bNo Bulb\b/i);
    return m ? { value: m[1] ? 'No ' + clean(m[1]) + ' (not included)' : 'No Bulb (not included)', evidence: 'name' } : null;
  })(),
  not_included: p => fromDesc(p, /ไม่รวม([^\n,;]{1,30})/) || (() => {
    const t = `${clean(p['Product Name (EN)'])} ${clean(p['Description (EN)'])}`;
    const m = t.match(/\(No ([^)]+)\)/);
    return m ? { value: clean(m[1]), evidence: 'name' } : null;
  })(),
  voltage: p => fromDesc(p, /(\d{1,2}\s*V(?:\s*or\s*\d{1,2}\s*V)?)/i),
  wires: p => fromDesc(p, /(\d+\s*(?:wires?|สาย))/i),
  steering: p => {
    const t = `${clean(p['Description (TH)'])} ${clean(p['Description (EN)'])}`;
    if (/พวงมาลัยขวา|RHD/i.test(t)) return { value: 'RHD (พวงมาลัยขวา)', evidence: 'description' };
    if (/พวงมาลัยซ้าย|LHD/i.test(t)) return { value: 'LHD (พวงมาลัยซ้าย)', evidence: 'description' };
    return null;
  },
  side: p => {
    const t = `${clean(p['Product Code'])} ${clean(p['Product Name (TH)'])} ${clean(p['Product Name (EN)'])}`;
    if (/คู่|\bpair\b/i.test(t)) return { value: 'Pair (LH+RH)', evidence: 'name' };
    if (/[A-Z0-9-]*L\s*\/\s*[A-Z0-9-]*R/i.test(t)) return { value: 'Pair (LH+RH)', evidence: 'name' };
    let m = t.match(/(^|[^A-Z])(LH|RH)([^A-Z]|$)/);
    if (m) return { value: m[2], evidence: 'code' };
    m = t.match(/[\s\-_\/](L|R)\s*$/);
    if (m) return { value: m[1] === 'L' ? 'LH?' : 'RH?', evidence: 'code' };
    m = t.match(/\d(L|R)$/);
    if (m) return { value: m[1] === 'L' ? 'LH?' : 'RH?', evidence: 'code' };
    if (/ข้างซ้าย/.test(t)) return { value: 'LH?', evidence: 'name' };
    if (/ข้างขวา/.test(t)) return { value: 'RH?', evidence: 'name' };
    return null;
  }
};

// ---- category component schemas: [key, label, extractorName|null] ----
export const CATEGORY_COMPONENTS = {
  C01: [['lens', 'เลนส์', 'lens'], ['housing', 'โคม/ตัวเรือน', null], ['reflector_projector', 'รีเฟลกเตอร์/โปรเจกเตอร์', null], ['bulb_socket', 'ขั้วหลอด', 'bulb'], ['adjuster', 'ตัวปรับตั้ง', null], ['connector', 'คอนเนกเตอร์', null], ['mounting_tabs', 'จุดยึด/ติ่ง', null], ['side', 'ฝั่ง L/R', 'side']],
  C02: [['lens', 'เลนส์', 'lens'], ['housing', 'โคม/ตัวเรือน', null], ['reflector', 'รีเฟลกเตอร์', null], ['lamp_sections', 'ช่องไฟ', null], ['connector', 'คอนเนกเตอร์', null], ['mounting', 'จุดยึด', null], ['side', 'ฝั่ง L/R', 'side']],
  C03: [['housing_body', 'ตัวเสื้อ', null], ['lens_opening', 'ช่องเลนส์', null], ['reflector_area', 'พื้นที่รีเฟลกเตอร์', null], ['trim', 'ขอบ/คิ้ว', null], ['mounting', 'จุดยึด', null], ['side', 'ฝั่ง L/R', 'side']],
  C04: [['lens_color', 'สีเลนส์', null], ['housing', 'ตัวเรือน', null], ['bulb_led_area', 'บริเวณหลอด/LED', 'bulb'], ['connector', 'คอนเนกเตอร์', null], ['mounting', 'จุดยึด', null]],
  C05: [['reflector_shape', 'รูปทรงทับทิม', null], ['color', 'สี', null], ['mounting', 'จุดยึด', null], ['housing', 'ฐาน', null]],
  C06: [['mirror_shell', 'ตัวเรือนกระจก', null], ['glass', 'เนื้อกระจก', null], ['signal_lamp', 'ไฟสัญญาณ', null], ['adjust_fold', 'ระบบปรับ/พับ', null], ['wires', 'สายไฟ', 'wires'], ['connector', 'คอนเนกเตอร์', null], ['mounting', 'จุดยึด', null], ['side', 'ฝั่ง L/R', 'side']],
  C07: [['pair_relationship', 'ความสัมพันธ์คู่', null], ['lh_identity', 'ฝั่งซ้าย (LH)', null], ['rh_identity', 'ฝั่งขวา (RH)', null], ['visual_differences', 'จุดต่างที่มองเห็น', null], ['shared_components', 'ชิ้นส่วนร่วม', null]],
  C08: [['product_a_housing', 'ชิ้น A — เสื้อ', null], ['product_b_lamp', 'ชิ้น B — ไฟ', null], ['ab_relationship', 'ความสัมพันธ์ A/B', null]],
  C09: [['visible_parts', 'ชิ้นส่วนที่มองเห็น', null], ['color', 'สี', null], ['material', 'วัสดุ', null], ['mounting', 'จุดยึด', null]],
  GARMENT: [['silhouette', 'ทรงเสื้อ', null], ['collar', 'ปก/คอ', null], ['sleeves', 'แขนเสื้อ', null], ['print', 'ลายพิมพ์', null], ['logo', 'โลโก้', null], ['fabric', 'เนื้อผ้า', null], ['hem', 'ชายเสื้อ', null], ['fit', 'ทรงฟิต', null], ['layering', 'การทับซ้อน/ขอบเอว', null]]
};

export function detectGarment(p) {
  const t = `${clean(p.Category)} ${clean(p['Sub Category'])} ${clean(p['Product Name (EN)'])}`.toLowerCase();
  return /(shirt|t-shirt|pants|jeans|jacket|garment|apparel|clothing|เสื้อผ้า|กางเกง|เสื้อ)/.test(t);
}

function imagesOf(p) {
  const raw = [p['Main Image URL'] || '', ...String(p['Additional Images'] || '').split(';')].map(clean).filter(Boolean);
  return [...new Set(raw)].filter(u => /^https:\/\/www\.wdi\.co\.th\//i.test(u)).slice(0, 6);
}

export function buildIdentity(p, categoryCode) {
  const cat = (/^C0[1-9]$/.test(categoryCode || '') ? categoryCode : 'C09');
  const schemaKey = detectGarment(p) ? 'GARMENT' : cat;
  const schema = CATEGORY_COMPONENTS[schemaKey] || CATEGORY_COMPONENTS.C09;
  const fit = { brands: clean(p['Fitment Brands']), models: clean(p['Fitment Models']), contexts: clean(p['Fitment Contexts']) };
  const fitVerified = Boolean(fit.models || fit.brands);

  const components = {};
  let verified = 0;
  for (const [key, label, ex] of schema) {
    let r = null;
    if (ex && X[ex]) { try { r = X[ex](p); } catch {} }
    if (r && r.value) { components[key] = { label, value: r.value, evidence: r.evidence, status: 'VERIFIED' }; verified++; }
    else components[key] = { label, value: NV, evidence: '', status: NV };
  }
  // generic extras appended to every category
  try {
    const ni = X.not_included(p);
    if (ni && ni.value) { components.not_included = { label: 'ไม่รวมในชุด', value: ni.value, evidence: ni.evidence, status: 'VERIFIED' }; verified++; }
  } catch {}
  try {
    const st = X.steering(p);
    if (st && st.value) { components.steering = { label: 'พวงมาลัย', value: st.value, evidence: st.evidence, status: 'VERIFIED' }; verified++; }
  } catch {}
  // C08 split note / C07 pair note are structural, always present as guidance
  if (cat === 'C08') {
    components.ab_relationship = { label: 'ความสัมพันธ์ A/B', value: 'Treat housing and lamp as TWO separate SKUs. Never merge into one object.', evidence: 'schema-rule', status: 'VERIFIED' };
    verified++;
  }
  if (cat === 'C07') {
    components.pair_relationship = { label: 'ความสัมพันธ์คู่', value: 'LH and RH are distinct items. Never mirror one image to fake the other.', evidence: 'schema-rule', status: 'VERIFIED' };
    verified++;
    const t = `${clean(p['Product Code'])} ${clean(p['Product Name (TH)'])} ${clean(p['Product Name (EN)'])}`;
    const pm = t.match(/([A-Z0-9-]*L)\s*\/\s*([A-Z0-9-]*R)/i);
    if (pm) {
      components.lh_identity = { label: 'ฝั่งซ้าย (LH)', value: clean(pm[1]), evidence: 'code', status: 'VERIFIED' };
      components.rh_identity = { label: 'ฝั่งขวา (RH)', value: clean(pm[2]), evidence: 'code', status: 'VERIFIED' };
      verified += 2;
    }
  }

  const imgs = imagesOf(p);
  const refmap = {
    main_reference: imgs[0] || '',
    additional: imgs.slice(1),
    total: imgs.length,
    note: imgs.length ? 'All views below are the visual source of truth. Never invent unseen angles.' : 'NO verified reference images.'
  };

  const identity = {
    identity: {
      product_code: clean(p['Product Code']), product_name: clean(p['Product Name (TH)']),
      product_name_en: clean(p['Product Name (EN)']), category: clean(p.Category),
      sub_category: clean(p['Sub Category']), source_url: clean(p['Product URL'])
    },
    fitment: {
      verified: fitVerified, brands: fit.brands || NV, models: fit.models || NV,
      contexts: fit.contexts || NV, notes: fitVerified ? 'Use exact fitment text only.' : 'No verified fitment: no vehicle, no compatibility claim.'
    },
    visual_identity: {
      note: 'Colors/materials below are VERIFIED only when backed by description evidence; otherwise see reference images and do not invent.',
      lens: components.lens || null, color_material: NV
    },
    components, orientation: { side: components.side || { value: NV } },
    schema: schemaKey
  };

  const total = Object.keys(components).length || 1;
  const compShare = verified / total;
  const idCore = [identity.identity.product_code, identity.identity.product_name, identity.identity.source_url].filter(Boolean).length;
  const confidence = Math.round(
    (idCore >= 3 ? 30 : idCore * 10) +
    (identity.fitment.verified ? 20 : 0) +
    (imgs.length ? 20 : 0) +
    compShare * 30
  );
  return { identity, refmap, verified, total, confidence };
}

export function buildLockRules(p, categoryCode, catInfo) {
  const neg = clean(catInfo?.negative);
  const side = X.side(p);
  const negative_lock = [
    ...(neg ? [neg] : []),
    'No generated Thai typography, logos, specs, codes, QR, phone numbers or fake UI in video.',
    'Never invent model/year, price, warranty, included parts, connector type, wire count, dimensions or compatibility.',
    ...(side && side.value !== 'Pair (LH+RH)' ? [`Product is ${side.value}: never mirror, swap or redesign the side.`] : []),
    'If verified fitment is empty: no vehicle, no universal-fit claim.'
  ];
  return {
    preserve: [
      'Exact product silhouette, proportions and geometry from reference images.',
      'Color, material, finish, lens, housing, markings exactly as visible/verified.',
      'All visible components, fasteners, connectors — nothing added, removed or beautified.'
    ],
    change: [],
    match: [
      'Position, scale, perspective, lighting, shadow and reflection continuity across scenes.',
      'Segment N starts from the final frame of Segment N-1 when physically valid.'
    ],
    negative_lock,
    mode_notes: {
      showcase: 'PRODUCT-REFERENCE-FIRST (default): animate the exact supplied photo with subtle camera motion. Do NOT turn a single photo into a 3D orbit. "Localized inpainting" language applies ONLY to replacement tasks.',
      replacement: 'LOCALIZED INPAINTING on ONE region only — NOT a full re-generation. 4-layer lock: PRESERVE (everything else 100%) / CHANGE (single region only) / MATCH (position/scale/occlusion/lighting) / NEGATIVE LOCK (itemized, frozen every frame). Prefer ≤10s segments.'
    },
    video_constraints: {
      safe_angles: ['hero 3/4 from verified view', 'front/lens detail', 'slow push-in on flat image'],
      risky_angles: ['invented back/side view', '360 orbit from a single photo', 'technical drawing as camera angle'],
      required_references: ['hero product view', 'one detail view when available'],
      continuity: ['segment N starts from final frame of N-1 when physically valid, else clean cut'],
      short_clip: ['prefer one idea per ~10s segment; split long videos']
    }
  };
}

function snapshotOf(p, categoryCode) {
  const imgs = imagesOf(p);
  const core = {
    code: clean(p['Product Code']), th: clean(p['Product Name (TH)']), en: clean(p['Product Name (EN)']),
    cat: clean(p.Category), sub: clean(p['Sub Category']), url: clean(p['Product URL']),
    desc_th: clean(p['Description (TH)']), desc_en: clean(p['Description (EN)']),
    fit: [clean(p['Fitment Brands']), clean(p['Fitment Models']), clean(p['Fitment Contexts'])].join('|'),
    images: imgs, category: categoryCode, builder: BUILDER_V
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex');
  return { ...core, hash };
}

// Ensure current sheet; create new version only when source changed.
export function ensureSheet(productCode, categoryCode, productObj, catInfo) {
  const code = clean(productCode);
  if (!code) throw new Error('productCode required');
  const prod = shade({ code });
  const src = (productObj && clean(productObj['Product Code']) ? productObj : {}) || {};
  // merge stored master fields when caller passes thin object
  const full = { ...src };
  full['Product Code'] = clean(full['Product Code']) || code;
  if (!clean(full['Product Name (TH)'])) {
    const row = initDb().prepare('SELECT * FROM products WHERE id=?').get(prod.id);
    if (row) {
      full['Product Name (TH)'] = full['Product Name (TH)'] || row.product_name_th;
      full['Product Name (EN)'] = full['Product Name (EN)'] || row.product_name_en;
      full.Category = full.Category || row.category;
      full['Sub Category'] = full['Sub Category'] || row.sub_category;
      full['Product URL'] = full['Product URL'] || row.product_url;
      full['Main Image URL'] = full['Main Image URL'] || row.main_image_url;
      full['Additional Images'] = full['Additional Images'] || row.additional_images;
      if (row.fitment_text && !clean(full['Fitment Models'])) {
        const parts = String(row.fitment_text).split(' | ');
        full['Fitment Brands'] = parts[0] || '';
        full['Fitment Models'] = parts[1] || row.fitment_text;
        full['Fitment Contexts'] = parts[2] || '';
      }
    }
  }
  // snapshot AFTER merge: identical source => identical hash => reuse current
  const snap = snapshotOf(full, categoryCode);
  const cur = getCurrentSheet(prod.id);
  if (cur) {
    try {
      const old = JSON.parse(cur.source_snapshot || '{}');
      if (old.hash === snap.hash) return { sheet: cur, created: false };
    } catch {}
  }
  const { identity, refmap, confidence } = buildIdentity(full, categoryCode);
  const locks = buildLockRules(full, categoryCode, catInfo || null);
  const status = confidence >= 60 ? 'NEEDS_REVIEW' : 'DRAFT';
  const saved = saveSheetVersion(prod.id, { snapshot: snap, identity, refmap, locks, confidence, status });
  const refs = [];
  if (refmap.main_reference) refs.push({ url: refmap.main_reference, source: 'wdi', view: 'HERO', notes: '' });
  refmap.additional.forEach((u, i) => refs.push({ url: u, source: 'wdi', view: 'ADDITIONAL_' + (i + 1), notes: '' }));
  if (refs.length) addSheetRefs(saved.id, refs);
  logSheetAction(saved.id, cur ? 'SHEET_VERSIONED' : 'SHEET_CREATED', { version: saved.version_number, confidence, category: categoryCode });
  const sheet = getCurrentSheet(prod.id);
  return { sheet, created: true };
}

// Compact reusable block injected into video prompts (NOT the full sheet).
export function sheetPromptBlock(sheet, mode = 'showcase') {
  let identity = {}, refmap = {}, locks = {};
  try { identity = JSON.parse(sheet.identity_json || '{}'); } catch {}
  try { refmap = JSON.parse(sheet.reference_map_json || '{}'); } catch {}
  try { locks = JSON.parse(sheet.lock_rules_json || '{}'); } catch {}
  const id = identity.identity || {};
  const fit = identity.fitment || {};
  const comps = identity.components || {};
  const vok = Object.entries(comps).filter(([, c]) => c?.status === 'VERIFIED')
    .map(([k, c]) => `${k}=${c.value} [${c.evidence}]`);
  const unk = Object.keys(comps).filter(k => comps[k]?.status !== 'VERIFIED');
  const refs = [];
  if (refmap.main_reference) refs.push(`1. ${refmap.main_reference} (HERO)`);
  (refmap.additional || []).forEach((u, i) => refs.push(`${i + 2}. ${u} (ADDITIONAL)`));
  const L = [];
  L.push(`PRODUCT SOURCE OF TRUTH: Product Sheet #${sheet.id} v${sheet.version_number} [${sheet.status}, confidence ${sheet.confidence}%]`);
  L.push(`IDENTITY: ${id.product_code || ''} | ${id.product_name || ''} | ${id.product_name_en || ''} | ${id.category || ''}${id.sub_category ? ' / ' + id.sub_category : ''}`);
  L.push(`FITMENT: ${fit.verified ? [fit.brands, fit.models, fit.contexts].filter(x => x && x !== NV).join(' | ') : 'NONE VERIFIED — no vehicle, no compatibility claim.'}`);
  if (vok.length) L.push(`VERIFIED COMPONENTS: ${vok.join(' ; ')}`);
  if (unk.length) L.push(`NOT_VERIFIED (never use as facts): ${unk.join(', ')}`);
  L.push(`REFERENCE (visual source of truth, in order):\n${refs.length ? refs.join('\n') : '(none)'}`);
  L.push(`IDENTITY LOCK — PRESERVE: ${(locks.preserve || []).join(' | ')}`);
  L.push(`IDENTITY LOCK — MATCH: ${(locks.match || []).join(' | ')}`);
  L.push(`PRODUCT-SPECIFIC NEGATIVE: ${(locks.negative_lock || []).join(' | ')}`);
  L.push(mode === 'replacement'
    ? 'TASK MODE: REPLACEMENT. LOCALIZED INPAINTING on ONE region only — NOT a full re-generation. 4-layer lock: PRESERVE everything else 100% / CHANGE single region only / MATCH position-scale-occlusion-lighting / NEGATIVE LOCK frozen every frame. ' + (locks.mode_notes?.replacement || '')
    : 'TASK MODE: SHOWCASE (product-reference-first). Animate the exact supplied reference photo with subtle camera motion. ' + (locks.mode_notes?.showcase || ''));
  L.push('RULE: V/S creative text below must NOT rewrite this identity. On conflict, this sheet wins.');
  return `\n\nPRODUCT SHEET (single source of truth for this product):\n${L.join('\n')}`;
}

export function sheetSummary(sheet) {
  if (!sheet) return null;
  let identity = {}, refmap = {}, locks = {};
  try { identity = JSON.parse(sheet.identity_json || '{}'); } catch {}
  try { refmap = JSON.parse(sheet.reference_map_json || '{}'); } catch {}
  try { locks = JSON.parse(sheet.lock_rules_json || '{}'); } catch {}
  const comps = identity.components || {};
  const keys = Object.keys(comps);
  const vok = keys.filter(k => comps[k]?.status === 'VERIFIED');
  return {
    id: sheet.id, version: sheet.version_number, status: sheet.status, confidence: sheet.confidence,
    schema: identity.schema || '', code: identity.identity?.product_code || '',
    counts: {
      components_verified: vok.length, components_total: keys.length,
      references: refmap.total || 0,
      negative_locks: (locks.negative_lock || []).length
    },
    verified_fields: vok.slice(0, 12),
    updated_at: sheet.updated_at
  };
}
