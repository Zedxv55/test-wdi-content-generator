// WDI Production Memory — SQLite layer (node:sqlite, zero dependency).
// MASTER (Excel) is read-only source of truth. This DB stores PRODUCTION state only.
// On Vercel (read-only fs) it falls back to :memory: and reports memoryMode=true.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.PROD_DB_FILE
  ? (path.isAbsolute(process.env.PROD_DB_FILE) ? process.env.PROD_DB_FILE : path.join(ROOT, process.env.PROD_DB_FILE))
  : path.join(ROOT, 'data', 'wdi-production.db');

export let memoryMode = false;
let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_code TEXT UNIQUE NOT NULL,
  product_name_th TEXT DEFAULT '',
  product_name_en TEXT DEFAULT '',
  category TEXT DEFAULT '',
  sub_category TEXT DEFAULT '',
  product_url TEXT DEFAULT '',
  main_image_url TEXT DEFAULT '',
  additional_images TEXT DEFAULT '',
  fitment_text TEXT DEFAULT '',
  source_file TEXT DEFAULT '',
  source_mtime TEXT DEFAULT '',
  synced_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS prompt_series(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_type TEXT NOT NULL,
  series_code TEXT NOT NULL,
  series_name TEXT DEFAULT '',
  description TEXT DEFAULT '',
  category TEXT DEFAULT '',
  prompt_template TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  UNIQUE(series_type, series_code)
);
CREATE TABLE IF NOT EXISTS production_jobs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER DEFAULT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  category_code TEXT DEFAULT '',
  v_code TEXT NOT NULL,
  s_code TEXT DEFAULT '',
  status TEXT DEFAULT 'NOT_STARTED',
  current_stage TEXT DEFAULT 'PRODUCT_SELECTED',
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT '',
  started_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  completed_at TEXT DEFAULT '',
  UNIQUE(product_id, v_code)
);
CREATE TABLE IF NOT EXISTS production_versions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES production_jobs(id),
  version_number INTEGER NOT NULL,
  input_snapshot TEXT DEFAULT '',
  prompt_snapshot TEXT DEFAULT '',
  output_json TEXT DEFAULT '',
  output_text TEXT DEFAULT '',
  model TEXT DEFAULT '',
  generation_status TEXT DEFAULT 'GENERATED',
  error TEXT DEFAULT '',
  is_current INTEGER DEFAULT 0,
  created_by TEXT DEFAULT 'web',
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS production_actions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER DEFAULT NULL REFERENCES production_jobs(id),
  action_type TEXT NOT NULL,
  action_data TEXT DEFAULT '',
  created_by TEXT DEFAULT 'web',
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS publish_status(
  job_id INTEGER PRIMARY KEY REFERENCES production_jobs(id),
  facebook_status TEXT DEFAULT 'PENDING',
  instagram_status TEXT DEFAULT 'PENDING',
  line_status TEXT DEFAULT 'PENDING',
  tiktok_status TEXT DEFAULT 'PENDING',
  published_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS campaigns(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_name TEXT NOT NULL,
  campaign_type TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  target_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS campaign_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  day_number INTEGER DEFAULT 0,
  set_number INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'PENDING',
  UNIQUE(campaign_id, product_id)
);
CREATE TABLE IF NOT EXISTS ai_memory(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_type TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value TEXT DEFAULT '',
  scope TEXT DEFAULT 'project',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  UNIQUE(memory_type, memory_key, scope)
);
CREATE INDEX IF NOT EXISTS idx_jobs_product ON production_jobs(product_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON production_jobs(status);
CREATE INDEX IF NOT EXISTS idx_versions_job ON production_versions(job_id);
CREATE INDEX IF NOT EXISTS idx_actions_job ON production_actions(job_id);
CREATE INDEX IF NOT EXISTS idx_actions_time ON production_actions(created_at);
CREATE TABLE IF NOT EXISTS product_sheets(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  version_number INTEGER NOT NULL,
  source_snapshot TEXT DEFAULT '',
  identity_json TEXT DEFAULT '',
  reference_map_json TEXT DEFAULT '',
  lock_rules_json TEXT DEFAULT '',
  confidence INTEGER DEFAULT 0,
  status TEXT DEFAULT 'DRAFT',
  visual_prompt TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  is_current INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS product_sheet_references(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_sheet_id INTEGER NOT NULL REFERENCES product_sheets(id),
  image_url TEXT DEFAULT '',
  source TEXT DEFAULT '',
  view_type TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS product_sheet_actions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_sheet_id INTEGER NOT NULL REFERENCES product_sheets(id),
  action_type TEXT NOT NULL,
  action_data TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sheets_product ON product_sheets(product_id);
CREATE TABLE IF NOT EXISTS platform_content(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  job_id INTEGER DEFAULT NULL REFERENCES production_jobs(id),
  platform TEXT NOT NULL,
  content_angle TEXT DEFAULT 'A',
  version INTEGER NOT NULL,
  content_json TEXT DEFAULT '',
  qa_json TEXT DEFAULT '',
  score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'DRAFT',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  is_current INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pcontent_lookup ON platform_content(product_id,platform,content_angle);
`;

export function now() { return new Date().toISOString(); }

function tx(fn) {
  const d = initDb();
  d.exec('BEGIN');
  try { const r = fn(); d.exec('COMMIT'); return r; }
  catch (e) { try { d.exec('ROLLBACK'); } catch {} throw e; }
}

export function initDb() {
  if (db) return db;
  try {
    db = new DatabaseSync(DB_FILE);
  } catch {
    memoryMode = true;
    db = new DatabaseSync(':memory:');
  }
  try {
    db.exec('PRAGMA journal_mode=WAL');
  } catch { /* memory db */ }
  // Verify writable: on Vercel the file open may succeed but writes fail.
  try {
    db.exec(SCHEMA);
    try { db.exec("ALTER TABLE product_sheets ADD COLUMN visual_prompt TEXT DEFAULT ''"); } catch {}
    db.prepare('CREATE TABLE IF NOT EXISTS __wtest(id INTEGER PRIMARY KEY)').run();
    db.prepare('DROP TABLE __wtest').run();
  } catch {
    try { db.close(); } catch {}
    memoryMode = true;
    db = new DatabaseSync(':memory:');
    db.exec(SCHEMA);
  }
  return db;
}

function esc(v) { return String(v ?? ''); }

// ---------- MASTER IMPORT (upsert, never delete) ----------
export function upsertProducts(rows, sourceFile, sourceMtime) {
  const d = initDb();
  const stmt = d.prepare(`INSERT INTO products
    (product_code,product_name_th,product_name_en,category,sub_category,product_url,main_image_url,additional_images,fitment_text,source_file,source_mtime,synced_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(product_code) DO UPDATE SET
      product_name_th=excluded.product_name_th, product_name_en=excluded.product_name_en,
      category=excluded.category, sub_category=excluded.sub_category, product_url=excluded.product_url,
      main_image_url=excluded.main_image_url, additional_images=excluded.additional_images,
      fitment_text=excluded.fitment_text, source_file=excluded.source_file,
      source_mtime=excluded.source_mtime, synced_at=excluded.synced_at`);
  const ts = now();
  let n = 0;
  tx(() => {
    for (const r of rows) {
      const code = esc(r['Product Code']).trim();
      if (!code) continue;
      stmt.run(code, esc(r['Product Name (TH)']), esc(r['Product Name (EN)']),
        esc(r.Category), esc(r['Sub Category']), esc(r['Product URL']),
        esc(r['Main Image URL']), esc(r['Additional Images']),
        [esc(r['Fitment Brands']), esc(r['Fitment Models']), esc(r['Fitment Contexts'])].filter(Boolean).join(' | '),
        sourceFile, sourceMtime, ts);
      n++;
    }
  });
  return n;
}

export function upsertSeries(type, items) {
  const d = initDb();
  const stmt = d.prepare(`INSERT INTO prompt_series
    (series_type,series_code,series_name,description,category,prompt_template,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,1,?,?)
    ON CONFLICT(series_type,series_code) DO UPDATE SET
      series_name=excluded.series_name, description=excluded.description, category=excluded.category,
      prompt_template=excluded.prompt_template, updated_at=excluded.updated_at`);
  const ts = now();
  let n = 0;
  tx(() => {
    for (const it of items) { stmt.run(type, it.code, it.name || '', it.description || '', it.category || '', it.prompt || '', ts, ts); n++; }
  });
  return n;
}

// ---------- JOBS / ACTIONS / VERSIONS ----------
export function getProductRow(code) {
  return initDb().prepare('SELECT * FROM products WHERE product_code=?').get(String(code || '').trim()) || null;
}

export function getOrCreateJob(productCode, vCode, opts = {}) {
  const d = initDb();
  const code = String(productCode || '').trim();
  const v = String(vCode || '').trim().toUpperCase();
  if (!code || !v) throw new Error('productCode + vCode required');
  let prod = getProductRow(code);
  if (!prod) {
    const r = d.prepare(`INSERT INTO products (product_code,synced_at) VALUES (?,?)`).run(code, now());
    prod = { id: Number(r.lastInsertRowid), product_code: code };
  }
  let job = d.prepare('SELECT * FROM production_jobs WHERE product_id=? AND v_code=?').get(prod.id, v);
  if (!job) {
    const ts = now();
    const r = d.prepare(`INSERT INTO production_jobs
      (campaign_id,product_id,category_code,v_code,s_code,status,current_stage,priority,created_at,started_at,updated_at)
      VALUES (?,?,?,?,?,'NOT_STARTED','PRODUCT_SELECTED',?,?,?,?)`)
      .run(opts.campaignId || null, prod.id, opts.categoryCode || '', v, opts.sCode || '', opts.priority || 0, ts, ts, ts);
    job = d.prepare('SELECT * FROM production_jobs WHERE id=?').get(r.lastInsertRowid);
  }
  return { job, product: prod };
}

export function logAction(jobId, type, data = {}, by = 'web') {
  initDb().prepare(`INSERT INTO production_actions (job_id,action_type,action_data,created_by,created_at)
    VALUES (?,?,?,?,?)`).run(jobId || null, type, JSON.stringify(data), by, now());
}

export function touchJob(jobId, patch = {}) {
  const d = initDb();
  const sets = ['updated_at=?'];
  const vals = [now()];
  for (const k of ['status', 'current_stage', 's_code', 'category_code', 'campaign_id', 'started_at', 'completed_at']) {
    if (patch[k] !== undefined) { sets.push(`${k}=?`); vals.push(patch[k]); }
  }
  vals.push(jobId);
  d.prepare(`UPDATE production_jobs SET ${sets.join(',')} WHERE id=?`).run(...vals);
  return d.prepare('SELECT * FROM production_jobs WHERE id=?').get(jobId);
}

export function createVersion(jobId, { input, prompt, output, model, status = 'GENERATED', error = '', by = 'web' }) {
  const d = initDb();
  const cur = d.prepare('SELECT COALESCE(MAX(version_number),0) AS m FROM production_versions WHERE job_id=?').get(jobId).m;
  const n = cur + 1;
  d.prepare('UPDATE production_versions SET is_current=0 WHERE job_id=?').run(jobId);
  const r = d.prepare(`INSERT INTO production_versions
    (job_id,version_number,input_snapshot,prompt_snapshot,output_json,output_text,model,generation_status,error,is_current,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`).run(jobId, n,
    JSON.stringify(input || {}), String(prompt || '').slice(0, 20000),
    output ? JSON.stringify(output).slice(0, 200000) : '', '',
    model || '', status, String(error || '').slice(0, 2000), by, now());
  return { id: Number(r.lastInsertRowid), version_number: n };
}

export function getVersions(jobId) {
  return initDb().prepare('SELECT id,version_number,model,generation_status,error,is_current,created_by,created_at FROM production_versions WHERE job_id=? ORDER BY version_number').all(jobId);
}

export function getVersionOutput(jobId, version) {
  return initDb().prepare('SELECT * FROM production_versions WHERE job_id=? AND version_number=?').get(jobId, version) || null;
}

export function getActions(jobId, limit = 50) {
  return initDb().prepare('SELECT * FROM production_actions WHERE job_id=? ORDER BY id DESC LIMIT ?').all(jobId, limit);
}

// ---------- STATUS / DASHBOARD ----------
const PLATFORMS = ['facebook', 'instagram', 'line', 'tiktok'];

export function setPublish(jobId, platform, status, by = 'web') {
  const d = initDb();
  const p = String(platform || '').toLowerCase();
  if (!PLATFORMS.includes(p)) throw new Error('unknown platform: ' + platform);
  const st = String(status || '').toUpperCase() === 'PUBLISHED' ? 'PUBLISHED' : 'PENDING';
  d.prepare(`INSERT INTO publish_status (job_id,facebook_status,instagram_status,line_status,tiktok_status,updated_at)
    VALUES (?,'PENDING','PENDING','PENDING','PENDING',?)
    ON CONFLICT(job_id) DO NOTHING`).run(jobId, now());
  d.prepare(`UPDATE publish_status SET ${p}_status=?, updated_at=? WHERE job_id=?`).run(st, now(), jobId);
  const row = d.prepare('SELECT * FROM publish_status WHERE job_id=?').get(jobId);
  if (PLATFORMS.every(k => row[k + '_status'] === 'PUBLISHED')) {
    touchJob(jobId, { status: 'PUBLISHED', current_stage: 'PUBLISHED', completed_at: now() });
  } else if (st === 'PUBLISHED') {
    const j = d.prepare('SELECT status FROM production_jobs WHERE id=?').get(jobId);
    if (j && j.status !== 'PUBLISHED') touchJob(jobId, { status: 'READY_TO_PUBLISH', current_stage: 'READY' });
  }
  logAction(jobId, st === 'PUBLISHED' ? `PUBLISHED_${p.toUpperCase()}` : `${p.toUpperCase()}_RESET`, { platform: p, status: st }, by);
  return row;
}

export function getPublish(jobId) {
  return initDb().prepare('SELECT * FROM publish_status WHERE job_id=?').get(jobId) || null;
}

export function setQC(jobId, passed, note = '', by = 'web') {
  const ts = now();
  if (passed) {
    touchJob(jobId, { status: 'QC_PASSED', current_stage: 'QC' });
    logAction(jobId, 'QC_PASSED', { note }, by);
  } else {
    touchJob(jobId, { status: 'REVISION_REQUIRED', current_stage: 'QC' });
    logAction(jobId, 'QC_FAILED', { note }, by);
  }
  return initDb().prepare('SELECT * FROM production_jobs WHERE id=?').get(jobId);
}

export function productStatusSummary(code) {
  const d = initDb();
  const prod = getProductRow(code);
  if (!prod) return { code, exists: false };
  const jobs = d.prepare('SELECT * FROM production_jobs WHERE product_id=? ORDER BY v_code').all(prod.id);
  const out = [];
  for (const j of jobs) {
    const vers = d.prepare('SELECT COUNT(*) c, COALESCE(MAX(version_number),0) m FROM production_versions WHERE job_id=?').get(j.id);
    out.push({
      v_code: j.v_code, s_code: j.s_code, status: j.status, stage: j.current_stage,
      versions: vers.c, current_version: vers.m,
      updated_at: j.updated_at, publish: getPublish(j.id)
    });
  }
  return { code, exists: true, product: { name_th: prod.product_name_th, name_en: prod.product_name_en, category: prod.category }, jobs: out };
}

export function codesStatus(codes) {
  const d = initDb();
  const map = {};
  for (const code of codes) {
    const prod = getProductRow(code);
    if (!prod) { map[code] = { state: 'NOT_STARTED', v_done: [] }; continue; }
    const jobs = d.prepare('SELECT v_code,status FROM production_jobs WHERE product_id=?').all(prod.id);
    if (!jobs.length) { map[code] = { state: 'NOT_STARTED', v_done: [] }; continue; }
    const rank = { ERROR: 6, REVISION_REQUIRED: 5, PUBLISHED: 4, READY_TO_PUBLISH: 3, QC_PASSED: 3, GENERATED: 2, QC_PENDING: 2, IN_PROGRESS: 1, NOT_STARTED: 0 };
    let best = 'NOT_STARTED', br = -1;
    const vDone = [];
    for (const j of jobs) {
      if (['GENERATED', 'QC_PENDING', 'QC_PASSED', 'READY_TO_PUBLISH', 'PUBLISHED'].includes(j.status)) vDone.push(j.v_code);
      const r = rank[j.status] ?? 0;
      if (r > br) { br = r; best = j.status; }
    }
    map[code] = { state: best, v_done: vDone };
  }
  return map;
}

export function getDashboard() {
  const d = initDb();
  const total = d.prepare('SELECT COUNT(*) c FROM products WHERE product_code IS NOT NULL AND product_code<>?').get('').c;
  const withJobs = d.prepare('SELECT COUNT(DISTINCT product_id) c FROM production_jobs').get().c;
  const byStatus = {};
  for (const r of d.prepare('SELECT status,COUNT(*) c FROM production_jobs GROUP BY status').all()) byStatus[r.status] = r.c;
  const vCount = d.prepare(`SELECT v_code,COUNT(DISTINCT product_id) c FROM production_jobs
    WHERE status IN ('GENERATED','QC_PENDING','QC_PASSED','READY_TO_PUBLISH','PUBLISHED') GROUP BY v_code`).all();
  const errJobs = d.prepare(`SELECT j.id,p.product_code,j.v_code,j.status,j.updated_at FROM production_jobs j
    JOIN products p ON p.id=j.product_id WHERE j.status IN ('ERROR','REVISION_REQUIRED') ORDER BY j.updated_at DESC LIMIT 20`).all();
  return {
    products_total: total,
    products_untouched: total - withJobs,
    products_involved: withJobs,
    jobs_by_status: byStatus,
    v_done_counts: vCount,
    attention: errJobs,
    memoryMode
  };
}

export function getNextJobs(limit = 5) {
  const d = initDb();
  const rows = d.prepare(`SELECT product_code,product_name_th,product_name_en,category,main_image_url,fitment_text FROM products
    WHERE product_code IS NOT NULL AND product_code<>''
      AND main_image_url IS NOT NULL AND main_image_url<>''
      AND id NOT IN (SELECT product_id FROM production_jobs)
    LIMIT 200`).all();
  const scored = rows.map(r => {
    let score = 0; const why = [];
    if (r.fitment_text) { score += 2; why.push('มี Fitment'); }
    if (r.category) { score += 1; why.push('มีหมวด ' + r.category); }
    score += 1; why.push('มีรูปสินค้า');
    why.push('ยังไม่มี Content');
    return { ...r, score, why };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
  return scored;
}

// ---------- CAMPAIGNS ----------
export function createCampaign(name, opts = {}) {
  const d = initDb();
  const r = d.prepare(`INSERT INTO campaigns (campaign_name,campaign_type,start_date,end_date,target_count,status,created_at,updated_at)
    VALUES (?,?,?,?,?,'ACTIVE',?,?)`).run(name, opts.type || '', opts.start || '', opts.end || '', opts.target || 0, now(), now());
  return d.prepare('SELECT * FROM campaigns WHERE id=?').get(r.lastInsertRowid);
}

export function addCampaignItems(campaignId, codes) {
  const d = initDb();
  let n = 0;
  for (const code of codes) {
    const prod = getProductRow(code);
    if (!prod) continue;
    try {
      d.prepare('INSERT INTO campaign_items (campaign_id,product_id,status) VALUES (?,?,\'PENDING\')').run(campaignId, prod.id);
      n++;
    } catch { /* duplicate */ }
  }
  return n;
}

export function campaignProgress(campaignId) {
  const d = initDb();
  const camp = d.prepare('SELECT * FROM campaigns WHERE id=?').get(campaignId);
  if (!camp) return null;
  const items = d.prepare(`SELECT p.product_code,
      (SELECT COUNT(*) FROM production_jobs j WHERE j.product_id=ci.product_id
        AND j.status IN ('GENERATED','QC_PENDING','QC_PASSED','READY_TO_PUBLISH','PUBLISHED')) AS done
    FROM campaign_items ci JOIN products p ON p.id=ci.product_id WHERE ci.campaign_id=?`).all(campaignId);
  return { campaign: camp, total: items.length, done: items.filter(i => i.done > 0).length, items };
}

// ---------- AI MEMORY (context only, never production truth) ----------
export function setMemory(type, key, value, scope = 'project') {
  const d = initDb();
  d.prepare(`INSERT INTO ai_memory (memory_type,memory_key,memory_value,scope,created_at,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(memory_type,memory_key,scope) DO UPDATE SET memory_value=excluded.memory_value, updated_at=excluded.updated_at`)
    .run(type, key, String(value ?? ''), scope, now(), now());
}

export function getMemory(type, scope = 'project') {
  const out = {};
  for (const r of initDb().prepare('SELECT memory_key,memory_value FROM ai_memory WHERE memory_type=? AND scope=?').all(type, scope)) out[r.memory_key] = r.memory_value;
  return out;
}

// ---------- PRODUCT SHEETS (identity layer, versioned, never overwrite) ----------
export function getCurrentSheet(productId) {
  const d = initDb();
  const r = d.prepare('SELECT * FROM product_sheets WHERE product_id=? AND is_current=1').get(productId);
  if (!r) return null;
  r.references = d.prepare('SELECT image_url,source,view_type,notes FROM product_sheet_references WHERE product_sheet_id=? ORDER BY id').all(r.id);
  return r;
}

export function getSheetVersions(productId) {
  const d = initDb();
  return d.prepare('SELECT id,version_number,confidence,status,is_current,created_at,updated_at FROM product_sheets WHERE product_id=? ORDER BY version_number').all(productId);
}

export function saveSheetVersion(productId, { snapshot, identity, refmap, locks, confidence = 0, status = 'DRAFT' }) {
  const d = initDb();
  const cur = d.prepare('SELECT COALESCE(MAX(version_number),0) AS m FROM product_sheets WHERE product_id=?').get(productId).m;
  const n = cur + 1;
  d.prepare('UPDATE product_sheets SET is_current=0 WHERE product_id=?').run(productId);
  const ts = now();
  const r = d.prepare(`INSERT INTO product_sheets
    (product_id,version_number,source_snapshot,identity_json,reference_map_json,lock_rules_json,confidence,status,created_at,updated_at,is_current)
    VALUES (?,?,?,?,?,?,?,?,?,?,1)`).run(productId, n,
    JSON.stringify(snapshot || {}), JSON.stringify(identity || {}),
    JSON.stringify(refmap || {}), JSON.stringify(locks || {}),
    confidence, status, ts, ts);
  return { id: Number(r.lastInsertRowid), version_number: n };
}

export function setSheetStatus(id, status, note = '') {
  const d = initDb();
  d.prepare('UPDATE product_sheets SET status=?, updated_at=? WHERE id=?').run(status, now(), id);
  if (note || true) d.prepare('INSERT INTO product_sheet_actions (product_sheet_id,action_type,action_data,created_at) VALUES (?,?,?,?)')
    .run(id, status === 'VERIFIED' ? 'SHEET_VERIFIED' : 'SHEET_STATUS', JSON.stringify({ status, note }), now());
  return d.prepare('SELECT * FROM product_sheets WHERE id=?').get(id);
}

export function addSheetRefs(sheetId, refs) {
  const d = initDb();
  const stmt = d.prepare('INSERT INTO product_sheet_references (product_sheet_id,image_url,source,view_type,notes,created_at) VALUES (?,?,?,?,?,?)');
  tx(() => { for (const r of refs) stmt.run(sheetId, r.url || '', r.source || '', r.view || '', r.notes || '', now()); });
}

export function logSheetAction(sheetId, type, data = {}) {
  initDb().prepare('INSERT INTO product_sheet_actions (product_sheet_id,action_type,action_data,created_at) VALUES (?,?,?,?)')
    .run(sheetId, type, JSON.stringify(data), now());
}

export function getSheetActions(sheetId, limit = 30) {
  return initDb().prepare('SELECT * FROM product_sheet_actions WHERE product_sheet_id=? ORDER BY id DESC LIMIT ?').all(sheetId, limit);
}

export function setSheetVisual(sheetId, promptText) {
  const d = initDb();
  d.prepare('UPDATE product_sheets SET visual_prompt=?, updated_at=? WHERE id=?').run(String(promptText || '').slice(0, 8000), now(), sheetId);
  d.prepare('INSERT INTO product_sheet_actions (product_sheet_id,action_type,action_data,created_at) VALUES (?,?,?,?)')
    .run(sheetId, 'SHEET_PROMPT_SAVED', JSON.stringify({ chars: String(promptText || '').length }), now());
  return d.prepare('SELECT * FROM product_sheets WHERE id=?').get(sheetId);
}

// ---------- PLATFORM CONTENT (versioned per product+platform+angle) ----------
export function saveContentVersion(productId, { jobId = null, platform, angle = 'A', content, qa, score = 0, status = 'DRAFT' }) {
  const d = initDb();
  const cur = d.prepare('SELECT COALESCE(MAX(version),0) AS m FROM platform_content WHERE product_id=? AND platform=? AND content_angle=?').get(productId, platform, angle).m;
  const n = cur + 1;
  d.prepare('UPDATE platform_content SET is_current=0 WHERE product_id=? AND platform=? AND content_angle=?').run(productId, platform, angle);
  const ts = now();
  const r = d.prepare(`INSERT INTO platform_content
    (product_id,job_id,platform,content_angle,version,content_json,qa_json,score,status,created_at,updated_at,is_current)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`).run(productId, jobId, platform, angle, n,
    JSON.stringify(content || {}), JSON.stringify(qa || {}), score, status, ts, ts);
  return { id: Number(r.lastInsertRowid), version: n };
}

export function getCurrentContent(productId, platform, angle = 'A') {
  return initDb().prepare('SELECT * FROM platform_content WHERE product_id=? AND platform=? AND content_angle=? AND is_current=1').get(productId, platform, angle) || null;
}

export function getContentHistory(productId, platform, angle = 'A') {
  return initDb().prepare('SELECT id,version,score,status,created_at,updated_at FROM platform_content WHERE product_id=? AND platform=? AND content_angle=? ORDER BY version').all(productId, platform, angle);
}

export function setContentStatus(id, status) {
  const d = initDb();
  d.prepare('UPDATE platform_content SET status=?, updated_at=? WHERE id=?').run(status, now(), id);
  return d.prepare('SELECT * FROM platform_content WHERE id=?').get(id);
}

export function dbFile() { return memoryMode ? ':memory:' : DB_FILE; }
