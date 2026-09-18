// Flow Storyboard planner — deterministic, no AI.
// Converts (total seconds, model capability) into generation units (scenes).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CAP_FILE = path.join(ROOT, 'data', 'flow-capabilities.json');
const require = createRequire(import.meta.url);
const XLSX_MOD = require('xlsx');
const VIDEO_FILE = (() => {
  const v = String(process.env.VIDEO_FILE || '').trim();
  if (v) return path.isAbsolute(v) ? v : path.join(ROOT, v);
  return path.join(ROOT, 'data', 'Present(Short-vdo)ล่าสุด.xlsx');
})();

export function loadCapabilities() {
  // Master: MODEL CAPABILITIES section inside the workbook sheet.
  // Fallback: data/flow-capabilities.json when the sheet section is absent.
  try {
    const fromSheet = loadCapabilitiesFromSheet();
    if (fromSheet && Object.keys(fromSheet.models || {}).length) return fromSheet;
  } catch {}
  const raw = JSON.parse(fs.readFileSync(CAP_FILE, 'utf8'));
  return raw;
}

export const MODEL_ALIASES = {
  'gemini-omni-flash-1.1': 'gemini-omni-flash',
  'gemini-omni-flash-1.0': 'gemini-omni-flash',
  'veo-3.1': 'veo-3.1-fast'
};

function capKey(k, models) {
  const c = String(k || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (models[c]) return c;
  if (MODEL_ALIASES[c] && models[MODEL_ALIASES[c]]) return MODEL_ALIASES[c];
  return null;
}

function loadCapabilitiesFromSheet() {
  const wb = XLSX_MOD.readFile(VIDEO_FILE);
  const ws = wb.Sheets['Flow Storyboard Builder'];
  if (!ws) return null;
  const rows = XLSX_MOD.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const clean = v => String(v ?? '').trim();
  const hi = rows.findIndex(r => clean(r[0]).toLowerCase() === 'model');
  if (hi < 0) return null;
  const models = {};
  for (let i = hi + 1; i < rows.length; i++) {
    const name = clean(rows[i][0]);
    if (!name || /^(generation|default)\b/i.test(name)) {
      if (/^generation/i.test(name)) break;
      if (!name) continue;
      if (/^default$/i.test(name)) continue;
    }
    const durs = (String(rows[i][1] || '').match(/\d+/g) || []).map(Number).filter(n => n > 0);
    if (!durs.length) continue;
    const key = name.toLowerCase().replace(/\s+/g, '-');
    models[key] = {
      label: name,
      durations: [...new Set(durs)].sort((a, b) => a - b),
      supportsReferences: clean(rows[i][2]) || true,
      notes: clean(rows[i][6])
    };
  }
  if (!Object.keys(models).length) return null;
  let fallback = null;
  try { fallback = JSON.parse(fs.readFileSync(CAP_FILE, 'utf8')); } catch {}
  const fbDef = fallback && fallback.defaultModel;
  const keys = Object.keys(models);
  return { models, defaultModel: (fbDef && models[fbDef]) ? fbDef : keys[0], strategy: (fallback && fallback.strategy) || {}, _source: 'sheet' };
}

// Storyboard master rows keyed by S_CODE (user-owned content, 5-scene columns).
export function loadStoryboardRows() {
  try {
    const wb = XLSX_MOD.readFile(VIDEO_FILE);
    const ws = wb.Sheets['Flow Storyboard Builder'];
    if (!ws) return {};
    const rows = XLSX_MOD.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const clean = v => String(v ?? '').trim();
    const head = rows[0] || [];
    const col = n => head.indexOf(n);
    const out = {};
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const s = clean(r[col('S_CODE')]);
      if (!/^S\d+$/.test(s)) continue;
      out[s] = {
        s_code: s, v_code: clean(r[col('V_CODE')]), c_code: clean(r[col('C_CODE')]),
        scene_count: Number(clean(r[col('SCENE_COUNT')])) || 0,
        total_duration: clean(r[col('TOTAL_DURATION')]),
        scenes: [1, 2, 3, 4, 5].map(n => ({
          duration: clean(r[col(`SCENE_${n}_DURATION`)]),
          purpose: clean(r[col(`SCENE_${n}_PURPOSE`)]),
          reference: clean(r[col(`SCENE_${n}_REFERENCE`)]),
          start_source: clean(r[col(`SCENE_${n}_START_SOURCE`)]),
          end_goal: clean(r[col(`SCENE_${n}_END_GOAL`)]),
          continuity: clean(r[col(`SCENE_${n}_CONTINUITY`)])
        })).filter(x => x.purpose || x.reference),
        risk: clean(r[col('RISK')]), qc: clean(r[col('QC')])
      };
    }
    return out;
  } catch { return {}; }
}

export function planDurations(totalSecs, modelKey) {
  const caps = loadCapabilities();
  const key = capKey(modelKey, caps.models) || caps.defaultModel;
  const model = caps.models[key];
  const ds = [...model.durations].sort((a, b) => b - a); // longest first
  const total = Math.max(1, Math.round(Number(totalSecs) || 30));
  // Best combo: exact match preferred, else nearest below; fewest segments wins ties.
  let best = null;
  const search = (rem, acc) => {
    if (acc.length > 8) return;
    if (rem === 0) {
      if (!best || acc.length < best.length) best = [...acc];
      return;
    }
    if (rem < 0) return;
    for (const d of ds) {
      if (best && acc.length + 1 >= best.length && rem - d !== 0) continue;
      if (d <= rem) { acc.push(d); search(rem - d, acc); acc.pop(); }
    }
  };
  search(total, []);
  let segments, planned;
  if (best) { segments = best; planned = total; }
  else {
    // nearest reachable below
    for (let t = total - 1; t >= ds[ds.length - 1]; t--) {
      best = null; search(t, []);
      if (best) { segments = best; planned = t; break; }
    }
    if (!segments) { segments = [ds[ds.length - 1]]; planned = segments[0]; }
  }
  return {
    model: key, modelLabel: model.label, requested: total, planned_total: planned,
    remainder: total - planned, segments,
    generations: segments.length,
    supportsReferences: model.supportsReferences,
    supportsFirstLastFrame: model.supportsFirstLastFrame
  };
}

const BEAT_NAMES = ['introduce', 'detail', 'reveal', 'proof', 'close', 'extra'];

export function buildStoryboard({ plan, templateRow, sheetRefs = [], productCode = '', sheetRow = null }) {
  const clean = v => String(v ?? '').trim();
  const sb = [
    clean(templateRow?.['Storyboard 1 / 00:00–10:00']),
    clean(templateRow?.['Storyboard 2 / 10:00–20:00']),
    clean(templateRow?.['Storyboard 3 / 20:00–30:00'])
  ];
  const refs = sheetRefs.length ? sheetRefs : [];
  const hero = refs[0] || '';
  const rowScenes = (sheetRow && Array.isArray(sheetRow.scenes) ? sheetRow.scenes : []).filter(x => x && (x.purpose || x.reference));
  const rowScene = i => (rowScenes.length ? rowScenes[i % rowScenes.length] : null);
  const scenes = plan.segments.map((dur, i) => {
    const n = i + 1;
    const id = 'SC' + String(n).padStart(2, '0');
    const rs = rowScene(i);
    const purpose = (rs && rs.purpose) || sb[i] || `${BEAT_NAMES[i] || 'beat'} — ${clean(templateRow?.['ซีรีส์/Ai']) || 'series beat'}`;
    // reference mapping: sheet row reference wins; else SC01 hero; SC02 first additional; rest next additional or previous final frame
    let reference = [];
    let needsReview = false;
    if (rs && rs.reference) {
      reference = rs.reference.split('+').map(s => clean(s)).filter(Boolean);
      if (!reference.length) { reference = ['[REFERENCE_NOT_AVAILABLE]']; needsReview = true; }
    } else if (i === 0) {
      if (hero) reference = ['Product Sheet', 'HERO'];
      else { reference = ['[REFERENCE_NOT_AVAILABLE]']; needsReview = true; }
    } else if (refs[i]) {
      reference = ['Product Sheet', refs[i].view || ('ADDITIONAL_' + i)];
    } else if (refs.length > 1) {
      reference = ['Product Sheet', refs[refs.length - 1].view || 'HERO'];
    } else {
      reference = [`${i === 1 ? 'SC01' : 'SC' + String(n - 1).padStart(2, '0')} final frame`, 'Product Sheet'];
    }
    const start_source = (rs && rs.start_source) || (i === 0
      ? (hero ? 'Product Sheet hero' : '[REFERENCE_NOT_AVAILABLE]')
      : `SC${String(n - 1).padStart(2, '0')} final frame`);
    return {
      id, duration: dur + 's', seconds: dur,
      purpose: purpose.slice(0, 300),
      reference,
      start_source,
      end_goal: (rs && rs.end_goal) || (i === plan.segments.length - 1 ? 'final hero frame' : `clean handoff frame for SC${String(n + 1).padStart(2, '0')}`),
      continuity: (rs && rs.continuity) || (i === 0
        ? 'preserve product identity from reference'
        : `start from previous final frame when physically valid; same product geometry`),
      risk: (sheetRow && sheetRow.risk) || clean(templateRow?.['ระดับความเสี่ยง']) || '',
      qc: (sheetRow && sheetRow.qc) || ['identity matches sheet', 'reference used, no invented view', 'text-safe area left'].join(' | '),
      needs_review: needsReview,
      camera: '', action: '', visual: ''
    };
  });
  return {
    total_duration: plan.planned_total + 's',
    requested: plan.requested + 's',
    remainder: plan.remainder ? plan.remainder + 's (trim/extend in edit)' : '0s',
    model: plan.model, modelLabel: plan.modelLabel,
    generations: plan.generations,
    scenes
  };
}
