// Content Distribution Studio engine — deterministic rules + builders.
// AI fills per-platform copy; every fact must come from FACT LOCK.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const clean = v => String(v ?? '').trim();

export const ANGLES = {
  A: { code: 'A', name: 'PRODUCT INTRO', th: 'แนะนำสินค้า', dir: 'Introduce the product plainly: what it is, verified identity, one reason to care.' },
  B: { code: 'B', name: 'FEATURE FIRST', th: 'เน้นจุดเด่น', dir: 'Lead with the strongest VERIFIED feature/spec, then support with 1-2 more verified facts.' },
  C: { code: 'C', name: 'BUYER PROBLEM', th: 'เริ่มจากปัญหา', dir: 'Open with a buyer pain the product solves (generic problem, no invented claims), then present the product as the fix.' },
  D: { code: 'D', name: 'FITMENT / COMPATIBILITY', th: 'รุ่นรถ / การเลือกสินค้า', dir: 'Help choosing: verified fitment only. If no verified fitment, teach how to check code/side instead of claiming compatibility.' },
  E: { code: 'E', name: 'COMPARISON', th: 'เปรียบเทียบ', dir: 'Compare against a generic alternative (old/damaged/ordinary part) on verified attributes only.' },
  F: { code: 'F', name: 'FAQ', th: 'ตอบคำถามก่อนซื้อ', dir: 'Answer the top 1-2 pre-purchase questions using verified facts only.' },
  G: { code: 'G', name: 'SALES PUSH', th: 'เน้น conversion', dir: 'Strong conversion push: scarcity-free urgency is forbidden; use clear CTA + contact instead.' },
  H: { code: 'H', name: 'CAMPAIGN', th: 'สำหรับ campaign', dir: 'Campaign framing using provided campaign context; still fact-locked.' }
};

export const PLATFORMS = {
  facebook: {
    name: 'Facebook', fields: ['hook', 'body', 'details', 'cta', 'hashtags'],
    rules: 'Readable paragraphs. HOOK first line stops scroll. BODY = benefits from verified facts. DETAILS = 2-4 spec bullets. CTA + contact block at end. 3-6 hashtags.',
    len: [100, 800], tags: [3, 6]
  },
  tiktok: {
    name: 'TikTok', fields: ['hook', 'caption', 'search_keywords', 'hashtags'],
    rules: 'Conversational, NOT a stiff ad. First-line hook under 40 chars. Short caption. Searchable keywords (product type + code). 3-5 hashtags.',
    len: [40, 250], tags: [3, 5]
  },
  instagram: {
    name: 'Instagram', fields: ['hook', 'caption', 'cta', 'hashtags'],
    rules: 'Visual-first, concise, premium tone. Line breaks for spacing. Short CTA. Compact hashtag cluster 5-10 at end.',
    len: [60, 400], tags: [5, 10]
  },
  line: {
    name: 'LINE OA', fields: ['headline', 'body', 'cta'],
    rules: 'Direct response, chat-friendly. Customer-question style opening allowed. Easy scanning (short lines). Clear CTA + EXACT contact block, never altered.',
    len: [40, 300], tags: [0, 0]
  },
  shopee: {
    name: 'Shopee', fields: ['title', 'short_description', 'key_features', 'specifications', 'search_keywords'],
    rules: 'Search-intent listing. TITLE must contain product code + type, max 120 chars. KEY FEATURES 3-5 verified bullets. SPECIFICATIONS only verified. Compatible models ONLY when verified. No emoji in title.',
    len: [60, 600], tags: [0, 0]
  }
};

const BANNED_CLAIM = [
  /รับประกัน\s*\d+\s*ปี/i, /warranty\s*\d+\s*year/i, /ราคาพิเศษ\s*\d/i,
  /ของแถม/i, /\bfree gift\b/i, /ส่งฟรีทั่วประเทศ/i
];

export function loadBusinessConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'business-config.json'), 'utf8')); }
  catch { return { brand: 'DIAMOND', contact: {}, brand_tags: [], usecase_tags: [] }; }
}

export function contactBlock(cfg) {
  const c = (cfg && cfg.contact) || {};
  const lines = [];
  if (c.website) lines.push('Website: ' + c.website);
  if (c.facebook) lines.push('Facebook: ' + c.facebook);
  if (c.line) lines.push('LINE: ' + c.line);
  if (c.phones && c.phones.length) lines.push('Phone: ' + c.phones.join(' / '));
  return lines.join('\n');
}

// FACT LOCK from product + fitment + sheet. Only verified entries may be used.
export function buildFacts(p, sheetInfo) {
  const verified = [];
  const unv = [];
  const add = (label, value, source) => {
    const v = clean(value);
    if (v && v !== '[NOT_VERIFIED]') verified.push({ label, value: v, source });
    else unv.push(label);
  };
  add('Product code', p['Product Code'], 'WDI');
  add('Product name', p['Product Name (TH)'] || p['Product Name (EN)'], 'WDI');
  add('Category', [p.Category, p['Sub Category']].filter(Boolean).join(' / '), 'WDI');
  const fit = [p['Fitment Brands'], p['Fitment Models'], p['Fitment Contexts']].filter(Boolean).join(' | ');
  const fitV = Boolean(clean(p['Fitment Models']) || clean(p['Fitment Brands']));
  if (fitV) verified.push({ label: 'Fitment', value: fit, source: 'Fitment Master' });
  else unv.push('Fitment');
  const desc = `${clean(p['Description (TH)'])} ${clean(p['Description (EN)'])}`;
  const grab = re => { const m = desc.match(re); return m ? clean(m[1] || m[0]) : ''; };
  add('Voltage', grab(/(\d{1,2}\s*V(?:\s*or\s*\d{1,2}\s*V)?)/i), 'WDI');
  add('Bulb', grab(/bulb\s*[:：]\s*([^\n,;]+)/i) || grab(/((?:H\d{1,2}|LED)[^\n,;]{0,20})/i), 'WDI');
  add('Lens/Base', grab(/lens\s*[:：]\s*([^\n,;]+)/i) || grab(/base\s*[:：]\s*([^\n,;]+)/i), 'WDI');
  if (sheetInfo && sheetInfo.verifiedFields && sheetInfo.verifiedFields.length) {
    verified.push({ label: 'Sheet verified', value: sheetInfo.verifiedFields.join(', '), source: 'Product Sheet' });
  }
  return { verified, unverified: [...new Set(unv)], fitmentVerified: fitV };
}

export function buildHashtags(p, fitVerified, platformKey, cfg) {
  const tags = [...(cfg.brand_tags || [])];
  const push = t => { t = clean(t); if (t && !tags.includes(t)) tags.push(t.startsWith('#') ? t : '#' + t); };
  const th = clean(p['Product Name (TH)']);
  const cat = clean(p.Category);
  if (/ไฟหน้า/.test(th)) push('#ไฟหน้า');
  else if (/ไฟท้าย/.test(th)) push('#ไฟท้าย');
  else if (/กระจก/.test(th)) push('#ไฟกระจก');
  else if (/เลี้ยว|สัญญาณ/.test(th)) push('#ไฟเลี้ยว');
  else if (/ทับทิม/.test(th)) push('#ไฟทับทิม');
  else if (cat) push('#' + cat.split(' ')[0]);
  const en = clean(p['Product Name (EN)']).split(/[\s\/()]+/).filter(w => /^[A-Za-z]{4,}$/.test(w)).slice(0, 2);
  en.forEach(push);
  if (fitVerified) {
    const models = clean(p['Fitment Models']).split(/[|,]/).map(s => s.trim()).filter(Boolean).slice(0, 2);
    models.forEach(m => push('#' + m.replace(/\s+/g, '')));
  }
  (cfg.usecase_tags || []).forEach(push);
  const cap = (PLATFORMS[platformKey] && PLATFORMS[platformKey].tags[1]) || 8;
  return { groups: { brand: (cfg.brand_tags || []), product: tags.slice((cfg.brand_tags || []).length), fitment: fitVerified ? 'verified-only' : 'none' }, all: tags.slice(0, cap || tags.length) };
}

export function buildKeywords(p, fitVerified) {
  const th = clean(p['Product Name (TH)']);
  const en = clean(p['Product Name (EN)']);
  const code = clean(p['Product Code']);
  const out = { primary: [], secondary: [], long_tail: [], product_code: [] };
  if (th) out.primary.push(th.split(/\s+/).slice(0, 3).join(' '));
  if (en) out.secondary.push(en);
  const v = `${clean(p['Description (TH)'])} ${clean(p['Description (EN)'])}`.match(/\d{1,2}\s*V/i);
  if (th && v) out.long_tail.push(`${th.split(/\s+/).slice(0, 2).join(' ')} ${v[0]}`);
  if (code) out.product_code.push(code);
  if (fitVerified && clean(p['Fitment Models'])) out.secondary.push(clean(p['Fitment Models']).split('|')[0].trim());
  return out;
}

export function buildDistPrompt({ product, facts, sheetCtx, angle, campaignCtx, contact, platforms }) {
  const a = ANGLES[angle] || ANGLES.A;
  const plats = (platforms && platforms.length ? platforms : Object.keys(PLATFORMS)).filter(k => PLATFORMS[k]);
  const schema = {};
  for (const k of plats) {
    schema[k] = {};
    for (const f of PLATFORMS[k].fields) schema[k][f] = f === 'hashtags' || f === 'search_keywords' || f === 'key_features' || f === 'specifications' ? [] : '...';
  }
  return `You are the DIAMOND/WDI content strategist. Write platform-ready marketing copy in Thai (product names may keep English).

CONTENT ANGLE (the single spine for all platforms): [${a.code}] ${a.name} — ${a.dir}

FACT LOCK (ONLY these facts may appear; NEVER invent, NEVER write "..." placeholders; drop any claim you cannot support):
${facts.verified.map(f => `- ${f.label}: ${f.value} [${f.source}]`).join('\n') || '(no verified facts beyond identity)'}
NOT VERIFIED (do NOT mention these at all): ${facts.unverified.join(', ') || 'none'}
FITMENT: ${facts.fitmentVerified ? 'verified — compatible models may be named exactly as given' : 'NOT verified — never claim compatibility, model/year fit, or universal fit'}.

PRODUCT SHEET CONTEXT: ${sheetCtx || 'none'}
CAMPAIGN CONTEXT: ${campaignCtx || 'none'}
CONTACT BLOCK (LINE must include it EXACTLY, others may append at end):
${contact}

PLATFORM RULES (follow each exactly):
${plats.map(k => `--- ${PLATFORMS[k].name} ---\n${PLATFORMS[k].rules}`).join('\n')}

OUTPUT JSON ONLY, exactly this shape (arrays stay arrays, no extra keys). Start your response with the { character — no preamble, no reasoning text:
${JSON.stringify({ angle: a.code, facts_used: ['...'], platforms: schema }, null, 1)}`;
}

// ---------- QA ----------
export function qaContent(plan, facts) {
  const issues = [];
  const plats = plan.platforms || {};
  const allText = JSON.stringify(plats);
  const fail = (platform, field, problem, fix) => issues.push({ platform, field, problem, fix, level: 'FAIL' });
  if (/\.\.\.|…|\{[^}]{0,30}\}/.test(allText)) fail('all', 'content', 'มี "…" หรือ placeholder/wrapper ว่าง', 'เติมค่าจริงจาก FACT LOCK หรือตัด claim นั้นออก');
  for (const bc of BANNED_CLAIM) if (bc.test(allText)) fail('all', 'claim', `พบข้อความเคลมต้องห้าม (${bc})`, 'ลบออกถ้าไม่มีใน FACT LOCK');
  if (!facts.fitmentVerified && /\b(19|20)\d{2}\b/.test(allText)) fail('all', 'fitment', 'อ้างปีรถโดยไม่มี verified fitment', 'ลบปีรถออก หรือใช้เฉพาะเมื่อ verified');
  const fitTxt = ((facts.verified || []).find(f => f.label === 'Fitment') || {}).value || '';
  const brands = ['TOYOTA', 'HONDA', 'ISUZU', 'MITSUBISHI', 'NISSAN', 'FORD', 'MAZDA', 'CHEVROLET', 'SUZUKI', 'HILUX', 'REVO', 'VIGO', 'D-MAX', 'DMAX', 'RANGER', 'TRITON', 'NAVARA', 'COLORADO', 'TIGER', 'MIGHTY-X', 'STRADA', 'L200', 'CYCLONE', 'FRONTIER', 'BIG-M'];
  const seenBad = new Set();
  for (const m of allText.matchAll(new RegExp(`\\b(${brands.join('|')})\\b`, 'gi'))) {
    const b = m[0].toUpperCase();
    if (!fitTxt.toUpperCase().includes(b) && !seenBad.has(b)) { seenBad.add(b); fail('all', 'fitment', `อ้าง ${m[0]} ที่ไม่มีใน verified fitment`, 'ใช้เฉพาะยี่ห้อ/รุ่นใน FACT LOCK'); }
  }
  for (const [k, body] of Object.entries(plats)) {
    const rule = PLATFORMS[k];
    if (!rule) continue;
    const txt = Object.values(body || {}).flat().join(' ');
    for (const f of rule.fields) {
      const v = body[f];
      const empty = v === undefined || v === '' || (Array.isArray(v) && !v.length);
      if (empty) fail(k, f, `ฟิลด์ว่าง: ${f}`, 'เติมจาก FACT LOCK หรือตัดฟิลด์');
    }
    const [lo, hi] = rule.len;
    if (txt.length < lo || txt.length > hi * 2) fail(k, 'length', `ความยาว ${txt.length} ตัวอักษร (เป้า ${lo}-${hi})`, 'ปรับให้อยู่ในช่วง');
    const tags = body.hashtags || [];
    const [tlo, thi] = rule.tags;
    if (thi > 0 && (tags.length < tlo || tags.length > thi)) fail(k, 'hashtags', `แฮชแท็ก ${tags.length} (ควร ${tlo}-${thi})`, 'ปรับจำนวน');
    if (k === 'shopee') {
      if (!/01-|02-|04-|10-|15-|\d{2}-/.test(body.title || '')) fail(k, 'title', 'title ไม่มี product code', 'ใส่รหัสสินค้าใน title');
      if (/[\u{1F300}-\u{1FAFF}]/u.test(body.title || '')) fail(k, 'title', 'title มี emoji', 'ลบ emoji ออกจาก title');
    }
    if (k === 'line' && !/wdi\.co\.th|@|0\d/.test(txt)) fail(k, 'contact', 'ไม่มี contact block', 'ใส่ contact block ตัวจริง');
    const needCta = ['facebook', 'tiktok', 'instagram', 'line'].includes(k);
    if (needCta && !/ทัก|สอบถาม|สั่งซื้อ|คลิก|ติดต่อ|ดูรายละเอียด|shop|line|โทร/i.test(txt)) fail(k, 'cta', 'ไม่พบ CTA', 'เพิ่ม CTA + ช่องทางติดต่อ');
  }
  return { status: issues.length ? 'REVIEW' : 'PASS', issues };
}

export function scoreContent(plan, qa) {
  const plats = Object.keys(plan.platforms || {});
  const n = Math.max(1, plats.length);
  let fact = 30, fit = 20, read = 10, seo = 15, cta = 15, comp = 10;
  const fails = (qa.issues || []).length;
  fact = Math.max(0, 30 - fails * 6);
  const lenFails = (qa.issues || []).filter(i => i.field === 'length').length;
  fit = Math.max(0, 20 - lenFails * 5 - (qa.issues || []).filter(i => i.field === 'hashtags').length * 3);
  const texts = plats.map(k => Object.values(plan.platforms[k] || {}).flat().join(' '));
  const avgLen = texts.join(' ').length / Math.max(1, texts.length);
  read = avgLen > 30 ? 10 : 6;
  const kw = JSON.stringify(plan.platforms).match(/#|ไฟ|Lamp|12V/i) ? 15 : 8;
  seo = kw;
  const ctaFails = (qa.issues || []).filter(i => i.field === 'cta').length;
  cta = Math.max(0, 15 - ctaFails * 5);
  const emptyFails = (qa.issues || []).filter(i => i.problem.startsWith('ฟิลด์ว่าง')).length;
  comp = Math.max(0, 10 - emptyFails * 3);
  const total = Math.round(fact + fit + read + seo + cta + comp);
  const critical = (qa.issues || []).some(i => /placeholder|ต้องห้าม|fitment/i.test(i.problem));
  return {
    total, ready: total >= 80 && !critical,
    dims: { fact_accuracy: fact, platform_fit: fit, readability: read, seo_searchability: seo, cta, completeness: comp }
  };
}
