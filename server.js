import express from 'express';
import XLSX from 'xlsx';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

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
function loadProducts(){
  try{
    if(fs.existsSync(PRODUCT_FILE)) return readSheet(PRODUCT_FILE);
  }catch{}
  try{
    const good=path.join(ROOT,'data','wdi-catalog.last-good.json');
    if(fs.existsSync(good)){const d=JSON.parse(fs.readFileSync(good,'utf8'));return Array.isArray(d.products)?d.products:[];}
  }catch{}
  try{
    const live=path.join(ROOT,'data','wdi-catalog.json');
    if(fs.existsSync(live)){const d=JSON.parse(fs.readFileSync(live,'utf8'));return Array.isArray(d.products)?d.products:[];}
  }catch{}
  return [];
}
function loadFitmentRows(){
  try{
    if(fs.existsSync(FITMENT_FILE)){const wb=XLSX.readFile(FITMENT_FILE);const sheet=wb.Sheets['Fitment Master']||wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json(sheet,{defval:''});}
  }catch{}
  return [];
}
function dataStatus(){
  const files=[
    ['Product Sheet',PRODUCT_FILE],
    ['Fitment Master',FITMENT_FILE],
    ['WDI Catalog Cache',path.join(ROOT,'data','wdi-catalog.json')],
    ['Last Good Catalog',path.join(ROOT,'data','wdi-catalog.last-good.json')]
  ];
  return files.map(([name,file])=>({name,file,available:fs.existsSync(file),updatedAt:fs.existsSync(file)?fs.statSync(file).mtime.toISOString():null}));
}
app.get('/api/data-status',(q,s)=>s.json({ok:true,source:'local-first',products:loadProducts().length,fitmentRows:loadFitmentRows().length,files:dataStatus()}));
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
function buildPrompt(p,t){return `You are the senior content producer for DIAMOND/WDI. SOURCE OF TRUTH: PRODUCT DATA below. VIDEO TEMPLATE is supplied from the company's Short-vdo workbook.\n\nPRODUCT DATA:\n${JSON.stringify(p,null,2)}\n\nVIDEO TEMPLATE:\n${JSON.stringify(t,null,2)}\n\nMANDATORY RULES:\n1) Never invent compatibility, model/year, specifications, included parts, price, stock, warranty or claims.\n2) Product Code, names and fitment must remain exactly as supplied.\n3) Category hierarchy is authoritative. Treat Fitment Brands/Fitment Models as WDI navigation evidence only when populated.\n4) For multi-context products, mention only the selected row context; never merge unrelated vehicle models.\n5) Use real product images as references; never redesign, mirror, recolor or alter geometry.\n6) Do not generate Thai text, logos, QR, phone numbers or technical text inside video. Leave safe areas for post-production.\n7) Vertical 9:16, premium restrained DIAMOND look, subtle ambient audio, no dialogue unless required.\n8) Use the selected template as a content direction, but NEVER force a visual sequence that the supplied product images cannot support. First classify each supplied image as: real product view, close-up/detail, packaging, technical drawing/dimension, vehicle context, infographic/spec, or unknown. Only describe a physical camera move/orbit between images when the images are clearly adjacent real-world product views. If an image is a close-up or technical drawing, treat it as a detail/reference card, not as a physical back/side view.\n9) Build the video in simple sequential Scenes. Scene 1 starts from the best real product image. Each next Scene should normally start from the previous Scene's final frame when continuity is useful, then use the next suitable reference image. If continuity is not physically valid, use a clean cinematic transition or composition change instead of inventing unseen product geometry.\n10) The field image_to_video_prompt is NOT a fourth video prompt. It must be a simple "REFERENCE MAPPING" that tells the user which image/reference belongs to each Scene and whether the previous Scene final frame should be used.\n11) Flow prompts MUST be English and ready to paste. Marketing script/caption MUST be Thai.\n12) Also generate ready-to-post captions per platform (Thai, no invented specs). Facebook: 2-3 lines + CTA + hashtags. TikTok: short punchy 1-2 lines + hashtags. Instagram: emoji light + hashtags. LINE: polite + CTA to chat. Shopee: title + bullet specs.\n13) Return JSON only.\nJSON: {"series":"","duration":"","hook":"","script":"","voiceover":"","scenes":[{"time":"","visual":"","overlay":"","flow_prompt":""}],"image_to_video_prompt":"","caption":"","hashtags":[],"cta":"","source_facts":[],"warnings":[],"platform_captions":{"facebook":"","tiktok":"","instagram":"","line":"","shopee":""}}`;}
const CONTENT_CACHE_FILE=path.join(ROOT,'data','content-pack-cache.json');
function loadContentCache(){try{return fs.existsSync(CONTENT_CACHE_FILE)?JSON.parse(fs.readFileSync(CONTENT_CACHE_FILE,'utf8')):{};}catch{return {};}}
function saveContentCache(c){try{fs.writeFileSync(CONTENT_CACHE_FILE,JSON.stringify(c,null,2),'utf8');}catch{/* cache is optional */}}
function productImageUrls(p){
 const raw=[p['Main Image URL']||'',...(String(p['Additional Images']||'').split(';'))].map(clean).filter(Boolean);
 return [...new Set(raw)].filter(u=>/^https:\/\/www\.wdi\.co\.th\//i.test(u)).slice(0,6);
}
function qaContentPack(d,p){
 const text=JSON.stringify(d||{});
 const checks=[];
 const banned=[
  [/ใส่กับรถ(?:คัน)?ใดก็ได้|ใช้ได้กับรถทุก|ใช้ได้กับทุกรุ่น|ทุกคัน|all (?:cars|vehicles)|any (?:car|vehicle)/i,'ห้ามอ้างว่าใช้ได้กับรถทุกคันโดยไม่มี Fitment ที่ยืนยัน'],
  [/360(?:°|องศา)|หมุนรอบ|รอบตัว 360/i,'ห้ามอ้าง 360° เมื่อภาพไม่ได้เป็นมุมต่อเนื่องจริง'],
  [/หน้าตัด\s*(?:PP|ABS)|PP base|ABS lens/i,'ตรวจคำเรียกวัสดุ: ใช้ เลนส์ PP / แป้น ABS ตาม Source Facts'],
  [/front 3\/4|back view|side view/i,'ห้ามใช้ชื่อมุมภาพที่ AI เดาเองในข้อความการตลาด']
 ];
 for(const [re,msg] of banned)if(re.test(text))checks.push({status:'FAIL',message:msg});
 if(!p['Fitment Models']&&!p['Fitment Brands']&&!p['Fitment Contexts'])checks.push({status:'PASS',message:'ไม่มี Fitment ที่ยืนยัน: ระบบต้องไม่สร้างรถหรือคำเคลมความเข้ากันได้'});
 return {status:checks.some(x=>x.status==='FAIL')?'REVIEW':'PASS',checks};
}
function buildPromptV2(p,t){
 const images=productImageUrls(p);
 return `You are the WDI/DIAMOND senior content engineer. Your job is PDCA: PLAN the correct video structure, DO generate the prompt pack, CHECK every claim and visual instruction against the supplied WDI product data AND the attached product images, then ACT by fixing anything unsafe before returning the final pack.

SOURCE OF TRUTH:\n${JSON.stringify(p,null,2)}\n\nVIDEO SERIES:\n${JSON.stringify(t,null,2)}\n\nATTACHED WDI PRODUCT IMAGES: ${images.length} image(s). You can see them in this request. FIRST classify every image as exactly one of: HERO_PRODUCT, REAL_PRODUCT_VIEW, CLOSE_UP_DETAIL, PACKAGING, TECHNICAL_DRAWING, VEHICLE_CONTEXT, INFOGRAPHIC, CONTACT_SHEET, UNKNOWN.

VISUAL FIDELITY RULES (highest priority):
- The real WDI images are the visual source of truth. Never redesign, improve, simplify, mirror, recolor, add, remove, merge, or reinterpret product geometry.
- Never invent an unseen back/side/3-quarter view. A technical drawing is NOT a physical camera angle. A close-up is NOT a side/back view. A contact-sheet screenshot is NOT three new images.
- Default mode is FIDELITY-FIRST: animate the exact supplied 2D product photo with subtle camera motion. Do NOT turn a single photo into a 3D orbit.
- Only request camera orbit/rotation when two references clearly show adjacent physical views of the same object. Otherwise use slow push-in, lateral pan across the flat image, rack focus, light sweep, or a clean cut to another verified image.
- CLOSE_UP_DETAIL and TECHNICAL_DRAWING are not physical camera angles. Prefer using them as static/detail cards or post-production references, not as transition targets.
- For each Scene, explicitly state which provided image is the reference. Scene 2/3 may use the previous Scene final frame ONLY when the transition is physically valid. If not valid, reuse the best verified hero reference instead of inventing geometry.
- The generated video must keep the product silhouette, proportions, lens, housing, bezel, switch, fasteners, materials, color and visible markings consistent with the source image. No hallucinated parts.
- NEVER put generated Thai typography, logos, specs, codes, QR, phone numbers or fake UI into the video. Leave text-safe space for post-production.

FACT / FITMENT RULES:
- Use Product Code, Product Name, Voltage, Wattage, Lens and Base exactly from WDI source fields.
- Correct terminology: "เลนส์ PP" and "แป้น ABS". Do not write "หน้าตัด PP".
- If verified Fitment fields are empty, do NOT show a vehicle and do NOT claim "ใส่กับรถคันใดก็ได้", "ใช้ได้ทุกคัน", "ทุกยี่ห้อ", "ทุกโมเดล" or equivalent.
- Never invent model/year, price, warranty, included parts, bulb behavior, connector type, dimensions, or compatibility.

EFFICIENCY RULES:
- Return ONE compact JSON pack. Do not add reasoning outside JSON.
- Do not create a separate image-analysis call; classify the supplied images inside this same response.
- Keep Flow prompts concise and directly pasteable. Prefer 3 scenes over unnecessary extra generations.

OUTPUT JSON ONLY:\n{"series":"","duration":"","hook":"","script":"","voiceover":"","visual_asset_audit":[{"image":"","classification":"","what_is_visible":"","allowed_use":""}],"scenes":[{"time":"","reference":"","start_source":"","visual":"","flow_prompt":""}],"image_to_video_prompt":"REFERENCE MAPPING: Scene 1 = ...; Scene 2 = ...; Scene 3 = ...","caption":"","hashtags":[],"cta":"","source_facts":[],"warnings":[],'platform_captions':{"facebook":"","tiktok":"","instagram":"","line":"","shopee":""}}`;
}

app.post('/api/image-generate',async(q,s)=>{try{const prompt=clean(q.body?.prompt);if(!prompt)return s.status(400).json({ok:false,error:'Prompt required'});const mode=clean(q.body?.mode)||'hero';const square=/detail|compare/i.test(mode);const w=1024,h=square?1024:1280;const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0,1500))}?width=${w}&height=${h}&nologo=true&model=flux&seed=${Math.floor(Math.random()*999999)}`;const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),110000);let r;try{r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 WDI-Content-Generator'},signal:ctrl.signal});}finally{clearTimeout(timer);}if(!r.ok)return s.status(r.status).json({ok:false,provider:'pollinations',error:`Image provider HTTP ${r.status} (free tier busy, try again)`});const mime=r.headers.get('content-type')||'image/jpeg';const b=Buffer.from(await r.arrayBuffer());if(b.length<5000)return s.status(502).json({ok:false,provider:'pollinations',error:'Image provider returned empty image, try again'});s.json({ok:true,provider:'pollinations',model:'flux',mime,data:b.toString('base64')});}catch(e){s.status(500).json({ok:false,provider:'pollinations',error:e.name==='AbortError'?'Image generation timed out (free tier busy), try again':(e.message||'image generation failed')});}});
function buildMarketplacePrompt(p){const fit=[p['Fitment Brands'],p['Fitment Models'],p['Fitment Contexts'],p['Fitment Evidence']].filter(Boolean).join(' | ');return 'You are a senior automotive e-commerce art director for WDI / DIAMOND (ไฟตราเพชร). Create reusable professional English image prompts for one exact product. PRODUCT DATA:\n'+JSON.stringify(p,null,2)+'\nVERIFIED WDI FITMENT DATA (navigation/evidence only; never infer):\n'+(fit||'NONE')+'\n\nBRAND SYSTEM: DIAMOND / ไฟตราเพชร; midnight navy, electric blue, metallic silver, diamond yellow/gold, premium automotive advertising. The supplied DIAMOND logo asset is authoritative; never redraw, distort, recolor or invent it.\n\nPRODUCT LOCK: preserve exact product silhouette, proportions, lens, housing, bezel, reflector, connector, wire count, mounting points, screws/clips, materials, color, finish and visible markings from the supplied reference. No redesign, beautification, mirroring, recoloring, merging variants or invented components.\n\nFITMENT LOCK: show a vehicle only if verified WDI fitment is present. If present, use only the exact supplied brand/model/year/variant context. Never infer compatibility from visual similarity.\n\nOUTPUT: JSON only: {"prompts":{"hero":"","detail":"","context":"","catalog":"","social":""},"negative_prompt":"","brand_rules":"","source_facts":""}. All prompts must describe photorealistic premium commercial imagery, 4:5 except detail 1:1, strong hierarchy, cinematic three-point lighting, electric-blue rim light, warm gold highlights, realistic reflections, clean negative space for post-production text. For technical details, mention only features explicitly present in PRODUCT DATA or clearly visible in the supplied reference; if a feature is not verified, use generic visible-detail language and do not name it. Never invent connector type, wire count, lens system, reflector, adjustment mechanism, bulb, LED behavior, materials, dimensions or specifications. Do not rely on AI-generated Thai typography; text should be added later. Negative prompt must include wrong product, changed geometry, wrong connector, invented fitment, fake logo, fake text, fake specs, duplicate, extra parts, deformation, cartoon, surreal, excessive VFX.';}
app.post('/api/generate-marketplace',async(q,s)=>{try{const p=q.body.product;if(!p)return s.status(400).json({error:'Product required'});const ai=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1',defaultHeaders:{'HTTP-Referer':'http://localhost:3077','X-Title':'WDI Content Generator'}});const r=await ai.chat.completions.create({model:process.env.OPENROUTER_MODEL||'minimax/minimax-m3:free',messages:[{role:'user',content:buildMarketplacePrompt(p)}],temperature:0.45,max_tokens:4000});const text=String(r.choices?.[0]?.message?.content||'').trim().replace(/^```json\s*/i,'').replace(/\s*```$/i,'');try{s.json(JSON.parse(text));}catch{s.json({raw:text});}}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/generate',async(q,s)=>{
 try{
  const p=q.body.product;if(!p)return s.status(400).json({error:'ไม่พบสินค้า'});
  const templateId=Number(q.body.templateId)||0;const ts=loadTemplates();const t=ts[templateId];if(!t)return s.status(404).json({error:'ไม่พบ Video Template'});
  const hasOR=Boolean(process.env.OPENROUTER_API_KEY),hasOA=Boolean(process.env.OPENAI_API_KEY);if(!hasOR&&!hasOA)return s.status(503).json({error:'ยังไม่ได้ตั้งค่า API Key ใน .env'});
  const images=productImageUrls(p);const model=hasOR&&(process.env.AI_PROVIDER!=='openai')?(process.env.OPENROUTER_MODEL||'thinkingmachines/inkling:free'):(process.env.OPENAI_MODEL||'gpt-4o-mini');
  const cacheKey=crypto.createHash('sha256').update(JSON.stringify({v:2,model,templateId,product:p,images})).digest('hex');const cache=loadContentCache();
  if(!q.body.force&&cache[cacheKey])return s.json({...cache[cacheKey],_meta:{model,cache:true,imageCount:images.length,qa:cache[cacheKey].qa||null}});
  let text='';
  if(hasOR&&(process.env.AI_PROVIDER!=='openai')){
   const ai=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1',defaultHeaders:{'HTTP-Referer':'http://localhost:3077','X-Title':'WDI Content Generator'}});
   const content=[{type:'text',text:buildPromptV2(p,t)}];
   for(const u of images)content.push({type:'image_url',image_url:{url:u}});
   const r=await ai.chat.completions.create({model,messages:[{role:'user',content}],temperature:0.2,max_tokens:5000});
   const msg=r.choices?.[0]?.message||{};let rawText=typeof msg.content==='string'?msg.content.trim():'';if(!rawText&&msg.reasoning)rawText=String(msg.reasoning).trim();if(Array.isArray(msg.content))rawText=msg.content.map(x=>typeof x==='string'?x:(x?.text||'')).join('').trim();if(rawText&&!rawText.trim().startsWith('{')&&rawText.includes('{')){const a=rawText.indexOf('{');const b=rawText.lastIndexOf('}');if(b>a)rawText=rawText.slice(a,b+1);}text=rawText.replace(/^```json\s*/i,'').replace(/\s*```$/i,'').trim();
  }else{
   const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});const r=await ai.responses.create({model,input:buildPromptV2(p,t)});text=(r.output_text||'').trim().replace(/^```json\s*/i,'').replace(/\s*```$/i,'');
  }
  try{
   const out=JSON.parse(text);out.qa=qaContentPack(out,p);out._meta={model,cache:false,imageCount:images.length,qa:out.qa};
   cache[cacheKey]=out;saveContentCache(cache);s.json(out);
  }catch{s.status(502).json({error:'AI ตอบกลับไม่ใช่ JSON ที่ใช้งานได้ — กดเจนใหม่ได้โดยไม่ต้องเปลี่ยนข้อมูลสินค้า',raw:text.slice(0,6000),model});}
 }catch(e){
  const status=e?.status===401?502:e?.status===429?503:500;let message=e?.message||'เกิดข้อผิดพลาดในการสร้าง Content Pack';if(e?.status===429)message='API 429: โมเดลฟรีกำลังเต็ม/ถูก rate limit — ลองใช้ผลที่ cache ก่อน หรือรอสักครู่';if(e?.status===402)message='OpenRouter 402: เครดิตหมด/โมเดลไม่ฟรี';s.status(status).json({error:message,code:e?.code||null,status:e?.status||null});
 }
});
if(!process.env.VERCEL)app.listen(PORT,()=>console.log(`WDI Content Generator: http://localhost:${PORT}`));
export default app;

