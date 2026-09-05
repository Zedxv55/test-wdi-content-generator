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
function loadTemplates() { return readSheet(VIDEO_FILE).filter(r => clean(r['à¸‹à¸µà¸£à¸µà¸ªà¹Œ/Ai'])); }
function envStatus() {
  return { dotenvLoaded: true, openaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || 'gpt-5.6-luna', port: PORT };
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
  id: i, name: clean(r['à¸‹à¸µà¸£à¸µà¸ªà¹Œ/Ai']), type: clean(r['à¸›à¸£à¸°à¹€à¸ à¸—à¸‡à¸²à¸™']), duration: clean(r['à¸„à¸§à¸²à¸¡à¸¢à¸²à¸§à¹à¸™à¸°à¸™à¸³']), hook: clean(r['Hook à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡']), content: clean(r['à¹€à¸™à¸·à¹‰à¸­à¸«à¸²']), cta: clean(r['CTA']), prompt: clean(r['Prompt à¸à¸¥à¸²à¸‡à¹ƒà¸Šà¹‰à¹„à¸”à¹‰à¸—à¸¸à¸à¸£à¸¹à¸›à¹à¸šà¸š (Google Flow - Scene à¹ƒà¸«à¹‰ AI à¸žà¸´à¸ˆà¸²à¸£à¸“à¸²à¹€à¸­à¸‡à¸•à¸²à¸¡à¸„à¸§à¸²à¸¡à¸¢à¸²à¸§à¸—à¸µà¹ˆà¸à¸³à¸«à¸™à¸”']), storyboard: [clean(r['Storyboard 00.00-10.00']), clean(r['10.01-20.00']), clean(r['20.01-30.00'])], imagePrompt: clean(r['Prompt image to video']), references: clean(r['Reference à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¹€à¸•à¸£à¸µà¸¢à¸¡']), cautions: clean(r['à¸‚à¹‰à¸­à¸„à¸§à¸£à¸£à¸°à¸§à¸±à¸‡à¸ à¸²à¸žà¸¥à¸±à¸à¸©à¸“à¹Œ/à¸‚à¹‰à¸­à¸¡à¸¹à¸¥']), platforms: clean(r['à¹à¸žà¸¥à¸•à¸Ÿà¸­à¸£à¹Œà¸¡'])
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
    if (!p) return s.status(400).json({ error: 'à¹„à¸¡à¹ˆà¸žà¸šà¸ªà¸´à¸™à¸„à¹‰à¸²' });
    const ts = loadTemplates();
    const t = ts[Number(q.body.templateId) || 0];
    if (!t) return s.status(404).json({ error: 'à¹„à¸¡à¹ˆà¸žà¸š Video Template' });
    if (!process.env.OPENAI_API_KEY) return s.status(503).json({ error: 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸² OPENAI_API_KEY à¹ƒà¸™ .env' });
    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await ai.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-5.6-luna', input: buildPrompt(p, t) });
    const text = r.output_text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    try { s.json(JSON.parse(text)); } catch { s.json({ raw: text, series: t['à¸‹à¸µà¸£à¸µà¸ªà¹Œ/Ai'], warnings: ['AI returned non-JSON output'] }); }
  } catch (e) {
    const status = e?.status === 401 ? 502 : e?.status === 429 ? 503 : 500;
    const message = e?.status === 429 ? 'OpenAI API à¸•à¸­à¸š 429: à¸šà¸±à¸à¸Šà¸µ/API project à¸¢à¸±à¸‡à¹„à¸¡à¹ˆ active à¸«à¸£à¸·à¸­ billing à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸£à¹‰à¸­à¸¡ à¸à¸£à¸¸à¸“à¸²à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸š billing à¹à¸¥à¹‰à¸§à¸¥à¸­à¸‡ Generate à¹ƒà¸«à¸¡à¹ˆ' : e?.message || 'à¹€à¸à¸´à¸”à¸‚à¹‰à¸­à¸œà¸´à¸”à¸žà¸¥à¸²à¸”à¹ƒà¸™à¸à¸²à¸£à¸ªà¸£à¹‰à¸²à¸‡ Content Pack';
    s.status(status).json({ error: message, code: e?.code || null, status: e?.status || null });
  }
});

app.listen(PORT, () => console.log(`WDI Content Generator: http://localhost:${PORT}`));
