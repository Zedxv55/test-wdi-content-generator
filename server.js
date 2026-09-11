import express from 'express';
import XLSX from 'xlsx';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT || 3077);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const clean = v => String(v ?? '').trim();
function resolveFile(envKey, fallbackName) {
  const fromEnv = clean(process.env[envKey]);
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.join(ROOT, fromEnv);
  const candidates = [path.join(ROOT,'data',fallbackName),path.join(ROOT,fallbackName),path.join(ROOT,'..',fallbackName),`D:\\Windows\\Document\\VSCode\\ex\\${fallbackName}`];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[0];
}
const PRODUCT_FILE = resolveFile('PRODUCT_FILE','Present(Get-web-wdi).xlsx');
const VIDEO_FILE = resolveFile('VIDEO_FILE','Present(Short-vdo).xlsx');
const FITMENT_FILE = path.join(ROOT,'data','WDI-Fitment-Master.xlsx');
app.use(express.json({limit:'4mb'}));
app.use(express.static(path.join(ROOT,'public')));

app.get('/api/wdi/image', async (q,s)=>{
  try{const u=new URL(clean(q.query.url));if(u.hostname!=='www.wdi.co.th')return s.status(400).send('Only WDI images allowed');const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 WDI-Content-Generator'}});if(!r.ok)return s.status(r.status).send('WDI image unavailable');s.set('Content-Type',r.headers.get('content-type')||'image/jpeg');s.set('Cache-Control','public, max-age=86400');s.send(Buffer.from(await r.arrayBuffer()));}catch(e){s.status(502).send('Image proxy error');}
});
app.get('/api/wdi/catalog',(q,s)=>{try{const file=path.join(ROOT,'data','wdi-catalog.json');if(!fs.existsSync(file))return s.json({synced:false,total:0,products:[]});const data=JSON.parse(fs.readFileSync(file,'utf8'));s.json({synced:true,generatedAt:data.generatedAt,total:data.productCount||(data.products||[]).length,products:(data.products||[]).slice(0,1000)});}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/wdi/sync',async(q,s)=>{try{const{spawn}=await import('node:child_process');const child=spawn(process.execPath,[path.join(ROOT,'wdi-sync-all.mjs')],{cwd:ROOT,windowsHide:true});let out='',err='';child.stdout.on('data',d=>{out+=d.toString()});child.stderr.on('data',d=>{err+=d.toString()});await new Promise((resolve,reject)=>{child.on('close',code=>code===0?resolve():reject(new Error(err||out||('sync exit '+code))));child.on('error',reject)});const data=JSON.parse(fs.readFileSync(path.join(ROOT,'data','wdi-catalog.json'),'utf8'));s.json({ok:true,total:data.productCount,generatedAt:data.generatedAt});}catch(e){s.status(500).json({ok:false,error:e.message});}});
const unique=a=>[...new Set(a.map(clean).filter(Boolean))];
function readSheet(file,index=0){const wb=XLSX.readFile(file);return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[index]],{defval:''});}
function loadProducts(){return readSheet(PRODUCT_FILE);}
function loadFitmentRows(){try{if(!fs.existsSync(FITMENT_FILE))return [];const wb=XLSX.readFile(FITMENT_FILE);const sheet=wb.Sheets['Fitment Master']||wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json(sheet,{defval:''});}catch{return [];}}
function fitmentIndex(){const map=new Map();for(const r of loadFitmentRows()){const url=clean(r.Product_URL);if(!url)continue;if(!map.has(url))map.set(url,{brands:new Set(),models:new Set(),contexts:new Set(),evidence:new Set()});const x=map.get(url);if(clean(r.Car_Brand))x.brands.add(clean(r.Car_Brand));if(clean(r.Car_Model))x.models.add(clean(r.Car_Model));if(clean(r.Fitment_Context))x.contexts.add(clean(r.Fitment_Context));if(clean(r.Source_Text))x.evidence.add(clean(r.Source_Text));}return map;}
function attachFitment(products){const idx=fitmentIndex();return products.map(p=>{const x=idx.get(clean(p['Product URL']));return {...p,'Fitment Brands':x?[...x.brands].join(', '):'','Fitment Models':x?[...x.models].join(' | '):'','Fitment Contexts':x?[...x.contexts].join(' | '):'','Fitment Evidence':x?[...x.evidence].join(' | '):''};});}
function loadTemplates(){return readSheet(VIDEO_FILE).filter(r=>clean(r['ซีรีส์/Ai']));}
function envStatus(){const hasOR=Boolean(process.env.OPENROUTER_API_KEY);const hasOA=Boolean(process.env.OPENAI_API_KEY);const provider=process.env.AI_PROVIDER||(hasOR?'openrouter':hasOA?'openai':'openrouter');const model=provider==='openrouter'?(process.env.OPENROUTER_MODEL||'minimax/minimax-m3:free'):(process.env.OPENAI_MODEL||'gpt-4o-mini');return{dotenvLoaded:true,provider,openrouterKeyConfigured:hasOR,openaiKeyConfigured:hasOA,model,port:PORT};}
app.get('/api/health',(q,s)=>{try{s.json({ok:true,products:loadProducts().length,templates:loadTemplates().length,fitmentRows:loadFitmentRows().length,ai:envStatus()});}catch(e){s.status(500).json({ok:false,error:e.message});}});
app.get('/api/config',(q,s)=>s.json(envStatus()));
app.get('/api/meta',(q,s)=>{const r=loadProducts();const f=loadFitmentRows();s.json({total:r.length,categories:unique(r.map(x=>x.Category)),subCategories:unique(r.map(x=>x['Sub Category'])),brands:unique(f.map(x=>x.Car_Brand)),models:unique(f.map(x=>x.Car_Model))});});
app.get('/api/templates',(q,s)=>s.json(loadTemplates().map((r,i)=>({
 id:i,name:clean(r['ซีรีส์/Ai']),type:clean(r['ประเภทงาน']),duration:clean(r['ความยาวแนะนำ']),hook:clean(r['Hook ตัวอย่าง']),content:clean(r['เนื้อหา']),cta:clean(r['CTA']),prompt:clean(r['Prompt กลางใช้ได้ทุกรูปแบบ (Google Flow - Scene ให้ AI พิจารณาเองตามความยาวที่กำหนด)']),storyboard:[clean(r['Storyboard 00.00-10.00']),clean(r['10.01-20.00']),clean(r['20.01-30.00'])],imagePrompt:clean(r['Prompt image to video']),references:clean(r['Reference ที่ต้องเตรียม']),cautions:clean(r['ข้อควรระวังภาพลักษณ์/ข้อมูล']),platforms:clean(r['แพลตฟอร์ม'])
}))));
app.get('/api/products',(q,s)=>{
 let r=loadProducts();
 const fit=loadFitmentRows();
 if(clean(q.query.brand)||clean(q.query.model)){
  const fitUrls=new Set(fit.filter(x=>(!clean(q.query.brand)||clean(x.Car_Brand)===clean(q.query.brand))&&(!clean(q.query.model)||clean(x.Car_Model)===clean(q.query.model))).map(x=>clean(x.Product_URL)));
  r=r.filter(a=>fitUrls.has(clean(a['Product URL'])));
 }
 const x=clean(q.query.q).toLowerCase();
 for(const[k,v] of Object.entries({Category:q.query.category,'Sub Category':q.query.subCategory}))if(clean(v))r=r.filter(a=>clean(a[k])===clean(v));
 if(x)r=r.filter(a=>Object.values(a).some(v=>clean(v).toLowerCase().includes(x)));
 const total=r.length;const hasPaging=q.query.limit!==undefined||q.query.offset!==undefined;
 if(!hasPaging)return s.json(attachFitment(r));
 const limit=Math.max(1,Math.min(500,Number(q.query.limit)||100));const offset=Math.max(0,Number(q.query.offset)||0);
 s.json({total,offset,limit,products:attachFitment(r.slice(offset,offset+limit))});
});
function buildPrompt(p,t){return `You are the senior content producer for DIAMOND/WDI. SOURCE OF TRUTH: PRODUCT DATA below. VIDEO TEMPLATE is supplied from the company's Short-vdo workbook.\n\nPRODUCT DATA:\n${JSON.stringify(p,null,2)}\n\nVIDEO TEMPLATE:\n${JSON.stringify(t,null,2)}\n\nMANDATORY RULES:\n1) Never invent compatibility, model/year, specifications, included parts, price, stock, warranty or claims.\n2) Product Code, names and fitment must remain exactly as supplied.\n3) Category hierarchy is authoritative. Treat Fitment Brands/Fitment Models as WDI navigation evidence only when populated.\n4) For multi-context products, mention only the selected row context; never merge unrelated vehicle models.\n5) Use real product images as references; never redesign, mirror, recolor or alter geometry.\n6) Do not generate Thai text, logos, QR, phone numbers or technical text inside video. Leave safe areas for post-production.\n7) Vertical 9:16, premium restrained DIAMOND look, subtle ambient audio, no dialogue unless required.\n8) Follow the selected template exactly. Segment 2/3 must include continuation instruction where continuity applies.\n9) Flow prompts MUST be English and ready to paste. Marketing script/caption MUST be Thai.\n10) Also generate ready-to-post captions per platform (Thai, no invented specs). Facebook: 2-3 lines + CTA + hashtags. TikTok: short punchy 1-2 lines + hashtags. Instagram: emoji light + hashtags. LINE: polite + CTA to chat. Shopee: title + bullet specs.\n11) Return JSON only.\nJSON: {"series":"","duration":"","hook":"","script":"","voiceover":"","scenes":[{"time":"","visual":"","overlay":"","flow_prompt":""}],"image_to_video_prompt":"","caption":"","hashtags":[],"cta":"","source_facts":[],"warnings":[],"platform_captions":{"facebook":"","tiktok":"","instagram":"","line":"","shopee":""}}`;}
app.post('/api/image-generate',async(q,s)=>{try{const prompt=clean(q.body?.prompt);if(!prompt)return s.status(400).json({ok:false,error:'Prompt required'});const mode=clean(q.body?.mode)||'hero';const square=/detail|compare/i.test(mode);const w=1024,h=square?1024:1280;const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0,1500))}?width=${w}&height=${h}&nologo=true&model=flux&seed=${Math.floor(Math.random()*999999)}`;const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),110000);let r;try{r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 WDI-Content-Generator'},signal:ctrl.signal});}finally{clearTimeout(timer);}if(!r.ok)return s.status(r.status).json({ok:false,provider:'pollinations',error:`Image provider HTTP ${r.status} (free tier busy, try again)`});const mime=r.headers.get('content-type')||'image/jpeg';const b=Buffer.from(await r.arrayBuffer());if(b.length<5000)return s.status(502).json({ok:false,provider:'pollinations',error:'Image provider returned empty image, try again'});s.json({ok:true,provider:'pollinations',model:'flux',mime,data:b.toString('base64')});}catch(e){s.status(500).json({ok:false,provider:'pollinations',error:e.name==='AbortError'?'Image generation timed out (free tier busy), try again':(e.message||'image generation failed')});}});
function buildMarketplacePrompt(p){const fit=[p['Fitment Brands'],p['Fitment Models'],p['Fitment Contexts'],p['Fitment Evidence']].filter(Boolean).join(' | ');return 'You are a senior automotive e-commerce art director for WDI / DIAMOND (ไฟตราเพชร). Create reusable professional English image prompts for one exact product. PRODUCT DATA:\n'+JSON.stringify(p,null,2)+'\nVERIFIED WDI FITMENT DATA (navigation/evidence only; never infer):\n'+(fit||'NONE')+'\n\nBRAND SYSTEM: DIAMOND / ไฟตราเพชร; midnight navy, electric blue, metallic silver, diamond yellow/gold, premium automotive advertising. The supplied DIAMOND logo asset is authoritative; never redraw, distort, recolor or invent it.\n\nPRODUCT LOCK: preserve exact product silhouette, proportions, lens, housing, bezel, reflector, connector, wire count, mounting points, screws/clips, materials, color, finish and visible markings from the supplied reference. No redesign, beautification, mirroring, recoloring, merging variants or invented components.\n\nFITMENT LOCK: show a vehicle only if verified WDI fitment is present. If present, use only the exact supplied brand/model/year/variant context. Never infer compatibility from visual similarity.\n\nOUTPUT: JSON only: {"prompts":{"hero":"","detail":"","context":"","catalog":"","social":""},"negative_prompt":"","brand_rules":"","source_facts":""}. All prompts must describe photorealistic premium commercial imagery, 4:5 except detail 1:1, strong hierarchy, cinematic three-point lighting, electric-blue rim light, warm gold highlights, realistic reflections, clean negative space for post-production text. For technical details, mention only features explicitly present in PRODUCT DATA or clearly visible in the supplied reference; if a feature is not verified, use generic visible-detail language and do not name it. Never invent connector type, wire count, lens system, reflector, adjustment mechanism, bulb, LED behavior, materials, dimensions or specifications. Do not rely on AI-generated Thai typography; text should be added later. Negative prompt must include wrong product, changed geometry, wrong connector, invented fitment, fake logo, fake text, fake specs, duplicate, extra parts, deformation, cartoon, surreal, excessive VFX.';}
app.post('/api/generate-marketplace',async(q,s)=>{try{const p=q.body.product;if(!p)return s.status(400).json({error:'Product required'});const ai=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1',defaultHeaders:{'HTTP-Referer':'http://localhost:3077','X-Title':'WDI Content Generator'}});const r=await ai.chat.completions.create({model:process.env.OPENROUTER_MODEL||'minimax/minimax-m3:free',messages:[{role:'user',content:buildMarketplacePrompt(p)}],temperature:0.45,max_tokens:4000});const text=String(r.choices?.[0]?.message?.content||'').trim().replace(/^```json\s*/i,'').replace(/\s*```$/i,'');try{s.json(JSON.parse(text));}catch{s.json({raw:text});}}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/generate',async(q,s)=>{
 try{
  const p=q.body.product;if(!p)return s.status(400).json({error:'ไม่พบสินค้า'});
  const ts=loadTemplates();const t=ts[Number(q.body.templateId)||0];if(!t)return s.status(404).json({error:'ไม่พบ Video Template'});
  const hasOR=Boolean(process.env.OPENROUTER_API_KEY),hasOA=Boolean(process.env.OPENAI_API_KEY);if(!hasOR&&!hasOA)return s.status(503).json({error:'ยังไม่ได้ตั้งค่า API Key ใน .env (ต้องมี OPENROUTER_API_KEY หรือ OPENAI_API_KEY)'});
  const useOR=hasOR&&(process.env.AI_PROVIDER!=='openai');let text='';
  if(useOR){
   const baseURL=process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1';const model=process.env.OPENROUTER_MODEL||'minimax/minimax-m3:free';
   const ai=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL,defaultHeaders:{'HTTP-Referer':'http://localhost:3077','X-Title':'WDI Content Generator'}});
   const isDots=/dots/i.test(model);const r=await ai.chat.completions.create({model,messages:[{role:'user',content:buildPrompt(p,t)}],temperature:0.7,max_tokens:isDots?8000:4000,...(isDots?{reasoning:{exclude:false},include_reasoning:true}:{})});
   const msg=r.choices?.[0]?.message||{};let rawText=(msg.content||'').trim();if(!rawText&&msg.reasoning)rawText=String(msg.reasoning).trim();if(rawText&&!rawText.trim().startsWith('{')&&rawText.includes('{')){const m=rawText.match(/\{[\s\S]*\}/);if(m)rawText=m[0];}text=rawText.replace(/^```json\s*/i,'').replace(/\s*```$/i,'').trim();
  }else{
   const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});const r=await ai.responses.create({model:process.env.OPENAI_MODEL||'gpt-4o-mini',input:buildPrompt(p,t)});text=(r.output_text||'').trim().replace(/^```json\s*/i,'').replace(/\s*```$/i,'');
  }
  try{s.json(JSON.parse(text));}catch{s.json({raw:text,series:clean(t['ซีรีส์/Ai']),warnings:['AI returned non-JSON output']});}
 }catch(e){
  const status=e?.status===401?502:e?.status===429?503:500;let message=e?.message||'เกิดข้อผิดพลาดในการสร้าง Content Pack';if(e?.status===429)message='API ตอบ 429 (rate limit / billing ไม่ active): '+e.message;if(e?.status===402)message='OpenRouter 402: เครดิตฟรีหมดหรือต้องเติมเครดิต - ลองเปลี่ยนโมเดล :free อื่น';s.status(status).json({error:message,code:e?.code||null,status:e?.status||null});
 }
});
if(!process.env.VERCEL)app.listen(PORT,()=>console.log(`WDI Content Generator: http://localhost:${PORT}`));
export default app;

