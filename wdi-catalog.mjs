import path from 'node:path';
import fs from 'node:fs';
import XLSX from 'xlsx';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w):/, '$1:'));
const BASE = 'https://www.wdi.co.th/';
const START = BASE + 'product/category-select.php';
const OUT_JSON = path.join(ROOT, 'data', 'wdi-catalog.json');
const OUT_XLSX = path.join(ROOT, 'data', 'wdi-catalog.xlsx');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const dec = s => clean(String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>'));
const strip = s => dec(String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
const abs = u => { try { const x = new URL(String(u || ''), BASE); if (x.hostname !== 'www.wdi.co.th') return ''; return x.href; } catch { return ''; } };
const links = html => [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ url: abs(m[1]), text: strip(m[2]) })).filter(x => x.url.startsWith(BASE + 'product/'));
async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; WDI-Catalog-Sync/1.0)', 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' } });
      if (r.ok) return await r.text();
    } catch {}
    await sleep(300 * attempt);
  }
  return '';
}
function breadcrumb(html) {
  const source = String(html).match(/<nav[^>]*class=["'][^"']*woocommerce-breadcrumb[^"']*["'][^>]*>[\s\S]*?<\/nav>/i)?.[0] || '';
  if (!source) return [];
  const parts = [...source.matchAll(/<(?:a|strong)\b[^>]*>([\s\S]*?)<\/(?:a|strong)>/gi)].map(x => strip(x[1])).filter(Boolean);
  return [...new Set(parts)];
}
function imageList(html) {
  const out = [];
  for (const m of String(html).matchAll(/(?:src|data-detail-src|data-src)=["']([^"']+)["']/gi)) {
    const u = abs(m[1]);
    if (u && /\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(u) && !out.includes(u)) out.push(u);
  }
  return out;
}
function product(html, url, pathHint = []) {
  const code = strip(String(html).match(/class=["'][^"']*product-item-number[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
  const nameTh = dec(String(html).match(/class=["'][^"']*product-name[^"']*[^>]*data-th=["']([^"']*)["']/i)?.[1] || '');
  const nameEn = dec(String(html).match(/class=["'][^"']*product-name[^"']*[^>]*data-en=["']([^"']*)["']/i)?.[1] || '');
  const title = strip(String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') || nameTh || nameEn;
  const imgs = imageList(html);
  const main = abs(String(html).match(/id=["']main-product-image["'][^>]*src=["']([^"']+)["']/i)?.[1] || imgs[0] || '');
  const th = strip(String(html).match(/id=["']content-th["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
  const en = strip(String(html).match(/id=["']content-en["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
  const bc = breadcrumb(html);
  const pathParts = bc.length ? bc : pathHint;
  return { type: 'product', sourceUrl: url, productUrl: url, breadcrumb: pathParts, categoryPath: pathParts.join(' / '), category: pathParts[0] || '', subCategory: pathParts[pathParts.length - 1] || '', productCode: code, productNameTH: nameTh || title, productNameEN: nameEn, title, mainImageUrl: main, imageUrls: imgs, descriptionTH: th, descriptionEN: en, syncedAt: new Date().toISOString() };
}
const isProduct = u => /\/product\/view-product\.php\?/i.test(u);
const isCategory = u => /\/product\/(?:category-select|product-led-lamps)\.php(?:\?|$)/i.test(u);
const queue = [{ url: START, path: [] }];
const seen = new Set();
const products = new Map();
let pages = 0;
while (queue.length) {
  const cur = queue.shift();
  if (seen.has(cur.url)) continue;
  seen.add(cur.url);
  const html = await get(cur.url);
  pages++;
  if (!html) continue;
  const bc = breadcrumb(html);
  const hint = bc.length ? bc : cur.path;
  if (isProduct(cur.url)) {
    const p = product(html, cur.url, hint);
    if (p.productCode || p.productNameTH || p.productNameEN) products.set(cur.url, p);
  }
  for (const l of links(html)) {
    if (isProduct(l.url)) {
      if (!seen.has(l.url)) queue.push({ url: l.url, path: hint.concat(l.text ? [l.text] : []) });
    } else if (isCategory(l.url) && !seen.has(l.url)) {
      const nextPath = l.text ? hint.concat(l.text) : hint;
      queue.push({ url: l.url, path: nextPath });
    }
  }
  if (pages % 25 === 0) console.log(`SYNC ${pages} pages | queue ${queue.length} | products ${products.size}`);
}
const rows = [...products.values()].sort((a,b) => String(a.categoryPath).localeCompare(String(b.categoryPath), 'th') || String(a.productCode).localeCompare(String(b.productCode), 'th'));
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), startUrl: START, pageCount: pages, productCount: rows.length, products: rows }, null, 2), 'utf8');
const HEAD = ['categoryPath','category','subCategory','breadcrumb','productCode','productNameTH','productNameEN','title','productUrl','sourceUrl','mainImageUrl','imageUrls','descriptionTH','descriptionEN','syncedAt'];
const sheet = XLSX.utils.aoa_to_sheet([HEAD, ...rows.map(r => [r.categoryPath,r.category,r.subCategory,r.breadcrumb.join(' / '),r.productCode,r.productNameTH,r.productNameEN,r.title,r.productUrl,r.sourceUrl,r.mainImageUrl,r.imageUrls.join('; '),r.descriptionTH,r.descriptionEN,r.syncedAt])]);
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheet, 'WDI Catalog'); XLSX.writeFile(wb, OUT_XLSX);
console.log(`DONE ${rows.length} products -> ${OUT_JSON}`);
console.log(`DONE catalog -> ${OUT_XLSX}`);
