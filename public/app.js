let current=null,items=[],templates=[],selectedTemplate=0;
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageUrl=u=>u?u.replace('co.th../','co.th/'):'';
async function boot(){try{const [m,t]=await Promise.all([fetch('/api/meta').then(r=>r.json()),fetch('/api/templates').then(r=>r.json())]);
$('category').innerHTML='<option value="">ทุกหมวดหมู่</option>'+m.categories.map(x=>`<option>${esc(x)}</option>`).join('');$('brand').innerHTML='<option value="">ทุกยี่ห้อรถ</option>'+m.brands.map(x=>`<option>${esc(x)}</option>`).join('');$('model').innerHTML='<option value="">ทุกรุ่นรถ</option>'+m.models.map(x=>`<option>${esc(x)}</option>`).join('');templates=t;$('templateCount').textContent=`${t.length} แบบ`;renderTemplates();await loadProducts();const h=await fetch('/api/health').then(r=>r.json());$('health').textContent=`● Online · ${h.products} products · ${h.templates} video series`;}catch(e){$('health').textContent='● เชื่อมต่อไม่ได้'}}
async function loadProducts(){const p=new URLSearchParams({q:$('search').value,category:$('category').value,brand:$('brand').value,model:$('model').value});items=await fetch('/api/products?'+p).then(r=>r.json());$('count').textContent=`${items.length} รายการ`;$('products').innerHTML=items.map((x,i)=>`<button class="item" onclick="selectProduct(${i})"><span class="code">${esc(x['Product Code']||'-')}</span><span>${esc(x['Product Name (TH)']||x['Product Name (EN)']||'-')}</span><small>${esc(x.Category||'')} · ${esc(x['Car Brand']||'-')} · ${esc(x['Car Model']||'-')}</small></button>`).join('')||'<div class="empty small">ไม่พบสินค้า</div>'}
function selectProduct(i){current=items[i];$('detail').innerHTML=`<div class="product-head"><div><div class="eyebrow">${esc(current.Category)} / ${esc(current['Sub Category'])}</div><h1>${esc(current['Product Name (TH)']||'-')}</h1><div class="code-big">${esc(current['Product Code']||'ไม่มีรหัส')}</div></div><button class="secondary" onclick="copyProduct()">คัดลอก</button></div><div class="context">📍 ${esc(current['Car Brand']||'ไม่ระบุ')} ${esc(current['Car Model']||'')}<br><small>Context: ${esc(current['Context Path']||current.Category||'')}</small></div><div class="product-layout">${current['Main Image URL']?`<img class="product-img" src="${esc(imageUrl(current['Main Image URL']))}" onerror="this.style.display='none'">`:''}<div class="facts"><h3>ข้อมูลจริงจาก WDI</h3><p>${esc(current['Description (TH)']||'-')}</p><p class="en">${esc(current['Description (EN)']||'')}</p><a target="_blank" href="${esc(current['Product URL']||'#')}">เปิดหน้าสินค้า ↗</a></div></div><div class="selected-series">🎬 <b>Series:</b> ${esc(templates[selectedTemplate]?.name||'')}</div><button class="generate" onclick="generate()">✨ สร้าง Content Pack + Google Flow Prompts</button><div id="output"></div>`}
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
