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
function loadTemplates() { return readSheet(VIDEO_FILE).filter(r => clean(r['ซีรีส์/Ai'])); }
function envStatus() {
  const hasOR = Boolean(process.env.OPENROUTER_API_KEY);
  const hasOA = Boolean(process.env.OPENAI_API_KEY);
  const provider = process.env.AI_PROVIDER || (hasOR ? 'openrouter' : hasOA ? 'openai' : 'openrouter');
  const model = provider === 'openrouter'
    ? (process.env.OPENROUTER_MODEL || 'minimax/minimax-m3:free')
    : (process.env.OPENAI_MODEL || 'gpt-4o-mini');
  return { dotenvLoaded: true, provider, openrouterKeyConfigured: hasOR, openaiKeyConfigured: hasOA, model, port: PORT };
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
  id: i, name: clean(r['ซีรีส์/Ai']), type: clean(r['ประเภทงาน']), duration: clean(r['ความยาวแนะนำ']), hook: clean(r['Hook ตัวอย่าง']), content: clean(r['เนื้อหา']), cta: clean(r['CTA']), prompt: clean(r['Prompt กลางใช้ได้ทุกรูปแบบ (Google Flow - Scene ให้ AI พิจารณาเองตามความยาวที่กำหนด)']), storyboard: [clean(r['Storyboard 00.00-10.00']), clean(r['10.01-20.00']), clean(r['20.01-30.00'])], imagePrompt: clean(r['Prompt image to video']), references: clean(r['Reference ที่ต้องเตรียม']), cautions: clean(r['ข้อควรระวังภาพลักษณ์/ข้อมูล']), platforms: clean(r['แพลตฟอร์ม'])
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
    if (!p) return s.status(400).json({ error: 'ไม่พบสินค้า' });
    const ts = loadTemplates();
    const t = ts[Number(q.body.templateId) || 0];
    if (!t) return s.status(404).json({ error: 'ไม่พบ Video Template' });
    const hasOR = Boolean(process.env.OPENROUTER_API_KEY);
    const hasOA = Boolean(process.env.OPENAI_API_KEY);
    if (!hasOR && !hasOA) return s.status(503).json({ error: 'ยังไม่ได้ตั้งค่า API Key ใน .env (ต้องมี OPENROUTER_API_KEY หรือ OPENAI_API_KEY)' });
    const useOR = hasOR && (process.env.AI_PROVIDER !== 'openai');
    let text = '';
    if (useOR) {
      const baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
      const model = process.env.OPENROUTER_MODEL || 'minimax/minimax-m3:free';
      const ai = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL,
        defaultHeaders: { 'HTTP-Referer': 'http://localhost:3077', 'X-Title': 'WDI Content Generator' }
      });
      const r = await ai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: buildPrompt(p, t) }],
        temperature: 0.7,
        max_tokens: 4000
      });
      text = (r.choices?.[0]?.message?.content || '').trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    } else {
      const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await ai.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', input: buildPrompt(p, t) });
      text = (r.output_text || '').trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    }
    try { s.json(JSON.parse(text)); } catch { s.json({ raw: text, series: clean(t['ซีรีส์/Ai']), warnings: ['AI returned non-JSON output'] }); }
  } catch (e) {
    const status = e?.status === 401 ? 502 : e?.status === 429 ? 503 : 500;
    let message = e?.message || 'เกิดข้อผิดพลาดในการสร้าง Content Pack';
    if (e?.status === 429) message = 'API ตอบ 429 (rate limit / billing ไม่ active): ' + e.message;
    if (e?.status === 402) message = 'OpenRouter 402: เครดิตฟรีหมดหรือต้องเติมเครดิต - ลองเปลี่ยนโมเดล :free อื่น';
    s.status(status).json({ error: message, code: e?.code || null, status: e?.status || null });
  }
});

app.listen(PORT, () => console.log(`WDI Content Generator: http://localhost:${PORT}`));
