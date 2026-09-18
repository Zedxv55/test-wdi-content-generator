// Vehicle Product Map — WDI-sourced discovery. Brands/models/products come from
// www.wdi.co.th HTML (never hard-coded, never AI-invented). AI only assists
// grouping prompts / storyboard drafting, never source facts.
const WDI = 'https://www.wdi.co.th';
const UA = { 'User-Agent': 'Mozilla/5.0 WDI-Content-Generator' };
const clean = v => String(v ?? '').trim();

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!r.ok) throw new Error('WDI HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

export function b64name(s) {
  try {
    let t = decodeURIComponent(String(s || '').replace(/ /g, '+'));
    return Buffer.from(t, 'base64').toString('utf8').trim();
  } catch { return ''; }
}

function absUrl(href) {
  href = clean(href);
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/')) return WDI + href;
  if (href.startsWith('./')) return WDI + '/product/' + href.slice(2);
  return WDI + '/product/' + href;
}

// STEP 1: brands from category-select page
export async function collectBrands() {
  const html = await fetchHtml(WDI + '/product/category-select.php');
  const out = [];
  const re = /<a\s+href='([^']*car_brand_input=[^']*)'[^>]*>[\s\S]*?<h4[^>]*>([^<]+)<\/h4>/gi;
  let m;
  while ((m = re.exec(html))) {
    const name = clean(m[2].replace(/<\/?[^>]+>/g, ''));
    if (name) out.push({ brand: name.toUpperCase(), url: absUrl(m[1]) });
  }
  const seen = new Set();
  return out.filter(b => !seen.has(b.brand) && seen.add(b.brand));
}

// STEP 2: models of a brand page (name, url, catalog image)
export async function collectModels(brandUrl) {
  const html = await fetchHtml(brandUrl);
  const out = [];
  const re = /<a\s+href='([^']*car_model_input=[^']*)'[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const block = m[2];
    const nm = block.match(/<h4[^>]*>([^<]+)<\/h4>/i);
    const im = block.match(/<img[^>]+src='([^']+)'/i);
    // car_model_input is the model identity; skip brand-level links
    if (!/car_model_input/i.test(m[1])) continue;
    const qp = new URL(absUrl(m[1])).searchParams;
    const model = b64name(qp.get('car_model_input')) || clean(nm ? nm[1] : '');
    if (!model) continue;
    out.push({ model, url: absUrl(m[1]), image_url: im ? absUrl(im[1]) : '' });
  }
  const seen = new Set();
  return out.filter(x => !seen.has(x.model) && seen.add(x.model));
}

// STEP 3: products of a model page
export async function collectModelProducts(modelUrl) {
  const html = await fetchHtml(modelUrl);
  const out = [];
  const re = /<a\s+href='(https?:\/\/[^']*view-product\.php\?product_id=[^']*)'[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const block = m[2];
    const im = block.match(/<img[^>]+src='([^']+)'/i);
    const nm = block.match(/<h4[^>]*>([^<]+)<\/h4>/i);
    out.push({ url: m[1], image_url: im ? absUrl(im[1]) : '', name: clean(nm ? nm[1].replace(/<\/?[^>]+>/g, '') : '') });
  }
  const seen = new Set();
  return out.filter(x => !seen.has(x.url) && seen.add(x.url));
}

// Vehicle image classification (heuristic; uncertain => REVIEW, never random)
export function classifyVehicleImage(imgUrl, brand, model) {
  const u = String(imgUrl || '').toLowerCase();
  if (!u) return { status: 'OTHER', reason: 'no image' };
  if (/logo|banner|icon|sprite|button|arrow|nav/i.test(u)) return { status: 'OTHER', reason: 'ui/logo pattern' };
  const bt = brand.toLowerCase().split(/\s+/)[0] || '';
  const hitsBrand = bt && u.includes(bt);
  const tokens = model.toLowerCase().split(/[\s\-\/]+/).filter(x => x.length > 2);
  const hitsModel = tokens.some(t => u.includes(t));
  if (/\.(jpg|jpeg|png|webp)(\?|$)/.test(u) && (hitsBrand || hitsModel)) return { status: 'VEHICLE', reason: 'catalog image matching brand/model' };
  if (/uploads\//.test(u)) return { status: 'REVIEW', reason: 'wdi upload, uncertain subject' };
  return { status: 'OTHER', reason: 'unrecognized' };
}

// Local grouping helpers (display only; never merges SKUs)
export function splitSide(code, name) {
  const t = `${clean(code)} ${clean(name)}`;
  if (/[A-Z0-9-]*L\s*\/\s*[A-Z0-9-]*R/i.test(t) || /[A-Z0-9-]*R\s*\/\s*[A-Z0-9-]*L/i.test(t) || /คู่|\bpair\b/i.test(t)) return 'Pair';
  const m = t.match(/(^|[^A-Z])(LH|RH)([^A-Z]|$)/) || clean(code).match(/\d(L|R)$/);
  if (m) return (m[2] || m[1]) === 'L' ? 'LH' : 'RH';
  return '';
}

export function guessGroup(name, category) {
  const t = `${clean(name)} ${clean(category)}`;
  if (/ไฟหน้า|head/i.test(t)) return 'ไฟหน้า';
  if (/เสื้อ/i.test(t)) return 'เสื้อไฟ';
  if (/ไฟท้าย|tail/i.test(t)) return 'ไฟท้าย';
  if (/กระจก|mirror/i.test(t)) return 'กระจก';
  if (/เลี้ยว|สัญญาณ|signal|turn/i.test(t)) return 'ไฟสัญญาณ';
  if (/ทับทิม|reflector|marker/i.test(t)) return 'ไฟทับทิม';
  return 'อื่นๆ';
}

// Fitment safety: vehicle title is CONTEXT, never evidence.
export function compareFitment(fitmentText, brand, model) {
  const f = clean(fitmentText).toLowerCase();
  if (!f) return { status: 'review', reason: 'no product fitment text' };
  const toks = `${brand} ${model}`.toLowerCase().split(/[\s\-\/]+/).filter(x => x.length > 2 && !/^\d+$/.test(x));
  const hits = toks.filter(t => f.includes(t));
  if (!toks.length) return { status: 'review', reason: 'no vehicle tokens' };
  if (hits.length >= Math.min(2, toks.length)) return { status: 'verified', reason: `matches: ${hits.slice(0, 4).join(', ')}` };
  if (hits.length) return { status: 'review', reason: `partial: ${hits.join(', ')}` };
  return { status: 'review', reason: 'vehicle not mentioned in product fitment' };
}
