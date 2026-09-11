let current=null,items=[],templates=[],selectedTemplate=0,totalItems=0,selectedIndex=-1;
const PAGE=100;
let searchTimer=null;
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const directImageUrl=u=>String(u||'').replace('co.th../','co.th/');
const imageUrl=u=>{const d=directImageUrl(u);return d?('/api/wdi/image?url='+encodeURIComponent(d)):'';};
async function boot(){try{const [m,t]=await Promise.all([fetch('/api/meta').then(r=>r.json()),fetch('/api/templates').then(r=>r.json())]);
$('category').innerHTML='<option value="">ทุกหมวดหมู่</option>'+m.categories.map(x=>`<option>${esc(x)}</option>`).join('');
if(m.brands&&m.brands.length){$('brand').innerHTML='<option value="">ทุกยี่ห้อรถ</option>'+m.brands.map(x=>`<option>${esc(x)}</option>`).join('');}else{$('brand').style.display='none';}
if(m.models&&m.models.length){$('model').innerHTML='<option value="">ทุกรุ่นรถ</option>'+m.models.map(x=>`<option>${esc(x)}</option>`).join('');}else{$('model').style.display='none';}
templates=t;$('templateCount').textContent=`${t.length} แบบ`;renderTemplates();
$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadProducts(),350);});
await loadProducts();const h=await fetch('/api/health').then(r=>r.json());$('health').textContent=`● Online · ${h.products} products · ${h.templates} video series`;}catch(e){$('health').textContent='● เชื่อมต่อไม่ได้'}}
function productLabel(x){return `<span class="code">${esc(x['Product Code']||'-')}</span><span>${esc(x['Product Name (TH)']||x['Product Name (EN)']||'-')}</span><small>${esc(x.Category||x['Context Path']||'')}</small>`;}
function renderProductList(){
  $('count').textContent=`แสดง ${items.length} จาก ${totalItems} รายการ`;
  let html=items.map((x,i)=>`<button class="item${i===selectedIndex?' active':''}" onclick="selectProduct(${i},this)">${productLabel(x)}</button>`).join('')||'<div class="empty small">ไม่พบสินค้า</div>';
  if(items.length<totalItems) html+=`<button class="item load-more" onclick="loadMore()">แสดงเพิ่ม (${totalItems-items.length} เหลือ) ↓</button>`;
  $('products').innerHTML=html;
}
async function loadProducts(){selectedIndex=-1;const p=new URLSearchParams({q:$('search').value,category:$('category').value,brand:$('brand').value,model:$('model').value,limit:PAGE,offset:0});const d=await fetch('/api/products?'+p).then(r=>r.json());const list=Array.isArray(d)?d:(d.products||[]);totalItems=Array.isArray(d)?list.length:(d.total||list.length);items=list;renderProductList();}
async function loadMore(){const p=new URLSearchParams({q:$('search').value,category:$('category').value,brand:$('brand').value,model:$('model').value,limit:PAGE,offset:items.length});const d=await fetch('/api/products?'+p).then(r=>r.json());const list=Array.isArray(d)?d:(d.products||[]);if(Array.isArray(d))totalItems=items.length+list.length;else totalItems=d.total||totalItems;items=items.concat(list);renderProductList();}
async function syncWdi(){showToast('กำลัง Sync WDI...');try{const r=await fetch('/api/wdi/sync',{method:'POST'}),d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'sync failed');showToast(`Sync WDI สำเร็จ ${d.total} สินค้า ✓`);await loadProducts()}catch(e){showToast(e.message||'Sync ไม่สำเร็จ',false)}}
function marketplaceFacts(p){const fitBrands=p['Fitment Brands']||'';const fitModels=p['Fitment Models']||'';const fitContexts=p['Fitment Contexts']||'';const evidence=p['Fitment Evidence']||'';return {code:p['Product Code']||'',nameTH:p['Product Name (TH)']||'',nameEN:p['Product Name (EN)']||'',category:p.Category||'',subCategory:p['Sub Category']||'',descriptionTH:p['Description (TH)']||'',descriptionEN:p['Description (EN)']||'',fitmentBrands:fitBrands,fitmentModels:fitModels,fitmentContexts:fitContexts,fitmentEvidence:evidence,sourceUrl:p['Product URL']||'',mainImage:p['Main Image URL']||'',additionalImages:p['Additional Images']||''};}
function buildLocalMarketplace(p){const f=marketplaceFacts(p);const lock='Use the supplied WDI/DIAMOND product reference as the visual source of truth. Preserve exact silhouette, proportions, lens, housing, bezel, reflector, connector, wire count, mounting points, screws/clips, materials, colors, finish and visible markings. Do not redesign, beautify, mirror, recolor, merge variants, add unseen components, or invent technical features. Never infer fitment from appearance.';const brand='BRAND IDENTITY: DIAMOND / ไฟตราเพชร. Use the supplied DIAMOND logo asset exactly; do not redraw, distort, recolor, replace or invent a logo.';const fit=f.fitmentModels||f.fitmentBrands||f.fitmentContexts?'VERIFIED WDI FITMENT NAVIGATION: '+[f.fitmentBrands,f.fitmentModels,f.fitmentContexts].filter(Boolean).join(' | '):'NO VERIFIED FITMENT PROVIDED: do not show a vehicle or compatibility claim.';const base='Create a premium high-end automotive aftermarket product advertisement for WDI / DIAMOND. '+brand+' '+fit+' PRODUCT: '+JSON.stringify(f)+' '+lock;const negative='wrong product, changed geometry, wrong lens, wrong connector, wrong wire count, invented fitment, random vehicle, merged variants, extra parts, fake logo, fake Thai text, misspelled product code, fake specifications, price, phone, QR, watermark, deformation, duplicate product, cartoon, surreal, excessive VFX';return {prompts:{hero:base+' HERO 4:5: luxury automotive advertising, product-dominant composition, premium midnight navy background, electric blue rim light, metallic silver and gold accents, cinematic three-point lighting, realistic reflections, clean negative space for text added later.',detail:base+' DETAIL 1:1: macro catalog photography, 3-4 visual detail zones for only visible components such as lens, housing, connector, reflector, mounting points; technical callout lines may be added in post-production, no invented details.',context:base+' CONTEXT 4:5: show the product in a realistic automotive environment; show a vehicle ONLY when verified WDI fitment is present, and use only the verified brand/model/year context; otherwise use a neutral premium workshop with no vehicle compatibility claim.',catalog:base+' CATALOG 4:5: product hero on one side, structured navy/gold information-panel space on the other, premium automotive catalog design, leave all critical text for post-production.',social:base+' SOCIAL / MARKETPLACE 4:5: immediate product recognition, strong hero product, clean premium DIAMOND visual identity, restrained blue/gold accents, mobile-first hierarchy, leave readable text areas for post-production.'},negative_prompt:negative,brand_rules:'DIAMOND / ไฟตราเพชร visual identity: midnight navy, electric blue, metallic silver, diamond yellow/gold, premium automotive advertising; exact logo asset only.',source_facts:[f.code,f.nameTH,f.category,f.subCategory,f.fitmentModels,f.fitmentContexts].filter(Boolean).join(' | ')};}
function downloadMarketplacePrompts(){if(!window.lastMarketplace)return;const names=[['hero','Hero 4:5'],['detail','Detail 1:1'],['context','Context 4:5'],['catalog','Catalog 4:5'],['social','Social 4:5']];const text=names.map(([k,l])=>'### '+l+'\n'+(window.lastMarketplace.prompts?.[k]||'')).join('\n\n')+'\n\n### Negative Prompt\n'+(window.lastMarketplace.negative_prompt||'')+'\n\n### Source Facts\n'+(window.lastMarketplace.source_facts||'');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));a.download='DIAMOND-'+(current?.['Product Code']||'Marketplace-Prompts')+'-Pro.txt';a.click();URL.revokeObjectURL(a.href);showToast('ดาวน์โหลด Prompt Pack แล้ว ✓');}

async function enhanceMarketplace(btn){if(!current)return;const t0=Date.now();if(btn){btn.disabled=true;btn.textContent='AI กำลังปรับ...';}try{const r=await fetch('/api/generate-marketplace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:current})});const d=await r.json();if(d.error||d.raw)throw new Error(d.error||'AI คืนรูปไม่ครบ');window.lastMarketplace=d;generateMarketplaceRenderAI(d,Math.round((Date.now()-t0)/1000));}catch(e){showToast('AI Enhance ไม่สำเร็จ: '+e.message+' — ใช้เวอร์ชัน template ได้เลย',false);}finally{if(btn){btn.disabled=false;btn.textContent='AI Enhance';}}}
function generateMarketplaceRenderAI(d,secs){const names=[['hero','Hero 4:5'],['detail','Detail 1:1'],['context','Context'],['catalog','Catalog'],['social','Social']];window.lastMarketplace=d;const o=$('output');o.innerHTML=`<section class="result"><div class="result-head"><div><h2>Marketplace Prompts (AI)</h2><small class="result-sub">AI ปรับแล้วใน ${secs}วิ</small></div></div>`+names.map(([k,l])=>`<div class="box"><div class="box-title"><h3>${l}</h3><button onclick="copyText(window.lastMarketplace.prompts['${k}'],this)">Copy</button></div><div class="out">${esc((d.prompts||{})[k]||'')}</div></div>`).join('')+`</section>`;}
function selectProduct(i,btn){current=items[i];window.current=current;window.selectedProductForUx=current;selectedIndex=i;document.querySelectorAll('#products .item').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');$('detail').innerHTML=`<div class="product-head"><div><div class="eyebrow">${esc(current.Category)} / ${esc(current['Sub Category'])}</div><h1>${esc(current['Product Name (TH)']||'-')}</h1><div class="code-big">${esc(current['Product Code']||'ไม่มีรหัส')}</div></div><button class="secondary" onclick="copyProduct()">คัดลอก</button></div><div class="context">📍 ${esc(current['Car Brand']||'ไม่ระบุ')} ${esc(current['Car Model']||'')}<br><small>Context: ${esc(current['Context Path']||current.Category||'')}</small></div><div class="product-layout">${current['Main Image URL']?`<img class="product-img" loading="lazy" src="${esc(imageUrl(current['Main Image URL']))}" data-direct="${esc(directImageUrl(current['Main Image URL']))}" onerror="if(this.dataset.direct&&this.src!==this.dataset.direct){this.src=this.dataset.direct;}else{this.outerHTML='<div class=image-missing>ไม่มีรูปสินค้า</div>';}">`:''}<div class="facts"><h3>ข้อมูลจริงจาก WDI</h3><p>${esc(current['Description (TH)']||'-')}</p><p class="en">${esc(current['Description (EN)']||'')}</p><a target="_blank" href="${esc(current['Product URL']||'#')}">เปิดหน้าสินค้า ↗</a></div></div><div class="selected-series">🎬 <b>Series:</b> ${esc(templates[selectedTemplate]?.name||'')}</div><div class="action-row"><button class="generate" onclick="generate()">✨ สร้าง Content Pack + Google Flow</button><button class="secondary" onclick="generateMarketplace()">🛒 Marketplace Prompts</button><button class="secondary" onclick="openAdGenerator()">📣 โฆษณาทุกแพลตฟอร์ม</button></div><div id="output"></div>`}
function renderTemplates(){$('templates').innerHTML=templates.map((t,i)=>`<button class="template ${i===selectedTemplate?'active':''}" onclick="selectTemplate(${i})"><b>${esc(t.name)}</b><small>${esc(t.duration)} · ${esc(t.type)}</small><span>${esc(t.hook)}</span></button>`).join('')}
function selectTemplate(i){selectedTemplate=i;renderTemplates();if(current)selectProduct(items.indexOf(current))}
function showToast(msg, ok=true){
  let t=document.getElementById('toast');
  if(!t){ t=document.createElement('div'); t.id='toast'; t.style.cssText='position:fixed;right:18px;bottom:18px;z-index:99;padding:12px 16px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.4);transition:opacity .25s'; document.body.appendChild(t); }
  t.textContent=msg; t.style.background= ok ? '#1f7a4a' : '#8b2c2c'; t.style.color='#fff'; t.style.opacity='1';
  clearTimeout(t._hide); t._hide=setTimeout(()=> t.style.opacity='0', 1800);
}
async function copyWithFallback(text){
  const v = String(text ?? '');
  if(!v || v==='-'){ showToast('ไม่มีข้อความให้คัดลอก', false); return false; }
  try{
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(v);
    } else throw new Error('no clipboard');
  }catch(e){
    try{
      const ta=document.createElement('textarea'); ta.value=v; ta.setAttribute('readonly',''); ta.style.cssText='position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999);
      const ok=document.execCommand('copy'); document.body.removeChild(ta);
      if(!ok) throw new Error('execCommand failed');
    }catch(e2){
      showToast('คัดลอกไม่สำเร็จ: '+ (e2.message||''), false);
      // last resort: show text for manual copy
      prompt('คัดลอกด้วย Ctrl+C แล้ว Enter:', v);
      return false;
    }
  }
  return true;
}
async function copyProduct(){
  const ok=await copyWithFallback(JSON.stringify(current,null,2));
  if(ok) showToast('คัดลอกข้อมูลสินค้าแล้ว ✓');
}
async function copyText(x, btn){
  const ok=await copyWithFallback(x);
  if(!ok) return;
  showToast('คัดลอกแล้ว ✓');
  if(btn){ const orig=btn.textContent; btn.textContent='คัดลอกแล้ว ✓'; btn.disabled=true; setTimeout(()=>{btn.textContent=orig; btn.disabled=false;},1600); }
}
async function copyFlow(i, btn){
  const v = window.lastOutput?.scenes?.[i]?.flow_prompt || '';
  await copyText(v, btn);
}
async function copyField(field, btn){
  let v = window.lastOutput?.[field];
  if(Array.isArray(v)) v=v.join('\n');
  await copyText(v||'', btn);
}
async function copyPlatform(platform, btn){
  const v = window.lastOutput?.platform_captions?.[platform] || window.lastOutput?.platformCaptions?.[platform] || '';
  if(!v){ // fallback: build from caption+hashtags+cta
    const fallback = [window.lastOutput?.caption||'', (window.lastOutput?.hashtags||[]).join(' '), window.lastOutput?.cta||''].filter(Boolean).join('\n\n');
    await copyText(fallback, btn); return;
  }
  await copyText(v, btn);
}
function buildPlatformFallback(){
  const h=(window.lastOutput?.hashtags||[]).join(' ');
  const cap=window.lastOutput?.caption||''; const cta=window.lastOutput?.cta||'';
  if(!cap && !h && !cta) return null;
  return { facebook: [cap, cta, h].filter(Boolean).join('\n\n'), tiktok: [cap.split('\n')[0]||cap, h].filter(Boolean).join('\n'), instagram: [cap, h].filter(Boolean).join('\n\n'), line: [cap, cta].filter(Boolean).join('\n'), shopee: [cap, cta].filter(Boolean).join('\n') };
}
async function generate(){if(!current)return;const o=$('output');o.innerHTML='<div class="loading">กำลังสร้าง Content Pack จากข้อมูลสินค้า + Context + Template...</div>';const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:current,templateId:selectedTemplate})});const d=await r.json();if(d.error){o.innerHTML=`<div class="error">${esc(d.error)}</div>`;return}if(d.raw){o.innerHTML=`<section class="result"><div class="result-head"><h2>Content Pack</h2><button class="secondary" onclick="downloadJSON()">Export JSON</button></div><pre>${esc(d.raw)}</pre><div style="margin-top:10px"><button class="secondary" onclick="copyText(document.querySelector('.result pre').textContent, this)">Copy Raw</button></div></section>`; window.lastOutput={raw:d.raw}; return}window.lastOutput=d;
  const pc = d.platform_captions || d.platformCaptions || buildPlatformFallback();
  const platformOrder = [
    {key:'facebook', label:'Facebook', icon:'📘'},
    {key:'tiktok', label:'TikTok', icon:'🎵'},
    {key:'instagram', label:'Instagram', icon:'📸'},
    {key:'line', label:'LINE', icon:'💬'},
    {key:'shopee', label:'Shopee', icon:'🛒'}
  ];
  const platformHtml = pc ? `<h3>📱 แคปชั่นพร้อมโพสต์ (ก๊อปไปวางได้เลย)</h3><div class="platform-grid">${platformOrder.map(p=> pc[p.key] ? `<div class="box platform-box"><div class="box-title"><h3>${p.icon} ${p.label}</h3><button onclick="copyPlatform('${p.key}', this)">Copy</button></div><div class="out">${esc(pc[p.key])}</div></div>` : '').join('')}</div><div style="margin-top:8px"><button class="secondary" onclick="copyPlatform('facebook', this)" style="margin-right:6px">Copy Facebook ทั้งชุด</button><button class="secondary" onclick="copyText(Object.entries(pc).map(([k,v])=> '【'+k.toUpperCase()+'】\\n'+v).join('\\n\\n---\\n\\n'), this)">Copy ทั้งหมด</button></div>` : '';
  o.innerHTML=`<section class="result"><div class="result-head"><h2>Content Pack</h2><button class="secondary" onclick="downloadJSON()">Export JSON</button></div>${box('Hook',d.hook,'hook')}${box('Script',d.script,'script')}${box('Voice Over',d.voiceover,'voiceover')}<h3>🎬 Scenes / Google Flow</h3>${(d.scenes||[]).map((s,i)=>`<div class="scene"><div class="scene-top"><b>${esc(s.time||`Scene ${i+1}`)}</b><button onclick="copyFlow(${i}, this)">Copy Flow</button></div><p>${esc(s.visual||'')}</p>${s.overlay?`<div class="overlay">Overlay: ${esc(s.overlay)}</div>`:''}<pre>${esc(s.flow_prompt||'')}</pre></div>`).join('')}${box('Image-to-Video Prompt',d.image_to_video_prompt,'image_to_video_prompt')}${box('Caption (รวม)',d.caption,'caption')}${box('CTA',d.cta,'cta')}<div class="tags">${(d.hashtags||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>${platformHtml}${box('Source Facts',Array.isArray(d.source_facts)?d.source_facts.join('\n'):d.source_facts,'source_facts')}${box('Warnings',Array.isArray(d.warnings)?d.warnings.join('\n'):d.warnings,'warnings')}</section>`}
function box(t,v,field){return `<div class="box"><div class="box-title"><h3>${esc(t)}</h3><button onclick="copyField('${field}', this)">Copy</button></div><div class="out">${esc(v||'-')}</div></div>`}function downloadJSON(){const b=new Blob([JSON.stringify({product:current,template:templates[selectedTemplate],output:window.lastOutput},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`WDI-${current['Product Code']||'product'}-content-pack.json`;a.click();URL.revokeObjectURL(a.href)}boot();

function marketCard(k,l,v){return '<div class="box"><div class="box-title"><h3>'+l+'</h3><button onclick="copyText(window.lastMarketplace.prompts.'+k+',this)">Copy</button></div><div class="out">'+esc(v||'')+'</div></div>';}
async function generateMarketplace(){if(!current)return;const o=$('output');const d=buildLocalMarketplace(current);window.lastMarketplace=d;const names=[['hero','Hero 4:5'],['detail','Detail 1:1'],['context','Context 4:5'],['catalog','Catalog 4:5'],['social','Social 4:5']];const all=()=>names.map(([k,l])=>'### '+l+'\n'+(window.lastMarketplace.prompts?.[k]||'')).join('\n\n')+'\n\n### Negative Prompt\n'+(window.lastMarketplace.negative_prompt||'');const cards=names.map(([k,l])=>marketCard(k,l,d.prompts?.[k])).join('');o.innerHTML=`<section class="result"><div class="result-head"><div><h2>Marketplace Prompts · DIAMOND Pro</h2><small class="result-sub">Universal image prompt pack · WDI Fitment-aware · พร้อม Copy / Download / Share</small></div><button class="secondary" onclick="enhanceMarketplace(this)">AI Enhance</button></div><div class="prompt-toolbar"><button class="generate" onclick="copyText(window.lastMarketplace.prompts.hero,this)">Copy Hero</button><button class="secondary" onclick="copyText(window.lastMarketplace.prompts.context,this)">Copy Context</button><button class="secondary" onclick="copyText(window._marketplaceAll(),this)">Copy All</button><button class="secondary" onclick="downloadMarketplacePrompts()">Download .txt</button></div>${cards}<div class="box"><div class="box-title"><h3>Negative Prompt</h3><button onclick="copyText(window.lastMarketplace.negative_prompt,this)">Copy</button></div><div class="out">${esc(d.negative_prompt||'')}</div></div><div class="box"><div class="box-title"><h3>Source / Fitment Facts</h3><button onclick="copyText(window.lastMarketplace.source_facts||'',this)">Copy</button></div><div class="out">${esc(d.source_facts||'-')}</div></div></section>`;window._marketplaceAll=all;showToast('Marketplace Pro Prompt Pack พร้อมใช้ ✓');}
