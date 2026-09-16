// One-shot + re-runnable master import. Reads Excel masters (never writes them),
// upserts into SQLite. Production history (jobs/versions/actions) is never touched.
import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upsertProducts, upsertSeries, initDb } from './db.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const clean = v => String(v ?? '').trim();
const envFile = k => { const v = clean(process.env[k]); return v; };
const PRODUCT_FILE = process.env.PRODUCT_FILE && path.isAbsolute(process.env.PRODUCT_FILE)
  ? process.env.PRODUCT_FILE
  : path.join(ROOT, process.env.PRODUCT_FILE || 'data/Present(Get-web-wdi).xlsx');
const VIDEO_FILE = process.env.VIDEO_FILE && path.isAbsolute(process.env.VIDEO_FILE)
  ? process.env.VIDEO_FILE
  : path.join(ROOT, process.env.VIDEO_FILE || 'data/Present(Short-vdo)ล่าสุด.xlsx');
const FITMENT_FILE = path.join(ROOT, 'data', 'WDI-Fitment-Master.xlsx');

function sheet(file, idxOrName = 0) {
  const wb = XLSX.readFile(file);
  const ws = typeof idxOrName === 'number' ? wb.Sheets[wb.SheetNames[idxOrName]] : wb.Sheets[idxOrName];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

const products = sheet(PRODUCT_FILE, 0);
let fit = [];
try {
  const wb = XLSX.readFile(FITMENT_FILE);
  const ws = wb.Sheets['Fitment Master'] || wb.Sheets[wb.SheetNames[0]];
  fit = XLSX.utils.sheet_to_json(ws, { defval: '' });
} catch {}
const fitByUrl = new Map();
for (const r of fit) {
  const url = clean(r.Product_URL);
  if (!url) continue;
  if (!fitByUrl.has(url)) fitByUrl.set(url, []);
  fitByUrl.get(url).push(r);
}
const enriched = products
  .filter(r => clean(r['Product Code']))
  .map(r => {
    const rows = fitByUrl.get(clean(r['Product URL'])) || [];
    const brands = [...new Set(rows.map(x => clean(x.Car_Brand)).filter(Boolean))].join(', ');
    const models = [...new Set(rows.map(x => clean(x.Car_Model)).filter(Boolean))].join(' | ');
    const ctx = [...new Set(rows.map(x => clean(x.Fitment_Context)).filter(Boolean))].join(' | ');
    return { ...r, 'Fitment Brands': brands, 'Fitment Models': models, 'Fitment Contexts': ctx };
  });

initDb();
const pCount = upsertProducts(enriched, path.basename(PRODUCT_FILE), fs.statSync(PRODUCT_FILE).mtime.toISOString());
console.log('products upserted:', pCount);

const vRows = sheet(VIDEO_FILE, 'Series Selector v2').filter(r => clean(r['รหัสใช้งาน']) && /^[A-Z]+\d+$/.test(clean(r['รหัสใช้งาน'])));
const vCount = upsertSeries('V', vRows.map(r => ({
  code: clean(r['รหัสใช้งาน']), name: clean(r['ชื่อที่คนใช้เห็น']),
  description: clean(r['ใช้เมื่อ']), category: clean(r['เหมาะกับหมวด'])
})));
console.log('V series upserted:', vCount);

const sRows = sheet(VIDEO_FILE, 0).filter(r => clean(r['ซีรีส์/Ai']) && clean(r['สถานะ']).startsWith('Template'));
const sCount = upsertSeries('S', sRows.map(r => ({
  code: clean(r['รหัสซีรีส์']) || clean(r['ซีรีส์/Ai']).slice(0, 12), name: clean(r['ซีรีส์/Ai']),
  description: clean(r['ใช้เมื่อ / เลือกซีรีส์นี้เมื่อ']),
  prompt: clean(r['Prompt กลางใช้ได้ทุกรูปแบบ (Google Flow - Scene ให้ AI พิจารณาเองตามความยาวที่กำหนด)'])
})));
console.log('S series upserted:', sCount);

const cRows = sheet(VIDEO_FILE, 'Category Prompt Matrix').filter(r => clean(r['รหัสหมวด']));
const cCount = upsertSeries('C', cRows.map(r => ({
  code: clean(r['รหัสหมวด']), name: clean(r['ชื่อที่คนใช้เห็น']),
  description: clean(r['ใช้กับสินค้า']), category: '', prompt: clean(r['Prompt Category Core'])
})));
console.log('C categories upserted:', cCount);
console.log('DB:', process.env.PROD_DB_FILE || 'data/wdi-production.db');
