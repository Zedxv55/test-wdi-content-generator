import express from 'express';
import XLSX from 'xlsx';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT || 3077);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PRODUCT_FILE = 'D:\\Windows\\Document\\VSCode\\ex\\Present(Get-web-wdi).xlsx';
const VIDEO_FILE = 'D:\\Windows\\Document\\VSCode\\ex\\Present(Short-vdo).xlsx';
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(ROOT, 'public')));

const clean = v => String(v ?? '').trim();
const unique = a => [...new Set(a.map(clean).filter(Boolean))];
function readSheet(file, index = 0) {
  const wb = XLSX.readFile(file);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[index]], { defval: '' });
}
function loadProducts() { return readSheet(PRODUCT_FILE); }
function loadTemplates() { return readSheet(VIDEO_FILE).filter(r => clean(r['Ã Â¸â€¹Ã Â¸ÂµÃ Â¸Â£Ã Â¸ÂµÃ Â¸ÂªÃ Â¹Å’/Ai'])); }
function envStatus() {
  return { dotenvLoaded: true, provider: process.env.AI_PROVIDER || 'openrouter', openrouterKeyConfigured: Boolean(process.env.OPENROUTER_API_KEY), model: process.env.OPENROUTER_MODEL || 'minimax/minimax-m3:free', port: PORT };
}

app.get('/api/health', (q, s) => {
  try { s.json({ ok: true, products: loadProducts().length, templates: loadTemplates().length, ai: envStatus() }); }
  catch (e) { s.status(500).json({ ok: false, error: e.message }); }
});
app.get('/api/config', (q, s) => s.json(envStatus()));
app.get('/api/meta', (q, s) => {
  const r = loadProducts();
  s.json({ total: r.length, categories: unique(r.map(x => x.Category)), subCategories: unique(r.map(x => x['Sub Category'])), brands: unique(r.map(x => x['Car Brand'])), models: unique(r.map(x => x['Car Model'])) });
});
app.get('/api/templates', (q, s) => s.json(loadTemplates().map((r, i) => ({
  id: i, name: clean(r['Ã Â¸â€¹Ã Â¸ÂµÃ Â¸Â£Ã Â¸ÂµÃ Â¸ÂªÃ Â¹Å’/Ai']), type: clean(r['Ã Â¸â€ºÃ Â¸Â£Ã Â¸Â°Ã Â¹â‚¬Ã Â¸Â Ã Â¸â€”Ã Â¸â€¡Ã Â¸Â²Ã Â¸â„¢']), duration: clean(r['Ã Â¸â€žÃ Â¸Â§Ã Â¸Â²Ã Â¸Â¡Ã Â¸Â¢Ã Â¸Â²Ã Â¸Â§Ã Â¹ÂÃ Â¸â„¢Ã Â¸Â°Ã Â¸â„¢Ã Â¸Â³']), hook: clean(r['Hook Ã Â¸â€¢Ã Â¸Â±Ã Â¸Â§Ã Â¸Â­Ã Â¸Â¢Ã Â¹Ë†Ã Â¸Â²Ã Â¸â€¡']), content: clean(r['Ã Â¹â‚¬Ã Â¸â„¢Ã Â¸Â·Ã Â¹â€°Ã Â¸Â­Ã Â¸Â«Ã Â¸Â²']), cta: clean(r['CTA']), prompt: clean(r['Prompt Ã Â¸ÂÃ Â¸Â¥Ã Â¸Â²Ã Â¸â€¡Ã Â¹Æ’Ã Â¸Å Ã Â¹â€°Ã Â¹â€žÃ Â¸â€Ã Â¹â€°Ã Â¸â€”Ã Â¸Â¸Ã Â¸ÂÃ Â¸Â£Ã Â¸Â¹Ã Â¸â€ºÃ Â¹ÂÃ Â¸Å¡Ã Â¸Å¡ (Google Flow - Scene Ã Â¹Æ’Ã Â¸Â«Ã Â¹â€° AI Ã Â¸Å¾Ã Â¸Â´Ã Â¸Ë†Ã Â¸Â²Ã Â¸Â£Ã Â¸â€œÃ Â¸Â²Ã Â¹â‚¬Ã Â¸Â­Ã Â¸â€¡Ã Â¸â€¢Ã Â¸Â²Ã Â¸Â¡Ã Â¸â€žÃ Â¸Â§Ã Â¸Â²Ã Â¸Â¡Ã Â¸Â¢Ã Â¸Â²Ã Â¸Â§Ã Â¸â€”Ã Â¸ÂµÃ Â¹Ë†Ã Â¸ÂÃ Â¸Â³Ã Â¸Â«Ã Â¸â„¢Ã Â¸â€']), storyboard: [clean(r['Storyboard 00.00-10.00']), clean(r['10.01-20.00']), clean(r['20.01-30.00'])], imagePrompt: clean(r['Prompt image to video']), references: clean(r['Reference Ã Â¸â€”Ã Â¸ÂµÃ Â¹Ë†Ã Â¸â€¢Ã Â¹â€°Ã Â¸Â­Ã Â¸â€¡Ã Â¹â‚¬Ã Â¸â€¢Ã Â¸Â£Ã Â¸ÂµÃ Â¸Â¢Ã Â¸Â¡']), cautions: clean(r['Ã Â¸â€šÃ Â¹â€°Ã Â¸Â­Ã Â¸â€žÃ Â¸Â§Ã Â¸Â£Ã Â¸Â£Ã Â¸Â°Ã Â¸Â§Ã Â¸Â±Ã Â¸â€¡Ã Â¸Â Ã Â¸Â²Ã Â¸Å¾Ã Â¸Â¥Ã Â¸Â±Ã Â¸ÂÃ Â¸Â©Ã Â¸â€œÃ Â¹Å’/Ã Â¸â€šÃ Â¹â€°Ã Â¸Â­Ã Â¸Â¡Ã Â¸Â¹Ã Â¸Â¥']), platforms: clean(r['Ã Â¹ÂÃ Â¸Å¾Ã Â¸Â¥Ã Â¸â€¢Ã Â¸Å¸Ã Â¸Â­Ã Â¸Â£Ã Â¹Å’Ã Â¸Â¡'])
}))));
app.get('/api/products', (q, s) => {
  let r = loadProducts();
  const x = clean(q.query.q).toLowerCase();
  for (const [k, v] of Object.entries({ Category: q.query.category, 'Sub Category': q.query.subCategory, 'Car Brand': q.query.brand, 'Car Model': q.query.model })) if (clean(v)) r = r.filter(a => clean(a[k]) === clean(v));
  if (x) r = r.filter(a => Object.values(a).some(v => clean(v).toLowerCase().includes(x)));
  s.json(r.slice(0, 500));
});

function buildPrompt(p, t) {
  return `You are the senior content producer for DIAMOND/WDI. SOURCE OF TRUTH: PRODUCT DATA below. VIDEO TEMPLATE is supplied from the company's Short-vdo workbook.\n\nPRODUCT DATA:\n${JSON.stringify(p, null, 2)}\n\nVIDEO TEMPLATE:\n${JSON.stringify(t, null, 2)}\n\nMANDATORY RULES:\n1) Never invent compatibility, model/year, specifications, included parts, price, stock, warranty or claims.\n2) Product Code, names and fitment must remain exactly as supplied.\n3) Category hierarchy is authoritative. Treat Car Brand/Car Model as fitment context only when populated.\n4) For multi-context products, mention only the selected row context; never merge unrelated vehicle models.\n5) Use real product images as references; never redesign, mirror, recolor or alter geometry.\n6) Do not generate Thai text, logos, QR, phone numbers or technical text inside video. Leave safe areas for post-production.\n7) Vertical 9:16, premium restrained DIAMOND look, subtle ambient audio, no dialogue unless required.\n8) Follow the selected template exactly. Segment 2/3 must include continuation instruction where continuity applies.\n9) Flow prompts MUST be English and ready to paste. Marketing script/caption MUST be Thai.\n10) Return JSON only.\nJSON: {"series":"","duration":"","hook":"","script":"","voiceover":"","scenes":[{"time":"","visual":"","overlay":"","flow_prompt":""}],"image_to_video_prompt":"","caption":"","hashtags":[],"cta":"","source_facts":[],"warnings":[]}`;
}

app.post('/api/generate', async (q, s) => {
  try {
    const p = q.body.product;
    if (!p) return s.status(400).json({ error: 'Ã Â¹â€žÃ Â¸Â¡Ã Â¹Ë†Ã Â¸Å¾Ã Â¸Å¡Ã Â¸ÂªÃ Â¸Â´Ã Â¸â„¢Ã Â¸â€žÃ Â¹â€°Ã Â¸Â²' });
    const ts = loadTemplates();
    const t = ts[Number(q.body.templateId) || 0];
    if (!t) return s.status(404).json({ error: 'Ã Â¹â€žÃ Â¸Â¡Ã Â¹Ë†Ã Â¸Å¾Ã Â¸Å¡ Video Template' });
    if (!process.env.OPENAI_API_KEY) return s.status(503).json({ error: 'Ã Â¸Â¢Ã Â¸Â±Ã Â¸â€¡Ã Â¹â€žÃ Â¸Â¡Ã Â¹Ë†Ã Â¹â€žÃ Â¸â€Ã Â¹â€°Ã Â¸â€¢Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡Ã Â¸â€žÃ Â¹Ë†Ã Â¸Â² OPENAI_API_KEY Ã Â¹Æ’Ã Â¸â„¢ .env' });
    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await ai.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-5.6-luna', input: buildPrompt(p, t) });
    const text = r.output_text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    try { s.json(JSON.parse(text)); } catch { s.json({ raw: text, series: t['Ã Â¸â€¹Ã Â¸ÂµÃ Â¸Â£Ã Â¸ÂµÃ Â¸ÂªÃ Â¹Å’/Ai'], warnings: ['AI returned non-JSON output'] }); }
  } catch (e) {
    const status = e?.status === 401 ? 502 : e?.status === 429 ? 503 : 500;
    const message = e?.status === 429 ? 'OpenAI API Ã Â¸â€¢Ã Â¸Â­Ã Â¸Å¡ 429: Ã Â¸Å¡Ã Â¸Â±Ã Â¸ÂÃ Â¸Å Ã Â¸Âµ/API project Ã Â¸Â¢Ã Â¸Â±Ã Â¸â€¡Ã Â¹â€žÃ Â¸Â¡Ã Â¹Ë† active Ã Â¸Â«Ã Â¸Â£Ã Â¸Â·Ã Â¸Â­ billing Ã Â¸Â¢Ã Â¸Â±Ã Â¸â€¡Ã Â¹â€žÃ Â¸Â¡Ã Â¹Ë†Ã Â¸Å¾Ã Â¸Â£Ã Â¹â€°Ã Â¸Â­Ã Â¸Â¡ Ã Â¸ÂÃ Â¸Â£Ã Â¸Â¸Ã Â¸â€œÃ Â¸Â²Ã Â¸â€¢Ã Â¸Â£Ã Â¸Â§Ã Â¸Ë†Ã Â¸ÂªÃ Â¸Â­Ã Â¸Å¡ billing Ã Â¹ÂÃ Â¸Â¥Ã Â¹â€°Ã Â¸Â§Ã Â¸Â¥Ã Â¸Â­Ã Â¸â€¡ Generate Ã Â¹Æ’Ã Â¸Â«Ã Â¸Â¡Ã Â¹Ë†' : e?.message || 'Ã Â¹â‚¬Ã Â¸ÂÃ Â¸Â´Ã Â¸â€Ã Â¸â€šÃ Â¹â€°Ã Â¸Â­Ã Â¸Å“Ã Â¸Â´Ã Â¸â€Ã Â¸Å¾Ã Â¸Â¥Ã Â¸Â²Ã Â¸â€Ã Â¹Æ’Ã Â¸â„¢Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¸ÂªÃ Â¸Â£Ã Â¹â€°Ã Â¸Â²Ã Â¸â€¡ Content Pack';
    s.status(status).json({ error: message, code: e?.code || null, status: e?.status || null });
  }
});

app.listen(PORT, () => console.log(`WDI Content Generator: http://localhost:${PORT}`));
