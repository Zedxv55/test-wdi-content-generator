import express from 'express';
import XLSX from 'xlsx';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { initDb, memoryMode, dbFile, getProductRow, getOrCreateJob, logAction, touchJob, createVersion, getVersions, getVersionOutput, getActions, setPublish, getPublish, setQC, productStatusSummary, codesStatus, getDashboard, getNextJobs, createCampaign, addCampaignItems, campaignProgress, setMemory, getMemory, getCurrentSheet, getSheetVersions, setSheetStatus, logSheetAction, getSheetActions, setSheetVisual } from './db.mjs';
import { askAssistant } from './assistant.mjs';
import { ensureSheet, sheetSummary, sheetPromptBlock } from './sheets.mjs';
import { ANGLES, PLATFORMS, loadBusinessConfig, contactBlock, buildFacts, buildHashtags, buildKeywords, buildDistPrompt, qaContent, scoreContent } from './content-dist.mjs';
import { saveContentVersion, getCurrentContent, getContentHistory, setContentStatus } from './db.mjs';
import { planDurations, buildStoryboard, loadCapabilities, loadStoryboardRows } from './flow.mjs';
import { autoGroupItems, buildSetPlan, buildScenePrompt, qcSetPlan, parseCampaignTSV, SET_ROLES } from './set-builder.mjs';
import { collectBrands, collectModels, collectModelProducts, classifyVehicleImage, splitSide, guessGroup, compareFitment, b64name } from './vehicle-map.mjs';
import { createSet, listSets, getSetDetail, addSetItems, updateSetItem, removeSetItem, setSetStatus, saveSetPlan, getSetPlan, upsertVehicleModel, linkVehicleProducts } from './db.mjs';

dotenv.config();
initDb();
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
function loadTemplates(){return readSheet(VIDEO_FILE).filter(r=>clean(r['ซีรีส์/Ai'])&&clean(r['สถานะ']).startsWith('Template'));}
function readSheetName(name){try{const wb=XLSX.readFile(VIDEO_FILE);const ws=wb.Sheets[name];if(!ws)return[];return XLSX.utils.sheet_to_json(ws,{defval:''});}catch{return[];}}
function loadSeriesV(){return readSheetName('Series Selector v2').filter(r=>clean(r['รหัสใช้งาน'])&&/^[A-Z]+\d+$/.test(clean(r['รหัสใช้งาน']))).map(r=>({code:clean(r['รหัสใช้งาน']),name:clean(r['ชื่อที่คนใช้เห็น']),when:clean(r['ใช้เมื่อ']),forCategory:clean(r['เหมาะกับหมวด']),duration:clean(r['ความยาว']),output:clean(r['Output']),qc:clean(r['QC'])}));}
function loadCategories(){const mat=readSheetName('Category Prompt Matrix').filter(r=>clean(r['รหัสหมวด']));const lib={};for(const r of readSheetName('Category Prompt Library')){if(clean(r['รหัส']))lib[clean(r['รหัส'])]=clean(r['Prompt พร้อมคัดลอก (ใช้ร่วมกับ Product Truth + Reference Image)']);}return mat.map(r=>({code:clean(r['รหัสหมวด']),name:clean(r['ชื่อที่คนใช้เห็น']),forProducts:clean(r['ใช้กับสินค้า']),focus:clean(r['จุดเน้นภาพ/วิดีโอ']),dontGuess:clean(r['ห้ามเดา/ห้ามเปลี่ยน']),core:clean(r['Prompt Category Core']),direction:clean(r['Prompt Scene Direction']),negative:clean(r['Negative Prompt เพิ่ม']),library:lib[clean(r['รหัสหมวด'])]||''}));}
function loadPromptBlocks(){const m={};for(const r of readSheetName('AI Prompt Builder')){if(clean(r['BLOCK']))m[clean(r['BLOCK'])]={text:clean(r['เนื้อหา']),when:clean(r['ระบบควรส่งเมื่อไร'])};}return m;}
function loadPlatformSpecs(){return readSheetName('Platform Output').filter(r=>clean(r['Platform'])).map(r=>({platform:clean(r['Platform']),asset:clean(r['Asset หลัก']),ratio:clean(r['สัดส่วน']),length:clean(r['ความยาวแนะนำ']),copy:clean(r['ข้อความ']),note:clean(r['หมายเหตุ'])}));}
function guessCategoryCode(p){const t=[p['Product Name (TH)'],p['Product Name (EN)'],p.Category,p['Sub Category']].map(clean).join(' ');const has=(...ks)=>ks.some(k=>t.includes(k));if(has('คู่','pair','Pair')||(has('LH')&&has('RH'))||t.includes('L/R'))return 'C07';if(has('เสื้อ','housing','Housing','HOUSING'))return 'C03';if(has('กระจก','mirror','Mirror','MIRROR'))return 'C06';if(has('ทับทิม','reflector','Reflector','marker','Marker')&&!has('lamp','Lamp','ไฟท้าย','ไฟหน้า'))return 'C05';if(has('ไฟเลี้ยว','ไฟสัญญาณ','signal','Signal','turn','Turn'))return 'C04';if(has('ไฟหน้า','head','Head','HEAD'))return 'C01';if(has('ไฟท้าย','tail','Tail','TAIL'))return 'C02';return 'C09';}
function resolveCategory(codeOrNull,p){const cats=loadCategories();let code=clean(codeOrNull)||guessCategoryCode(p);let cat=cats.find(c=>c.code===code)||cats.find(c=>c.code==='C09');return{code:cat.code,cat,auto:!clean(codeOrNull)};}
const VMAP={V01:'S13',V02:'S07',V03:'S03',V04:'S04',V05:'S11',V06:'S01',V07:'S14',V08:'S05',V09:'S08',V10:'S11',V11:'S06',V12:'S04',V13:'S17',V14:'S01',V15:'S16'};
const GENERIC_V=new Set(['V01','V02','V13','V14','V15']);
function resolveSeries(vCode,catCode){const v=clean(vCode).toUpperCase();let s=VMAP[v]||null;let reason='';if(!s){s='S01';reason='ไม่ระบุ V — ใช้ S01 ค่าเริ่มต้น';}else reason=`${v} → ${s} (mapping)`;if(GENERIC_V.has(v)){if(catCode==='C07'&&s!=='S04'){s='S04';reason+=` + C07 override → S04`;}else if(catCode==='C08'&&s!=='S11'){s='S11';reason+=` + C08 override → S11`;}}const ts=loadTemplates();let idx=ts.findIndex(r=>clean(r['รหัสซีรีส์'])===s);if(idx<0)idx=0;const row=ts[idx];return{sCode:clean(row['รหัสซีรีส์'])||('T'+(idx+1)),sIndex:idx,row,reason};}
function envStatus(){const hasOR=Boolean(process.env.OPENROUTER_API_KEY);const hasOA=Boolean(process.env.OPENAI_API_KEY);const provider=process.env.AI_PROVIDER||(hasOR?'openrouter':hasOA?'openai':'openrouter');const model=provider==='openrouter'?(process.env.OPENROUTER_MODEL||'minimax/minimax-m3:free'):(process.env.OPENAI_MODEL||'gpt-4o-mini');return{dotenvLoaded:true,provider,openrouterKeyConfigured:hasOR,openaiKeyConfigured:hasOA,model,port:PORT};}
app.get('/api/health',(q,s)=>{try{s.json({ok:true,products:loadProducts().length,templates:loadTemplates().length,fitmentRows:loadFitmentRows().length,ai:envStatus(),tracking:{backend:memoryMode?'memory':'sqlite',db:dbFile()}});}catch(e){s.status(500).json({ok:false,error:e.message});}});
app.get('/api/config',(q,s)=>s.json(envStatus()));
app.get('/api/meta',(q,s)=>{const r=loadProducts();const f=loadFitmentRows();s.json({total:r.length,categories:unique(r.map(x=>x.Category)),subCategories:unique(r.map(x=>x['Sub Category'])),brands:unique(f.map(x=>x.Car_Brand)),models:unique(f.map(x=>x.Car_Model))});});
app.get('/api/templates',(q,s)=>s.json(loadTemplates().map((r,i)=>({
 id:i,code:clean(r['รหัสซีรีส์']),name:clean(r['ซีรีส์/Ai']),type:clean(r['ประเภทงาน']),duration:clean(r['ความยาวแนะนำ']),hook:clean(r['Hook ตัวอย่าง']),content:clean(r['เนื้อหา']),cta:clean(r['CTA']),prompt:clean(r['Prompt กลางใช้ได้ทุกรูปแบบ (Google Flow - Scene ให้ AI พิจารณาเองตามความยาวที่กำหนด)']),storyboard:[clean(r['Storyboard 1 / 00:00–10:00']),clean(r['Storyboard 2 / 10:00–20:00']),clean(r['Storyboard 3 / 20:00–30:00'])],imagePrompt:clean(r['Image-to-Video Master / Continuity']),references:clean(r['Reference ที่ต้องเตรียม']),cautions:clean(r['ข้อควรระวังภาพลักษณ์/ข้อมูล']),platforms:clean(r['แพลตฟอร์ม']),status:clean(r['สถานะ']),useWhen:clean(r['ใช้เมื่อ / เลือกซีรีส์นี้เมื่อ']),required:clean(r['ข้อมูลบังคับก่อนเจน']),noGuess:clean(r['ข้อมูลห้ามเดา']),aiOutput:clean(r['AI Output ต้องส่งคืน']),risk:clean(r['ระดับความเสี่ยง'])
}))));
app.get('/api/series-v',(q,s)=>s.json(loadSeriesV()));
app.get('/api/categories',(q,s)=>s.json(loadCategories()));
app.get('/api/platforms',(q,s)=>s.json(loadPlatformSpecs()));
app.get('/api/prompt-blocks',(q,s)=>s.json(loadPromptBlocks()));
app.get('/api/flow-models',(q,s)=>{try{s.json(loadCapabilities());}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/category-suggest',(q,s)=>{const p={Category:q.query.category||'', 'Sub Category':q.query.sub||'', 'Product Name (TH)':q.query.th||'', 'Product Name (EN)':q.query.en||''};const r=resolveCategory(q.query.code||'',p);s.json({code:r.code,name:r.cat.name,auto:r.auto});});
app.get('/api/resolve-series',(q,s)=>{const p={Category:q.query.category||'', 'Sub Category':q.query.sub||'', 'Product Name (TH)':q.query.th||'', 'Product Name (EN)':q.query.en||''};const c=resolveCategory(q.query.cat||'',p);const r=resolveSeries(q.query.v||'',c.code);s.json({vCode:clean(q.query.v).toUpperCase(),category:c.code,categoryName:c.cat.name,categoryAuto:c.auto,sCode:r.sCode,sName:clean(r.row['ซีรีส์/Ai']),sRisk:clean(r.row['ระดับความเสี่ยง']),sUseWhen:clean(r.row['ใช้เมื่อ / เลือกซีรีส์นี้เมื่อ']),reason:r.reason});});
app.get('/api/sheet',(q,s)=>{try{
 const code=clean(q.query.code);if(!code)return s.status(400).json({error:'code required'});
 const known=getProductRow(code);
 const hasEvidence=clean(q.query.th)||clean(q.query.en)||clean(q.query.url)||clean(q.query.img);
 if(!known&&!hasEvidence)return s.status(404).json({error:'product not in master',code});
 const p={Category:q.query.category||'','Sub Category':q.query.sub||'','Product Name (TH)':q.query.th||'','Product Name (EN)':q.query.en||'','Product Code':code,'Product URL':q.query.url||'','Main Image URL':q.query.img||'','Additional Images':q.query.imgs||'','Fitment Brands':q.query.fb||'','Fitment Models':q.query.fm||'','Fitment Contexts':q.query.fc||'','Description (TH)':q.query.dth||'','Description (EN)':q.query.den||''};
 const catRes=resolveCategory(q.query.cat||'',p);
 const r=ensureSheet(code,catRes.code,p,catRes.cat);
 s.json({summary:sheetSummary(r.sheet),created:r.created,category:catRes.code,categoryAuto:catRes.auto});
}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/sheet/versions',(q,s)=>{try{
 const prod=getProductRow(clean(q.query.code));if(!prod)return s.json([]);
 s.json(getSheetVersions(prod.id));
}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/sheet/detail',(q,s)=>{try{
 const prod=getProductRow(clean(q.query.code));if(!prod)return s.status(404).json({error:'not found'});
 const cur=getCurrentSheet(prod.id);if(!cur)return s.status(404).json({error:'no sheet'});
 let identity={},refmap={},locks={};
 try{identity=JSON.parse(cur.identity_json||'{}');}catch{}try{refmap=JSON.parse(cur.reference_map_json||'{}');}catch{}try{locks=JSON.parse(cur.lock_rules_json||'{}');}catch{}
 s.json({sheet:{id:cur.id,version:cur.version_number,status:cur.status,confidence:cur.confidence,updated_at:cur.updated_at},identity,refmap,locks,references:cur.references||[],actions:getSheetActions(cur.id,20)});
}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/sheet/verify',(q,s)=>{try{
 const prod=getProductRow(clean(q.body.code));if(!prod)return s.status(404).json({error:'not found'});
 const cur=getCurrentSheet(prod.id);if(!cur)return s.status(404).json({error:'no sheet'});
 const upd=setSheetStatus(cur.id,'VERIFIED',clean(q.body.note));
 s.json({ok:true,sheet:{id:upd.id,version:upd.version_number,status:upd.status}});
}catch(e){s.status(500).json({error:e.message});}});
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
   [/\b(back|rear|side|top|bottom)[\s-]*(view|angle|profile)\b/i,'อ้างมุมภาพ (back/side/top...) — ตรวจว่ามี reference รองรับจริง ไม่ใช่แต่งเพิ่ม'],
  [/front 3\/4|back view|side view/i,'ห้ามใช้ชื่อมุมภาพที่ AI เดาเองในข้อความการตลาด']
 ];
 for(const [re,msg] of banned)if(re.test(text))checks.push({status:'FAIL',message:msg});
 if(!p['Fitment Models']&&!p['Fitment Brands']&&!p['Fitment Contexts'])checks.push({status:'PASS',message:'ไม่มี Fitment ที่ยืนยัน: ระบบต้องไม่สร้างรถหรือคำเคลมความเข้ากันได้'});
 return {status:checks.some(x=>x.status==='FAIL')?'REVIEW':'PASS',checks};
}
function buildPromptV2(p,t,ctx){
 const images=productImageUrls(p);
 const cat=ctx?.cat||null;
 const seriesExtra=[['รหัสซีรีส์',t['รหัสซีรีส์']],['ใช้เมื่อ',t['ใช้เมื่อ / เลือกซีรีส์นี้เมื่อ']],['ข้อมูลบังคับก่อนเจน',t['ข้อมูลบังคับก่อนเจน']],['ข้อมูลห้ามเดา',t['ข้อมูลห้ามเดา']],['AI Output ต้องส่งคืน',t['AI Output ต้องส่งคืน']],['ระดับความเสี่ยง',t['ระดับความเสี่ยง']]].filter(([,v])=>clean(v)).map(([k,v])=>`- ${k}: ${clean(v)}`).join('\n');
 const catSection=cat?`\n\nCATEGORY MODE [${cat.code} ${cat.name}]:\n${cat.core}\nSCENE DIRECTION: ${cat.direction}\nDO-NOT-GUESS: ${cat.dontGuess}\nCATEGORY NEGATIVE: ${cat.negative}`:'';
 const gb=ctx?.blocks?.['01 GLOBAL RULES']?.text||'';
 const globalRules=gb?`\n\nGLOBAL ORCHESTRATOR RULES (from company Prompt Builder):\n${gb}`:'';
 const dur=ctx?.duration||'30s';
 const DURINFO={'15s':'15 seconds total: hook + 2 concise beats + end card. Prefer 2 scenes when 2 suffice, do not pad.','30s':'30 seconds total: classic 3x10s segment structure (Segment 1/2/3).','45s':'45 seconds total: extended 4-5 segment structure. Add one extra detail/proof beat and a stronger closing card; keep every scene grounded in verified references.'};
 const runtime=`\n\nRUNTIME: TARGET DURATION ${dur} (${DURINFO[dur]||DURINFO['30s']}) Each Google Flow segment is about 10 seconds. Keep the OUTPUT JSON schema identical; the scenes array may contain more or fewer items to fit the duration. Reflect the target duration in the "duration" field of the output.`;
 return `You are the WDI/DIAMOND senior content engineer. Your job is PDCA: PLAN the correct video structure, DO generate the prompt pack, CHECK every claim and visual instruction against the supplied WDI product data AND the attached product images, then ACT by fixing anything unsafe before returning the final pack.

SOURCE OF TRUTH:\n${JSON.stringify(p,null,2)}\n\nVIDEO SERIES:\n${JSON.stringify(t,null,2)}${seriesExtra?`\n\nSERIES CONSTRAINTS (from company workbook):\n${seriesExtra}`:''}${catSection}${globalRules}${ctx?.sheetBlock||''}${ctx?.visualBlock||''}\n\nATTACHED WDI PRODUCT IMAGES: ${images.length} image(s). You can see them in this request. FIRST classify every image as exactly one of: HERO_PRODUCT, REAL_PRODUCT_VIEW, CLOSE_UP_DETAIL, PACKAGING, TECHNICAL_DRAWING, VEHICLE_CONTEXT, INFOGRAPHIC, CONTACT_SHEET, UNKNOWN.

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

${runtime}

OUTPUT JSON ONLY:\n{"series":"","duration":"","hook":"","script":"","voiceover":"","visual_asset_audit":[{"image":"","classification":"","what_is_visible":"","allowed_use":""}],"scenes":[{"time":"","reference":"","start_source":"","visual":"","flow_prompt":""}],"image_to_video_prompt":"REFERENCE MAPPING: Scene 1 = ...; Scene 2 = ...; Scene 3 = ...","caption":"","hashtags":[],"cta":"","source_facts":[],"warnings":[],'platform_captions':{"facebook":"","tiktok":"","instagram":"","line":"","shopee":""}}`;
}

function verifiedLines(sheet){
 try{
  const idn=JSON.parse(sheet.identity_json||'{}');const out=[];
  const comps=idn.components||{};
  for(const[k,c]of Object.entries(comps))if(c&&c.status==='VERIFIED')out.push(`${c.label||k}=${c.value}`);
  if(idn.fitment?.verified)out.push('fitment='+[idn.fitment.brands,idn.fitment.models].filter(Boolean).join(','));
  return out;
 }catch{return [];}
}
const SHEET_SLOTS=`You are a product-identity observer for DIAMOND/WDI. Look at the attached WDI reference images carefully. Output JSON ONLY (no markdown fences, no explanations) with EXACTLY these keys:
{"product_title":"short product type for the sheet heading, e.g. Automotive Interior Dome Lamp","product_type_line":"one line like: A round automotive interior dome lamp / cabin light with:","parts":["5-10 bullets, each ONE observed part with position+appearance, e.g. Small rectangular ON/OFF push switch mounted at the top center"],"shape_lock":["5-9 bullets describing the silhouette and proportions that must stay identical"],"dimensions":{"present":true/false,"items":["only if printed in a supplied technical drawing, e.g. Front diameter: 100 mm"]},"views":[{"name":"FRONT VIEW","desc":"what this view shows and which reference it comes from (3-6 views max, only views a reference supports)"}],"allowed_labels":["at most 4 short factual labels, e.g. ON/OFF SWITCH"],"fidelity":["6-9 bullets of what must stay identical"]}
RULES: describe ONLY what you see (silhouette, parts, positions, colors, materials, textures). Classify images yourself (photo/detail/technical drawing/dimension/other); a drawing is NOT a camera angle. Dimensions ONLY from a visible drawing, quoted exactly, else present=false and no dimension items. Never invent specs, fitment, voltage, materials grade, part numbers, brands. Never copy banner/ad text or Thai script as labels.`;
function assembleSheetPrompt(d, verifiedLine){
 const L=[];
 L.push(d.product_title||'Product Reference Sheet');
 L.push('\nPRODUCT IDENTITY LOCK — ABSOLUTE:\nUse the attached product images and technical drawing as the ONLY source of truth.\nDo not redesign, improve, modernize, simplify, stylize, or invent any part of the product.');
 L.push(`\nPRODUCT:\n${d.product_type_line||'The exact product shown in the references with:'}\n`+(d.parts||[]).map(x=>`- ${x}`).join('\n'));
 L.push(`\nCRITICAL SHAPE LOCK:\nThe overall product silhouette must remain identical to the reference:\n`+(d.shape_lock||[]).map(x=>`- ${x}`).join('\n'));
 const dims=(d.dimensions&&d.dimensions.present&&(d.dimensions.items||[]).length)?d.dimensions.items:[];
 if(dims.length)L.push(`\nDIMENSION LOCK:\nThe technical drawing indicates approximately:\n`+dims.map(x=>`- ${x}`).join('\n')+`\nShow these dimensions clearly and proportionally.`);
 L.push(`\nPRODUCT SHEET LAYOUT:\nCreate a professional industrial product reference sheet on a clean white background.\n\nInclude exactly these views:\n`+(d.views||[]).map((v,i)=>`${i+1}. ${v.name} — ${v.desc}`).join('\n')+`\n\nThe main product must be large and easy to inspect.\nUse consistent scale and alignment between views.`);
 L.push(`\nVISUAL STYLE:\nClean automotive OEM product documentation.\nTechnical catalog / engineering reference sheet.\nNeutral white background.\nSoft neutral studio lighting.\nHigh product clarity.\nAccurate material and surface texture.\nMinimal shadows.\nNo dramatic cinematic lighting.\nNo unnecessary graphic decoration.`);
 L.push(`\nTEXT RULE:\nOnly use factual labels:\n`+((d.allowed_labels||[]).slice(0,4).map(x=>`"${x}"`).join('\n')||'(no text)')+`\n\nDo not invent product specifications, fitment, voltage, wattage, material grade, certifications, part numbers, logos, or brand names.`);
 L.push(`\nPRODUCT FIDELITY:\nThe final sheet must function as a visual identity reference for AI generation.\nAny future image or video generated from this sheet must preserve:\n`+(d.fidelity||[]).map(x=>`- ${x}`).join('\n')+`\n\nDo not add, remove, merge, or reinterpret product components.\nDo not generate an alternative version of the product.\n\nIMPORTANT:\nThis is a PRODUCT REFERENCE / IDENTITY SHEET, not an advertisement.\nPrioritize visual accuracy over aesthetics.`);
 return L.join('\n');
}
function cleanSheetPrompt(t){
 let x=String(t||'').replace(/<unk>/gi,'').replace(/<[^>\n]{0,40}>/g,'').replace(/([^\n])\1{12,}/g,'$1').trim();
 const m=x.search(/PRODUCT IDENTITY LOCK/i);
 if(m>0)x=x.slice(m).trim();
 return x;
}
app.post('/api/sheet-prompt',async(q,s)=>{try{
 const p=q.body.product;if(!p)return s.status(400).json({error:'ไม่พบสินค้า'});
 const hasOR=Boolean(process.env.OPENROUTER_API_KEY);if(!hasOR)return s.status(503).json({error:'ยังไม่ได้ตั้งค่า API Key ใน .env'});
 const catRes=resolveCategory(q.body.categoryCode||'',p);
 let sheet=null;try{sheet=ensureSheet(clean(p['Product Code'])||'UNKNOWN',catRes.code,p,catRes.cat).sheet;}catch(err){}
 const images=productImageUrls(p);
 const model=process.env.OPENROUTER_MODEL||'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
 const verified=sheet?verifiedLines(sheet):[];
 const brief=`PRODUCT DATA (verified source of truth):
${JSON.stringify({code:p['Product Code'],name_th:p['Product Name (TH)'],name_en:p['Product Name (EN)'],category:p.Category,sub:p['Sub Category'],description_th:p['Description (TH)'],description_en:p['Description (EN)'],fitment:[p['Fitment Brands'],p['Fitment Models'],p['Fitment Contexts']].filter(Boolean).join(' | ')},null,2)}
SHEET VERIFIED COMPONENTS: ${verified.length?verified.join(' | '):'(none — rely on visual observation only)'}
CATEGORY: ${catRes.code}. ATTACHED IMAGES: ${images.length}.`;
 const instruction=`You are a product-identity prompt engineer for DIAMOND/WDI. Look at the attached WDI reference images carefully. Your ONLY output is a JSON object (no markdown fences, no explanations) that fills the golden product-sheet pattern. Observe the images using the doctrine below, then encode observations into this EXACT JSON shape: {"product_title":string,"product_type_line":string,"parts":[5-10 strings],"shape_lock":[5-9 strings],"dimensions":{"present":bool,"items":[strings]},"views":[{"name":string,"desc":string}],"allowed_labels":[max 4 strings],"fidelity":[6-9 strings]}. The server assembles the final golden-pattern prompt from your JSON — values are pasted verbatim, so write finished prompt-ready English.

Follow this doctrine (from the company identity-lock blueprint):
- The reference images are the ONLY source of truth. Never redesign, improve, modernize, simplify, stylize or invent any part.
- Describe ONLY what you can actually see. Work PART-BY-PART with no shortcuts: for EVERY visible part write its own bullets covering shape, relative size, exact position, color, material and surface texture (lens/diffuser, housing, switch, stem, ribs/texture, fasteners, markings, packaging if visible). A one-sentence product summary is a failure — be exhaustive.
- Classify each supplied image first (for yourself): real product photo / close-up detail / technical drawing / dimension reference / other. A technical drawing is NOT a camera angle.
- DIMENSION LOCK: include exact dimensions ONLY if they are printed/visible in a supplied technical drawing. Quote the numbers exactly as printed and instruct to show them clearly and proportionally (e.g. DIMENSION CALLOUT view). If no dimensions are visible, omit the DIMENSION LOCK section entirely — never guess.
- LAYOUT: prescribe numbered views mapped to the supplied references, aiming for this full set whenever references support it: 1. FRONT VIEW (full product, large, centered) 2. TOP/SWITCH CLOSE-UP (enlarged detail) 3. SIDE/PROFILE VIEW (depth and thickness) 4. TECHNICAL LINE DRAWING (only if a drawing is supplied, matching it) 5. DIMENSION CALLOUT (verified numbers only). These titles are COMPOSITION INSTRUCTIONS FOR THE GENERATOR ONLY — state explicitly in the prompt that view titles, numbers and headings must NEVER be drawn as visible text, captions or watermarks anywhere in the image. Never request a view no reference supports; state the main product must be large and easy to inspect with consistent scale and alignment.
- VISUAL STYLE: clean automotive OEM product documentation on neutral white background, soft neutral studio lighting, high clarity, accurate material and surface texture, minimal shadows. Explicitly forbid: cinematic/dramatic lighting, dark advertising backgrounds, decorations, and ANY rendered headings, titles, captions, watermarks or overlaid graphics.
- TEXT RULE: the image must contain as little text as possible. The ONLY permitted text in the entire image is a short explicit allowlist you define (verified dimension numbers and at most one short factual product-type label); each allowed item may appear at most once, small, inside its own callout area. Everything else — view titles, section headers, spec sentences, banner text, Thai script, phone numbers, tables — is FORBIDDEN in the image; describe placements only. Forbid inventing specifications, fitment, voltage, wattage, materials grade, certifications, part numbers, logos, brand names.
- Structure the prompt with these exact section headers in order: PRODUCT IDENTITY LOCK, PRODUCT, CRITICAL SHAPE LOCK, DIMENSION LOCK (omit section if none verified), PRODUCT SHEET LAYOUT, VISUAL STYLE, TEXT RULE, PRODUCT FIDELITY. Write thoroughly — a complete prompt, not a summary.
- End with a PRODUCT FIDELITY section (6+ bullets) that repeats the SAME positions and details stated above (be self-consistent: silhouette, every part shape/position, colors, textures, dimensions) plus a line stating this is an identity reference, not an advertisement. Prioritize visual accuracy over aesthetics throughout.

${brief}`;
 const ai=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1',defaultHeaders:{'HTTP-Referer':'http://localhost:3077','X-Title':'WDI Content Generator'}});
 const content=[{type:'text',text:instruction}];
 for(const u of images)content.push({type:'image_url',image_url:{url:u}});
 let text='';
 for(let attempt=0;attempt<2;attempt++){
  const r=await ai.chat.completions.create({model,messages:[{role:'user',content}],temperature:0.2,max_tokens:6000});
  const msg=r.choices?.[0]?.message||{};
  text=typeof msg.content==='string'?msg.content.trim():(Array.isArray(msg.content)?msg.content.map(x=>typeof x==='string'?x:(x?.text||'')).join('').trim():String(msg.reasoning||'').trim());
  text=text.replace(/^```(?:\w+)?\s*/,'').replace(/\s*```$/,'').trim();
  try{
   let jt=text;if(!jt.trim().startsWith('{')&&jt.includes('{')){const a=jt.indexOf('{');const b=jt.lastIndexOf('}');if(b>a)jt=jt.slice(a,b+1);}
   const dd=JSON.parse(jt);
   if(!dd||!Array.isArray(dd.parts)||!dd.parts.length||!Array.isArray(dd.fidelity)||!dd.fidelity.length)throw new Error('bad slots');
   text=assembleSheetPrompt(dd);
  }catch{ text=''; }
  if(text.length>=800)break;
 }
 if(text.length>6000)text=text.slice(0,6000);
 if(text.length<800){console.error(`[sheet-prompt] rejected len=${text.length} model=${model} raw=${String(text||'').slice(0,300)}`);return s.status(502).json({error:'AI ตอบสั้นเกินไป — ลองกดใหม่อีกครั้ง',model});}
 if(sheet){try{setSheetVisual(sheet.id,text);}catch{}}
 s.json({ok:true,prompt:text,model,imageCount:images.length,sheet:sheet?{id:sheet.id,version:sheet.version_number,status:sheet.status}:null,saved:!!sheet});
}catch(e){const status=e?.status===401?502:e?.status===429?503:500;s.status(status).json({error:e?.message||'สร้าง prompt ไม่สำเร็จ',code:e?.code||null,status:e?.status||null});}});
app.post('/api/image-generate',async(q,s)=>{try{const prompt=clean(q.body?.prompt);if(!prompt)return s.status(400).json({ok:false,error:'Prompt required'});const mode=clean(q.body?.mode)||'hero';const square=/detail|compare|1:1|\bsquare\b/i.test(mode);let w=Number(q.body?.w)||1024,h=Number(q.body?.h)||(square?1024:1280);w=Math.max(512,Math.min(1536,w));h=Math.max(512,Math.min(1536,h));const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0,1500))}?width=${w}&height=${h}&nologo=true&model=flux&seed=${Math.floor(Math.random()*999999)}`;const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),110000);let r;try{r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 WDI-Content-Generator'},signal:ctrl.signal});}finally{clearTimeout(timer);}if(!r.ok)return s.status(r.status).json({ok:false,provider:'pollinations',error:`Image provider HTTP ${r.status} (free tier busy, try again)`});const mime=r.headers.get('content-type')||'image/jpeg';const b=Buffer.from(await r.arrayBuffer());if(b.length<5000)return s.status(502).json({ok:false,provider:'pollinations',error:'Image provider returned empty image, try again'});s.json({ok:true,provider:'pollinations',model:'flux',mime,data:b.toString('base64')});}catch(e){s.status(500).json({ok:false,provider:'pollinations',error:e.name==='AbortError'?'Image generation timed out (free tier busy), try again':(e.message||'image generation failed')});}});
function buildMarketplacePrompt(p){const fit=[p['Fitment Brands'],p['Fitment Models'],p['Fitment Contexts'],p['Fitment Evidence']].filter(Boolean).join(' | ');return 'You are a senior automotive e-commerce art director for WDI / DIAMOND (ไฟตราเพชร). Create reusable professional English image prompts for one exact product. PRODUCT DATA:\n'+JSON.stringify(p,null,2)+'\nVERIFIED WDI FITMENT DATA (navigation/evidence only; never infer):\n'+(fit||'NONE')+'\n\nBRAND SYSTEM: DIAMOND / ไฟตราเพชร; midnight navy, electric blue, metallic silver, diamond yellow/gold, premium automotive advertising. The supplied DIAMOND logo asset is authoritative; never redraw, distort, recolor or invent it.\n\nPRODUCT LOCK: preserve exact product silhouette, proportions, lens, housing, bezel, reflector, connector, wire count, mounting points, screws/clips, materials, color, finish and visible markings from the supplied reference. No redesign, beautification, mirroring, recoloring, merging variants or invented components.\n\nFITMENT LOCK: show a vehicle only if verified WDI fitment is present. If present, use only the exact supplied brand/model/year/variant context. Never infer compatibility from visual similarity.\n\nOUTPUT: JSON only: {"prompts":{"hero":"","detail":"","context":"","catalog":"","social":""},"negative_prompt":"","brand_rules":"","source_facts":""}. All prompts must describe photorealistic premium commercial imagery, 4:5 except detail 1:1, strong hierarchy, cinematic three-point lighting, electric-blue rim light, warm gold highlights, realistic reflections, clean negative space for post-production text. For technical details, mention only features explicitly present in PRODUCT DATA or clearly visible in the supplied reference; if a feature is not verified, use generic visible-detail language and do not name it. Never invent connector type, wire count, lens system, reflector, adjustment mechanism, bulb, LED behavior, materials, dimensions or specifications. Do not rely on AI-generated Thai typography; text should be added later. Negative prompt must include wrong product, changed geometry, wrong connector, invented fitment, fake logo, fake text, fake specs, duplicate, extra parts, deformation, cartoon, surreal, excessive VFX.';}
app.post('/api/generate-marketplace',async(q,s)=>{try{const p=q.body.product;if(!p)return s.status(400).json({error:'Product required'});const ai=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1',defaultHeaders:{'HTTP-Referer':'http://localhost:3077','X-Title':'WDI Content Generator'}});const r=await ai.chat.completions.create({model:process.env.OPENROUTER_MODEL||'minimax/minimax-m3:free',messages:[{role:'user',content:buildMarketplacePrompt(p)}],temperature:0.45,max_tokens:4000});const text=String(r.choices?.[0]?.message?.content||'').trim().replace(/^```json\s*/i,'').replace(/\s*```$/i,'');try{s.json(JSON.parse(text));}catch{s.json({raw:text});}}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/generate',async(q,s)=>{
 let track=null,jobId=null;
 try{
   const p=q.body.product;if(!p)return s.status(400).json({error:'ไม่พบสินค้า'});
   const ts=loadTemplates();
   const catRes=resolveCategory(q.body.categoryCode||'',p);
   let t,res;
   if(clean(q.body.vCode)){res=resolveSeries(q.body.vCode,catRes.code);t=res.row;}
   else{const templateId=Number(q.body.templateId)||0;t=ts[templateId];if(!t)return s.status(404).json({error:'ไม่พบ Video Template'});res={sCode:clean(t['รหัสซีรีส์'])||('T'+(templateId+1)),sIndex:templateId,reason:'legacy templateId'};}
   const jobV=clean(q.body.vCode).toUpperCase()||('S:'+res.sCode);
   try{track=getOrCreateJob(clean(p['Product Code'])||clean(p['Product URL'])||'UNKNOWN',jobV,{categoryCode:catRes.code,sCode:res.sCode});jobId=track.job.id;}catch(err){track=null;}
   const hasOR=Boolean(process.env.OPENROUTER_API_KEY),hasOA=Boolean(process.env.OPENAI_API_KEY);if(!hasOR&&!hasOA)return s.status(503).json({error:'ยังไม่ได้ตั้งค่า API Key ใน .env'});
    const images=productImageUrls(p);const model=hasOR&&(process.env.AI_PROVIDER!=='openai')?(process.env.OPENROUTER_MODEL||'thinkingmachines/inkling:free'):(process.env.OPENAI_MODEL||'gpt-4o-mini');
    const durRaw=String(q.body.duration||'30s');const dur=['15s','30s','45s'].includes(durRaw)?durRaw:'30s';
    const mode=q.body.mode==='replacement'?'replacement':'showcase';
    let sheet=null,sheetWarn='';
    try{
     const r=ensureSheet(clean(p['Product Code'])||'UNKNOWN',catRes.code,p,catRes.cat);
     sheet=r.sheet;
     if(sheet&&sheet.status!=='VERIFIED')sheetWarn=`Product Sheet v${sheet.version_number} ยังไม่ VERIFIED (${sheet.status}) — ตรวจ sheet ก่อนเผยแพร่`;
    }catch(err){sheet=null;}
    const sheetMeta=sheet?{id:sheet.id,version:sheet.version_number,status:sheet.status,confidence:sheet.confidence}:null;
    const blocks=loadPromptBlocks();
    const visualBlock=(sheet&&sheet.visual_prompt)?`\n\nAPPROVED VISUAL IDENTITY (Product Sheet #${sheet.id} v${sheet.version_number} — SAME direction as the reference sheet, overrides any conflicting creative text):\n${String(sheet.visual_prompt).slice(0,2500)}\n\nHARD RULES FOR EVERY SCENE (flow_prompt, visual, script):\n- Describe ONLY parts, colors, materials and views present in the identity above or the attached reference images.\n- NEVER invent colors, parts (screws, sockets, wires, vents, bulbs, mounts) or views (back/rear/side/top/bottom) beyond the references.\n- Every scene MUST state which supplied reference image it uses. If a view has no reference, cut cleanly to a verified view instead of inventing one.\n- V/S creative direction must not rewrite this identity. On conflict, this identity wins.`:'';
    const ctx={cat:catRes.cat,blocks,duration:dur,sheetBlock:sheet?sheetPromptBlock(sheet,mode):'',sheetMeta,visualBlock};
    const caps=loadCapabilities();const flowModel=caps.models[q.body.flowModel]?q.body.flowModel:caps.defaultModel;
    const plan=planDurations(parseInt(dur),flowModel);
    const sbPlan=buildStoryboard({plan,templateRow:t,sheetRow:(loadStoryboardRows()[res.sCode]||null),sheetRefs:(sheet&&sheet.references||[]).map(r=>({view:r.view_type,url:r.image_url})),productCode:clean(p['Product Code'])});
    const cacheKey=crypto.createHash('sha256').update(JSON.stringify({v:7,model,vCode:clean(q.body.vCode).toUpperCase(),sCode:res.sCode,category:catRes.code,duration:dur,mode,flowModel,sheetV:sheetMeta?sheetMeta.version:0,product:p,images})).digest('hex');const cache=loadContentCache();
    if(!q.body.force&&cache[cacheKey])return s.json({...cache[cacheKey],_meta:{model,cache:true,imageCount:images.length,vCode:clean(q.body.vCode).toUpperCase(),mappedS:res.sCode,mapReason:res.reason,category:catRes.code,categoryAuto:catRes.auto,duration:dur,mode,flowModel,jobId,sheet:sheetMeta,sheetWarn,qa:cache[cacheKey].qa||null}});
   if(jobId){try{logAction(jobId,'GENERATE_STARTED',{v:jobV,s:res.sCode,category:catRes.code});if(clean(q.body.vCode))logAction(jobId,'S_AUTO_MAPPED',{v:jobV,s:res.sCode,reason:res.reason});touchJob(jobId,{status:'IN_PROGRESS',current_stage:'AI_GENERATING'});}catch(err){}}
   let text='';let promptText='';
   if(hasOR&&(process.env.AI_PROVIDER!=='openai')){
   const ai=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1',defaultHeaders:{'HTTP-Referer':'http://localhost:3077','X-Title':'WDI Content Generator'}});
    promptText=buildPromptV2(p,t,ctx);
    const content=[{type:'text',text:promptText}];
    content[0].text+=`\n\nSTORYBOARD PLAN (generation units for Google Flow): return EXACTLY ${plan.segments.length} scenes, one per generation, with these durations in seconds: [${plan.segments.join(', ')}] (${plan.modelLabel}). Scene purposes in order: ${(sbPlan.scenes.map(s=>s.id+'='+s.purpose.slice(0,80)).join(' | '))}. Keep the OUTPUT JSON scenes array in the same order with a matching flow_prompt per scene.`;
    for(const u of images)content.push({type:'image_url',image_url:{url:u}});
    const cleanJsonText=t=>{let x=String(t||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();if(x&&!x.startsWith('{')&&x.includes('{')){const a=x.indexOf('{');const b=x.lastIndexOf('}');if(b>a)x=x.slice(a,b+1);}return x.trim();};
    const msgToText=m=>{let c=typeof m.content==='string'?m.content.trim():'';if(!c&&m.reasoning)c=String(m.reasoning).trim();if(Array.isArray(m.content))c=m.content.map(x=>typeof x==='string'?x:(x?.text||'')).join('').trim();return cleanJsonText(c);};
    for(let attempt=0;attempt<3;attempt++){
     const r=await ai.chat.completions.create({model,messages:[{role:'user',content}],temperature:0.2,max_tokens:5000});
     text=msgToText(r.choices?.[0]?.message||{});
     try{JSON.parse(text);break;}catch{ if(attempt===2)break; }
    }
   }else{
    const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});const r=await ai.responses.create({model,input:promptText});text=(r.output_text||'').trim().replace(/^```json\s*/i,'').replace(/\s*```$/i,'');
   }
   try{
    const out=JSON.parse(text);out.qa=qaContentPack(out,p);out._meta={model,cache:false,imageCount:images.length,vCode:clean(q.body.vCode).toUpperCase(),mappedS:res.sCode,mapReason:res.reason,category:catRes.code,categoryAuto:catRes.auto,duration:dur,mode,flowModel,jobId,sheet:sheetMeta,sheetWarn,plan:{model:plan.model,generations:plan.generations,segments:plan.segments},qa:out.qa};
     if(jobId){try{const ver=createVersion(jobId,{input:{product:p,v:jobV,s:res.sCode,category:catRes.code,sheet:sheetMeta,mode},prompt:promptText,output:out,model,status:'GENERATED'});out._meta.version=ver.version_number;touchJob(jobId,{status:'GENERATED',current_stage:'CONTENT_GENERATED',s_code:res.sCode});logAction(jobId,'GENERATE_COMPLETED',{version:ver.version_number,model});}catch(err){console.error('track version failed:',err?.message||err);}}
    const aiScenes=Array.isArray(out.scenes)?out.scenes:[];
    out.flow_prompts=aiScenes.map((sc,i)=>({scene_id:(sbPlan.scenes[i]||{}).id||('SC'+String(i+1).padStart(2,'0')),duration:((plan.segments[i]!==undefined?plan.segments[i]:plan.segments[plan.segments.length-1]||10))+'s',prompt:sc.flow_prompt||''}));
    out.storyboard={total_duration:sbPlan.total_duration,requested:sbPlan.requested,remainder:sbPlan.remainder,model:sbPlan.model,modelLabel:sbPlan.modelLabel,generations:sbPlan.generations,scenes:sbPlan.scenes.map((ps,i)=>({...ps,visual:(aiScenes[i]||{}).visual||'',action:(aiScenes[i]||{}).flow_prompt||'',reference_status:(ps.reference||[]).includes('[REFERENCE_NOT_AVAILABLE]')?'NEEDS_REVIEW':'OK',ai_matched:!!aiScenes[i]}))};
    if(aiScenes.length!==sbPlan.scenes.length)out.storyboard.note=`AI returned ${aiScenes.length} scenes vs plan ${sbPlan.scenes.length} — mapped in order, verify coverage`;
    cache[cacheKey]=out;saveContentCache(cache);s.json(out);
  }catch{if(jobId){try{createVersion(jobId,{input:{product:p,v:jobV},prompt:typeof promptText!=='undefined'?promptText:'',model:typeof model!=='undefined'?model:'',status:'FAILED',error:String(text||'').slice(0,500)});touchJob(jobId,{status:'ERROR',current_stage:'AI_GENERATING'});logAction(jobId,'GENERATE_FAILED',{error:String(text||'').slice(0,300)});}catch(err){}}s.status(502).json({error:'AI ตอบกลับไม่ใช่ JSON ที่ใช้งานได้ — กดเจนใหม่ได้โดยไม่ต้องเปลี่ยนข้อมูลสินค้า',raw:text.slice(0,6000),model,jobId});}
  }catch(e){
   if(jobId){try{logAction(jobId,'GENERATE_FAILED',{error:String(e?.message||e).slice(0,300)});touchJob(jobId,{status:'ERROR',current_stage:'AI_GENERATING'});}catch(err){}}
   const status=e?.status===401?502:e?.status===429?503:500;let message=e?.message||'เกิดข้อผิดพลาดในการสร้าง Content Pack';if(e?.status===429)message='API 429: โมเดลฟรีกำลังเต็ม/ถูก rate limit — ลองใช้ผลที่ cache ก่อน หรือรอสักครู่';if(e?.status===402)message='OpenRouter 402: เครดิตหมด/โมเดลไม่ฟรี';s.status(status).json({error:message,code:e?.code||null,status:e?.status||null,jobId});
 }
});
// ---------- PRODUCTION MEMORY / TRACKING API ----------
app.post('/api/track/select',(q,s)=>{try{
 const code=clean(q.body.productCode),v=clean(q.body.vCode).toUpperCase(),by=clean(q.body.by)||'web';
 if(!code)return s.status(400).json({error:'productCode required'});
 if(v){const {job}=getOrCreateJob(code,v,{categoryCode:clean(q.body.categoryCode),sCode:clean(q.body.sCode)});logAction(job.id,'V_SELECTED',{v,s:clean(q.body.sCode),category:clean(q.body.categoryCode)},by);touchJob(job.id,{status:'IN_PROGRESS',current_stage:'PRODUCT_SELECTED'});return s.json({ok:true,jobId:job.id});}
 logAction(null,'PRODUCT_SELECTED',{code},by);return s.json({ok:true});
}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/jobs/status',(q,s)=>{try{const codes=Array.isArray(q.body.codes)?q.body.codes.map(clean).filter(Boolean).slice(0,1200):[];s.json(codesStatus(codes));}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/job',(q,s)=>{try{
 const ps=productStatusSummary(clean(q.query.code));if(!ps.exists)return s.json(ps);
 const out={...ps};
 if(clean(q.query.v)){const job=ps.jobs.find(j=>j.v_code===clean(q.query.v).toUpperCase());if(job){const full=initDb().prepare('SELECT * FROM production_jobs WHERE product_id=(SELECT id FROM products WHERE product_code=?) AND v_code=?').get(ps.code,job.v_code);out.versions=getVersions(full.id);out.actions=getActions(full.id,20);out.jobId=full.id;}}
 s.json(out);
}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/versions',(q,s)=>{try{s.json(getVersions(Number(q.query.job)||0));}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/version',(q,s)=>{try{const r=getVersionOutput(Number(q.query.job)||0,Number(q.query.v)||0);if(!r)return s.status(404).json({error:'not found'});s.json({version:r.version_number,status:r.generation_status,model:r.model,output:r.output_json?JSON.parse(r.output_json):null,error:r.error,created_at:r.created_at});}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/qc',(q,s)=>{try{const job=setQC(Number(q.body.jobId)||0,!!q.body.passed,clean(q.body.note),clean(q.body.by)||'web');s.json({ok:true,job});}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/publish',(q,s)=>{try{const row=setPublish(Number(q.body.jobId)||0,clean(q.body.platform),clean(q.body.status),clean(q.body.by)||'web');s.json({ok:true,publish:row});}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/publish',(q,s)=>{try{s.json(getPublish(Number(q.query.job)||0));}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/dashboard',(q,s)=>{try{s.json(getDashboard());}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/next',(q,s)=>{try{s.json(getNextJobs(Math.max(1,Math.min(20,Number(q.query.limit)||5))));}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/campaigns',(q,s)=>{try{if(!clean(q.body.name))return s.status(400).json({error:'name required'});s.json({ok:true,campaign:createCampaign(clean(q.body.name),q.body)});}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/campaigns/items',(q,s)=>{try{s.json({ok:true,added:addCampaignItems(Number(q.body.campaignId)||0,Array.isArray(q.body.codes)?q.body.codes:[])});}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/campaigns/:id',(q,s)=>{try{const p=campaignProgress(Number(q.params.id)||0);if(!p)return s.status(404).json({error:'not found'});s.json(p);}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/memory',(q,s)=>{try{s.json(getMemory(clean(q.query.type)||'project',clean(q.query.scope)||'project'));}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/memory',(q,s)=>{try{if(!clean(q.body.key))return s.status(400).json({error:'key required'});setMemory(clean(q.body.type)||'project',clean(q.body.key),q.body.value??'',clean(q.body.scope)||'project');s.json({ok:true});}catch(e){s.status(500).json({error:e.message});}});
// ---------- CONTENT DISTRIBUTION STUDIO API (legacy /api/generate-marketplace kept intact) ----------
app.post('/api/assistant',(q,s)=>{try{s.json(askAssistant(q.body.question||''));}catch(e){s.status(500).json({error:e.message});}});
function distProductId(code) {
  const d = initDb();
  let row = d.prepare('SELECT * FROM products WHERE product_code=?').get(String(code || '').trim());
  if (!row) {
    const r = d.prepare('INSERT INTO products (product_code,synced_at) VALUES (?,?)').run(String(code || '').trim(), new Date().toISOString());
    row = d.prepare('SELECT * FROM products WHERE id=?').get(r.lastInsertRowid);
  }
  return row;
}
function distCampaignCtx(productId) {
  try {
    const d = initDb();
    const r = d.prepare(`SELECT c.campaign_name,ci.day_number,ci.set_number,ci.priority FROM campaign_items ci
      JOIN campaigns c ON c.id=ci.campaign_id WHERE ci.product_id=? AND c.status='ACTIVE' ORDER BY ci.day_number LIMIT 1`).get(productId);
    if (!r) return '';
    return `Campaign ${r.campaign_name}, Day ${r.day_number||'-'}, Set #${r.set_number||'-'}, priority ${r.priority||0}`;
  } catch { return ''; }
}
app.post('/api/content-distribution',async(q,s)=>{try{
 const p=q.body.product;if(!p||!clean(p['Product Code']))return s.status(400).json({error:'product with Product Code required'});
 const angle=(ANGLES[clean(q.body.angle).toUpperCase()]?clean(q.body.angle).toUpperCase():'A');
 const plats=(Array.isArray(q.body.platforms)&&q.body.platforms.length?q.body.platforms:Object.keys(PLATFORMS)).filter(k=>PLATFORMS[k]);
 if(!plats.length)return s.status(400).json({error:'no valid platforms'});
 const hasOR=Boolean(process.env.OPENROUTER_API_KEY);if(!hasOR)return s.status(503).json({error:'ยังไม่ได้ตั้งค่า API Key ใน .env'});
 const catRes=resolveCategory(q.body.categoryCode||'',p);
 let sheet=null;try{sheet=ensureSheet(clean(p['Product Code']),catRes.code,p,catRes.cat).sheet;}catch(err){}
 const sheetCtx=sheet?`Sheet #${sheet.id} v${sheet.version_number} [${sheet.status}]`: 'none';
 const prodRow=distProductId(clean(p['Product Code']));
 const facts=buildFacts(p,sheet?{verifiedFields:(sheetSummary(sheet)?.verified_fields||[])}:null);
 const cfg=loadBusinessConfig();
 const contact=contactBlock(cfg);
 const prompt=buildDistPrompt({product:p,facts,sheetCtx,angle,campaignCtx:distCampaignCtx(prodRow.id),contact,platforms:plats});
 const model=process.env.OPENROUTER_MODEL||'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
 const ai=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1',defaultHeaders:{'HTTP-Referer':'http://localhost:3077','X-Title':'WDI Content Generator'}});
 let out=null,lastErr='';
 const msgs=[{role:'user',content:prompt}];
 for(let attempt=0;attempt<3;attempt++){
  try{
   const r=await ai.chat.completions.create({model,messages:msgs,temperature:0.3,max_tokens:6000});
   const msg=r.choices?.[0]?.message||{};
   let t=typeof msg.content==='string'?msg.content.trim():(Array.isArray(msg.content)?msg.content.map(x=>typeof x==='string'?x:(x?.text||'')).join('').trim():'');
   if(!t&&msg.reasoning)t=String(msg.reasoning).trim();
   t=t.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
   if(!t.startsWith('{')&&t.includes('{')){const a=t.indexOf('{');const b=t.lastIndexOf('}');if(b>a)t=t.slice(a,b+1);}
   const d=JSON.parse(t);
   if(!d||!d.platforms)throw new Error('bad shape');
   out=d;break;
  }catch(e){lastErr=e?.message||'parse failed';msgs.push({role:'user',content:'Return ONLY the JSON object now. No explanations, no reasoning text.'});}
 }
 if(!out)return s.status(502).json({error:'AI ตอบกลับใช้ไม่ได้ — ลองกดใหม่อีกครั้ง',detail:lastErr,model});
 const hashtags={};const keywords=buildKeywords(p,facts.fitmentVerified);
 for(const k of plats)hashtags[k]=buildHashtags(p,facts.fitmentVerified,k,cfg).all;
 const plan={product:{code:clean(p['Product Code']),name:clean(p['Product Name (TH)'])||clean(p['Product Name (EN)']),category:clean(p.Category)},sheet:sheet?{id:sheet.id,version:sheet.version_number,status:sheet.status}:null,angle,facts,platforms:{},hashtags,keywords,contact,campaign:distCampaignCtx(prodRow.id),generated_at:new Date().toISOString()};
 for(const k of plats)plan.platforms[k]=out.platforms[k]||{};
 const qa=qaContent(plan,facts);
 const score=scoreContent(plan,qa);
 plan.qa=qa;plan.score=score;
 const saved=[];
 for(const k of plats){
  const v=saveContentVersion(prodRow.id,{platform:k,angle,content:plan.platforms[k],qa,score:score.total,status:score.ready?'READY':'DRAFT'});
  saved.push({platform:k,...v});
 }
 s.json({ok:true,plan,versions:saved,model});
}catch(e){const status=e?.status===401?502:e?.status===429?503:500;s.status(status).json({error:e?.message||'สร้าง content ไม่สำเร็จ',status:e?.status||null});}});
app.post('/api/content-qa',(q,s)=>{try{
 const plan=q.body.plan;if(!plan||!plan.platforms)return s.status(400).json({error:'plan required'});
 const p=(q.body.product||{});const facts=buildFacts(p,null);
 const qa=qaContent(plan,facts);s.json({qa,score:scoreContent(plan,qa)});
}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/content-rewrite',(q,s)=>{try{
 const platform=clean(q.body.platform);if(!PLATFORMS[platform])return s.status(400).json({error:'unknown platform'});
 const text=clean(q.body.text);if(!text)return s.status(400).json({error:'text required'});
 const instruction=clean(q.body.instruction)||'ปรับให้อ่านง่าย';
 const p=q.body.product||{};const facts=buildFacts(p,null);
 const finish=(t)=>s.json({ok:true,text:t});
 (async()=>{
  const ai=new OpenAI({apiKey:process.env.OPENROUTER_API_KEY,baseURL:process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1',defaultHeaders:{'HTTP-Referer':'http://localhost:3077','X-Title':'WDI Content Generator'}});
  const r=await ai.chat.completions.create({model:process.env.OPENROUTER_MODEL||'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',messages:[{role:'user',content:`Rewrite the following ${PLATFORMS[platform].name} copy per this instruction: ${instruction}.\n\nHARD RULES: keep every verified fact EXACTLY as-is (numbers, codes, names, fitment). Never add specs, price, warranty, compatibility or placeholders like "...". Output ONLY the rewritten text, same language (Thai).\n\nVERIFIED FACTS:\n${facts.verified.map(f=>`- ${f.label}: ${f.value}`).join('\n')}\n\nTEXT:\n${text.slice(0,2000)}`}],temperature:0.4,max_tokens:1500});
  const msg=r.choices?.[0]?.message||{};
  finish(typeof msg.content==='string'?msg.content.trim():'');
 })().catch(e=>s.status(e?.status===429?503:500).json({error:e?.message||'rewrite failed'}));
}catch(e){s.status(500).json({error:e.message});}});
app.get('/api/content-history',(q,s)=>{try{
 const row=initDb().prepare('SELECT * FROM products WHERE product_code=?').get(clean(q.query.code));
 if(!row)return s.json([]);
 s.json(getContentHistory(row.id,clean(q.query.platform)||'facebook',clean(q.query.angle||'A').toUpperCase()));
}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/content-status',(q,s)=>{try{
 s.json({ok:true,content:setContentStatus(Number(q.body.id)||0,String(q.body.status||'DRAFT').toUpperCase())});
}catch(e){s.status(500).json({error:e.message});}});
app.post('/api/memory/import',async(q,s)=>{try{
 const{spawn}=await import('node:child_process');
 const child=spawn(process.execPath,[path.join(ROOT,'import-memory.mjs')],{cwd:ROOT,windowsHide:true,env:{...process.env}});
 let out='',err='';child.stdout.on('data',d=>{out+=d.toString()});child.stderr.on('data',d=>{err+=d.toString()});
 await new Promise((resolve,reject)=>{child.on('close',code=>code===0?resolve():reject(new Error(err||out||('import exit '+code))));child.on('error',reject)});
 s.json({ok:true,log:out.trim()});
}catch(e){s.status(500).json({ok:false,error:e.message});}});
// ---------- SET BUILDER API (campaign composition layer; product workflow untouched) ----------
function setSheetMap(items) {
  // {code: {sheet, ident}} — reuses existing sheets, ensures missing ones (no AI here)
  const map = {};
  for (const it of items) {
    try {
      const p = { 'Product Code': it.product_code, 'Product Name (TH)': it.product_name_th, 'Product Name (EN)': it.product_name_en, Category: it.category, 'Product URL': '', 'Main Image URL': it.main_image_url, 'Additional Images': '', 'Fitment Brands': '', 'Fitment Models': it.fitment_text || '', 'Fitment Contexts': '', 'Description (TH)': '', 'Description (EN)': '' };
      const r = ensureSheet(it.product_code, '', p, null);
      const sh = r.sheet;
      let ident = `Sheet #${sh.id} v${sh.version_number} [${sh.status}]`;
      try {
        const idn = JSON.parse(sh.identity_json || '{}');
        const comps = idn.components || {};
        const vok = Object.entries(comps).filter(([, c]) => c && c.status === 'VERIFIED').map(([, c]) => `${c.label || ''}=${c.value || ''}`);
        if (vok.length) ident += ' | ' + vok.slice(0, 6).join(' ; ');
      } catch {}
      map[it.product_code] = { sheet: sh, ident };
    } catch (e) { map[it.product_code] = { sheet: null, ident: '[sheet error]' }; }
  }
  return map;
}
app.get('/api/sets', (q, s) => { try { s.json(listSets()); } catch (e) { s.status(500).json({ error: e.message }); } });
app.post('/api/sets', (q, s) => { try {
  s.json({ ok: true, set: createSet({ campaignId: q.body.campaignId || null, name: q.body.name, code: q.body.code || '', vehicle: q.body.vehicle || '', day: q.body.day || 0, days: q.body.days || 0, description: q.body.description || '' }) });
} catch (e) { s.status(400).json({ error: e.message }); } });
app.get('/api/sets/:id', (q, s) => { try {
  const d = getSetDetail(Number(q.params.id) || 0);
  if (!d) return s.status(404).json({ error: 'not found' });
  d.sheets = {};
  for (const it of d.items) {
    try {
      const prod = getProductRow(it.product_code);
      const cur = prod ? getCurrentSheet(prod.id) : null;
      d.sheets[it.product_code] = cur ? { version: cur.version_number, status: cur.status, confidence: cur.confidence } : null;
    } catch { d.sheets[it.product_code] = null; }
  }
  s.json(d);
} catch (e) { s.status(500).json({ error: e.message }); } });
app.post('/api/sets/:id/items', (q, s) => { try {
  const codes = Array.isArray(q.body.codes) ? q.body.codes : String(q.body.codes || '').split(/[\n,;]+/);
  s.json({ ok: true, added: addSetItems(Number(q.params.id) || 0, codes) });
} catch (e) { s.status(500).json({ error: e.message }); } });
app.patch('/api/set-items/:id', (q, s) => { try {
  s.json({ ok: true, item: updateSetItem(Number(q.params.id) || 0, q.body || {}) });
} catch (e) { s.status(500).json({ error: e.message }); } });
app.delete('/api/set-items/:id', (q, s) => { try {
  removeSetItem(Number(q.params.id) || 0); s.json({ ok: true });
} catch (e) { s.status(500).json({ error: e.message }); } });
app.post('/api/sets/:id/auto-group', (q, s) => { try {
  const d = getSetDetail(Number(q.params.id) || 0);
  if (!d) return s.status(404).json({ error: 'not found' });
  const assigns = autoGroupItems(d.items);
  for (const a of assigns) updateSetItem(a.itemId, { group_code: a.group_code, group_name: a.group_name, role: a.role });
  s.json({ ok: true, assigned: assigns.length, detail: getSetDetail(d.set.id) });
} catch (e) { s.status(500).json({ error: e.message }); } });
app.post('/api/sets/:id/storyboard', async (q, s) => { try {
  const d = getSetDetail(Number(q.params.id) || 0);
  if (!d) return s.status(404).json({ error: 'not found' });
  const totalSecs = Math.max(4, Math.min(120, Number(q.body.totalSecs) || 30));
  const caps = loadCapabilities();
  const model = caps.models[q.body.model] ? q.body.model : caps.defaultModel;
  const plan = planDurations(totalSecs, model);
  const sheets = setSheetMap(d.items);
  const fullPlan = buildSetPlan({ set: d.set, items: d.items, sheets, totalSecs, modelKey: model });
  fullPlan.plan = plan;
  const prompts = {};
  for (const sc of fullPlan.scenes) {
    const blocks = {};
    for (const c of sc.product_codes) blocks[c] = (sheets[c] && sheets[c].ident) || '[identity: use attached reference, no invention]';
    const fit = {};
    for (const c of sc.product_codes) {
      const it = d.items.find(x => x.product_code === c);
      if (it && it.fitment_text) fit[c] = it.fitment_text;
    }
    prompts[sc.id] = buildScenePrompt({ set: d.set, scene: sc, sheetBlocks: blocks, fitments: fit });
  }
  const qc = qcSetPlan({ set: d.set, items: d.items, plan: fullPlan, prompts });
  const saved = saveSetPlan(d.set.id, { plan: fullPlan, prompts }, clean(q.body.note) || 'storyboard', clean(q.body.by) || 'web');
  try { logAction(null, 'SET_STORYBOARD', { set: d.set.id, version: saved.version, scenes: fullPlan.scenes.length }, clean(q.body.by) || 'web'); } catch {}
  s.json({ ok: true, version: saved.version, plan: fullPlan, prompts, qc });
} catch (e) { s.status(500).json({ error: e.message }); } });
app.post('/api/sets/:id/regenerate-scene', async (q, s) => { try {
  const setId = Number(q.params.id) || 0;
  const sceneId = String(q.body.scene_id || '').toUpperCase();
  const cur = getSetPlan(setId);
  if (!cur) return s.status(404).json({ error: 'no plan yet' });
  const data = JSON.parse(cur.plan_json || '{}');
  const sc = (data.plan?.scenes || []).find(x => x.id === sceneId);
  if (!sc) return s.status(404).json({ error: 'scene not found' });
  const oldPrompt = (data.prompts || {})[sceneId] || '';
  const hasOR = Boolean(process.env.OPENROUTER_API_KEY);
  if (!hasOR) return s.status(503).json({ error: 'ยังไม่ได้ตั้งค่า API Key ใน .env' });
  const ai = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1', defaultHeaders: { 'HTTP-Referer': 'http://localhost:3077', 'X-Title': 'WDI Content Generator' } });
  const r = await ai.chat.completions.create({ model: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', messages: [{ role: 'user', content: `Rewrite this ONE Google Flow scene prompt. Keep: same products with own identities, same duration ${sc.duration}, same references, same continuity. Improve camera/action clarity. HARD RULES: never merge SKUs, never mirror LH to fake RH, never move fitment across products, no invented specs/prices/compatibility/text/logos. Output ONLY the rewritten scene prompt text.\n\nSCENE: ${sc.id} ${sc.title} (${sc.duration})\nPRODUCTS: ${(sc.product_codes || []).join(', ')}\n\nCURRENT PROMPT:\n${String(oldPrompt).slice(0, 3000)}` }], temperature: 0.3, max_tokens: 3000 });
  const msg = r.choices?.[0]?.message || {};
  let text = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (!text && Array.isArray(msg.content)) text = msg.content.map(x => typeof x === 'string' ? x : (x?.text || '')).join('').trim();
  if (!text && msg.reasoning) text = String(msg.reasoning).trim();
  text = text.replace(/^```(?:\w+)?\s*/, '').replace(/\s*```$/, '').trim();
  if (!text) return s.status(502).json({ error: 'AI ตอบว่าง — ลองใหม่' });
  data.prompts = { ...(data.prompts || {}), [sceneId]: text };
  const saved = saveSetPlan(setId, data, `regen ${sceneId}`, clean(q.body.by) || 'web');
  try { logAction(null, 'SET_SCENE_REGEN', { set: setId, scene: sceneId, version: saved.version }, clean(q.body.by) || 'web'); } catch {}
  s.json({ ok: true, version: saved.version, scene_id: sceneId, prompt: text });
} catch (e) { s.status(500).json({ error: e.message }); } });
app.get('/api/sets/:id/plan', (q, s) => { try {
  const p = getSetPlan(Number(q.params.id) || 0, q.query.version ? Number(q.query.version) : 0);
  if (!p) return s.status(404).json({ error: 'no plan' });
  s.json({ ...p, plan_json: JSON.parse(p.plan_json || '{}') });
} catch (e) { s.status(500).json({ error: e.message }); } });
app.post('/api/sets/import', (q, s) => { try {
  const rows = parseCampaignTSV(q.body.text || '');
  if (!rows.length) return s.status(400).json({ error: 'no rows parsed' });
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.set_no}||${r.vehicle}`;
    if (!groups.has(key)) groups.set(key, { set_no: r.set_no, vehicle: r.vehicle, codes: [] });
    if (r.code) groups.get(key).codes.push(r.code);
  }
  const created = [];
  for (const g of groups.values()) {
    const set = createSet({ name: `SET ${g.set_no} ${g.vehicle}`.trim(), code: String(g.set_no), vehicle: g.vehicle });
    const added = addSetItems(set.id, [...new Set(g.codes)]);
    created.push({ set_id: set.id, name: set.set_name, added });
  }
  s.json({ ok: true, sets: created });
} catch (e) { s.status(500).json({ error: e.message }); } });
// ---------- VEHICLE PRODUCT MAP API (WDI-sourced discovery; product/set flows untouched) ----------
const VMAP_CACHE = path.join(ROOT, 'data', 'vehicle-map-cache.json');
function readVCache() { try { return JSON.parse(fs.readFileSync(VMAP_CACHE, 'utf8')); } catch { return { brands: [], models: {}, fetched_at: {} }; } }
function writeVCache(c) { try { fs.writeFileSync(VMAP_CACHE, JSON.stringify(c, null, 2)); } catch {} }
function normWdiUrl(u) {
  try { return decodeURIComponent(String(u || '')).replace(/%3D/gi, '=').trim(); }
  catch { return String(u || '').trim(); }
}
app.get('/api/vehicle/brands', async (q, s) => { try {
  const c = readVCache();
  if (!q.query.refresh && c.brands && c.brands.length) return s.json({ brands: c.brands, cached: true, fetched_at: c.fetched_at.brands || '' });
  const brands = await collectBrands();
  c.brands = brands; c.fetched_at = { ...(c.fetched_at || {}), brands: new Date().toISOString() };
  writeVCache(c);
  s.json({ brands, cached: false });
} catch (e) { s.status(502).json({ error: 'WDI fetch failed: ' + e.message }); } });
app.get('/api/vehicle/models', async (q, s) => { try {
  const brand = clean(q.query.brand).toUpperCase();
  if (!brand) return s.status(400).json({ error: 'brand required' });
  const c = readVCache();
  if (!q.query.refresh && c.models && c.models[brand] && c.models[brand].length) {
    return s.json({ brand, models: c.models[brand], cached: true });
  }
  if (!c.brands || !c.brands.length) { c.brands = await collectBrands(); }
  const b = c.brands.find(x => x.brand === brand);
  if (!b) return s.status(404).json({ error: 'brand not on WDI' });
  const models = await collectModels(b.url);
  c.models = c.models || {}; c.models[brand] = models;
  c.fetched_at = { ...(c.fetched_at || {}), ['models_' + brand]: new Date().toISOString() };
  writeVCache(c);
  s.json({ brand, models, cached: false });
} catch (e) { s.status(502).json({ error: 'WDI fetch failed: ' + e.message }); } });
async function buildVehicleMap(brand, model, modelUrl, modelImg) {
  const wdiProducts = await collectModelProducts(modelUrl);
  const d = initDb();
  const local = d.prepare('SELECT * FROM products WHERE product_code IS NOT NULL AND product_code<>?').all('');
  const byUrl = new Map(local.map(p => [normWdiUrl(p.product_url), p]));
  const items = [];
  const linkedIds = [];
  for (const w of wdiProducts) {
    const hit = byUrl.get(normWdiUrl(w.url));
    if (hit) {
      items.push({ matched: true, code: hit.product_code, name_th: hit.product_name_th, name_en: hit.product_name_en || w.name, category: hit.category, sub: hit.sub_category, url: hit.product_url, img: hit.main_image_url || w.image_url, wdi_img: w.image_url, fitment_text: hit.fitment_text, product_id: hit.id });
      linkedIds.push(hit.id);
    } else {
      items.push({ matched: false, code: '', name_th: '', name_en: w.name, category: '', sub: '', url: w.url, img: w.image_url, wdi_img: w.image_url, fitment_text: '', product_id: 0 });
    }
  }
  const vimg = classifyVehicleImage(modelImg, brand, model);
  const ym = clean(model).match(/(\d{4}.*)$/);
  const vm = upsertVehicleModel({ brand, model, year_range: ym ? ym[1] : '', name: `${brand} ${model}`, url: modelUrl, image_url: modelImg || '', image_status: vimg.status });
  if (linkedIds.length) linkVehicleProducts(vm.id, [...new Set(linkedIds)]);
  // group (display only) + sheet status + fitment compare
  const groups = new Map();
  for (const it of items) {
    const g = guessGroup(it.name_th || it.name_en, it.category);
    if (!groups.has(g)) groups.set(g, []);
    let sheet = null;
    if (it.product_id) {
      try {
        const cur = getCurrentSheet(it.product_id);
        sheet = cur ? { version: cur.version_number, status: cur.status, confidence: cur.confidence } : null;
      } catch {}
    }
    groups.get(g).push({ ...it, side: splitSide(it.code, it.name_th || it.name_en), sheet, fit: compareFitment(it.fitment_text, brand, model) });
  }
  return {
    vehicle: { brand, model, year_range: ym ? ym[1] : '', name: `${brand} ${model}`, url: modelUrl, image: modelImg || '', image_status: vimg.status, image_reason: vimg.reason },
    total_wdi: wdiProducts.length, matched: items.filter(i => i.matched).length,
    groups: [...groups.entries()].map(([name, list]) => ({ name, count: list.length, items: list })),
    source: 'wdi', checked_at: vm.source_checked_at
  };
}
app.get('/api/vehicle/map', async (q, s) => { try {
  const brand = clean(q.query.brand).toUpperCase();
  const model = clean(q.query.model);
  if (!brand || !model) return s.status(400).json({ error: 'brand+model required' });
  const c = readVCache();
  let entry = (c.models && c.models[brand] || []).find(m => m.model === model);
  if (!entry || q.query.refresh) {
    if (!c.brands || !c.brands.length) c.brands = await collectBrands();
    const b = c.brands.find(x => x.brand === brand);
    if (!b) return s.status(404).json({ error: 'brand not on WDI' });
    const models = await collectModels(b.url);
    c.models = c.models || {}; c.models[brand] = models; writeVCache(c);
    entry = models.find(m => m.model === model);
    if (!entry) return s.status(404).json({ error: 'model not on WDI' });
  }
  const map = await buildVehicleMap(brand, model, entry.url, entry.image_url);
  c.last_map = { brand, model, at: new Date().toISOString(), total: map.total_wdi, matched: map.matched };
  writeVCache(c);
  s.json(map);
} catch (e) { s.status(502).json({ error: 'WDI fetch failed: ' + e.message }); } });
app.get('/api/vehicle/export', async (q, s) => { try {
  const brand = clean(q.query.brand).toUpperCase();
  const model = clean(q.query.model);
  if (!brand || !model) return s.status(400).json({ error: 'brand+model required' });
  const c = readVCache();
  const entry = (c.models && c.models[brand] || []).find(m => m.model === model);
  if (!entry) return s.status(404).json({ error: 'open the map first' });
  const map = await buildVehicleMap(brand, model, entry.url, entry.image_url);
  const head = ['BRAND', 'MODEL', 'MODEL_YEAR', 'VEHICLE_NAME', 'VEHICLE_URL', 'VEHICLE_IMAGE_URL', 'PRODUCT_CODE', 'PRODUCT_NAME_TH', 'PRODUCT_NAME_EN', 'PRODUCT_URL', 'PRODUCT_IMAGE_URL', 'PRODUCT_CATEGORY', 'SUB_CATEGORY', 'FITMENT_TEXT', 'FITMENT_STATUS', 'GROUP_NAME', 'GROUP_CODE', 'SIDE', 'PRODUCT_SHEET_ID', 'PRODUCT_SHEET_VERSION', 'SOURCE', 'SOURCE_LAST_CHECKED'];
  const rows = [head];
  const d = initDb();
  for (const g of map.groups) {
    for (const it of g.items) {
      let sid = '', sver = '';
      if (it.product_id) {
        try { const cur = getCurrentSheet(it.product_id); if (cur) { sid = cur.id; sver = cur.version_number; } } catch {}
      }
      rows.push([brand, model, map.vehicle.year_range, map.vehicle.name, map.vehicle.url, map.vehicle.image,
        it.code, it.name_th, it.name_en, it.url, it.img, it.category, it.sub, it.fitment_text, it.fit.status,
        g.name, '', it.side, sid, sver, 'wdi', map.checked_at]);
    }
  }
  const wb = XLSX.utils.book_new();
  wb.SheetNames.push('Vehicle Product Map');
  wb.Sheets['Vehicle Product Map'] = XLSX.utils.aoa_to_sheet(rows);
  const groups = [['GROUP_CODE', 'GROUP_NAME', 'GROUP_ORDER', 'DESCRIPTION', 'PRODUCT_CATEGORY', 'SIDE_RULE', 'DISPLAY_MODE']];
  map.groups.forEach((g, i) => groups.push(['G' + (i + 1), g.name, i + 1, g.count + ' items', '', 'LH/RH/Pair split', g.count > 50 ? 'collapsed' : 'open']));
  wb.SheetNames.push('Vehicle Map Groups');
  wb.Sheets['Vehicle Map Groups'] = XLSX.utils.aoa_to_sheet(groups);
  const fn = `Vehicle-Map_${brand}_${model.replace(/[^\w\-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const fp = path.join(ROOT, 'data', fn);
  XLSX.writeFile(wb, fp);
  s.download(fp, fn);
} catch (e) { s.status(500).json({ error: e.message }); } });
app.get('/api/vehicle/image-prompt', async (q, s) => { try {
  const brand = clean(q.query.brand).toUpperCase();
  const model = clean(q.query.model);
  if (!brand || !model) return s.status(400).json({ error: 'brand+model required' });
  const c = readVCache();
  const entry = (c.models && c.models[brand] || []).find(m => m.model === model);
  if (!entry) return s.status(404).json({ error: 'open the map first' });
  const map = await buildVehicleMap(brand, model, entry.url, entry.image_url);
  const lines = [`VEHICLE PRODUCT MAP SUMMARY IMAGE for ${brand} ${model}. CENTER: exact WDI vehicle reference${map.vehicle.image ? ' (attached)' : ' (no verified vehicle image — use neutral placeholder shape, NOT an invented car)'}.`];
  for (const g of map.groups) {
    const codes = g.items.filter(i => i.matched).map(i => i.code).filter(Boolean).slice(0, 8);
    lines.push(`AROUND-CENTER branch "${g.name}" (${g.count} products${codes.length ? ': ' + codes.join(', ') : ''}): use exact WDI product reference images only.`);
  }
  lines.push('RULES: WDI images only; exact product identity per SKU; no invented products; no mirrored LH/RH; no invented compatibility; no invented parts; no fake vehicle; no fake logos; no fake text. Labels come ONLY from: ' + map.groups.flatMap(g => g.items.filter(i => i.matched).map(i => i.code)).filter(Boolean).slice(0, 12).join(', ') + '. Products without reference images: neutral gray placeholder box, never AI-invented.');
  s.json({ ok: true, prompt: lines.join('\n') });
} catch (e) { s.status(502).json({ error: e.message }); } });
if(!process.env.VERCEL)app.listen(PORT,()=>console.log(`WDI Content Generator: http://localhost:${PORT}`));
export default app;

