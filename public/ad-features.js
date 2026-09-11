let adMode='hero', adTab='pack';
const adModes={
  hero:{label:'ภาพสินค้าเด่น',ratio:'4:5',desc:'สินค้าเป็นพระเอก ฉากพรีเมียม เรียบคม'},
  vehicle:{label:'สินค้า + รถจำลอง',ratio:'4:5',desc:'ใช้รถเป็นบริบทเท่านั้น ห้ามอ้าง fitment หาก WDI ไม่ยืนยัน'},
  detail:{label:'ซูมรายละเอียด',ratio:'1:1',desc:'เน้นเลนส์ ขอบ งานผิว และชิ้นส่วนที่มองเห็นจริง'},
  compare:{label:'เปรียบเทียบ / 2 แบบ',ratio:'1:1',desc:'จัดสองมุมหรือสองชิ้นจาก reference จริง ไม่ผสมคนละรุ่น'},
  catalog:{label:'Catalog / Feature',ratio:'4:5',desc:'สินค้าด้านหนึ่งและพื้นที่ว่างสำหรับใส่ข้อความภายหลัง'},
  social:{label:'Social / Marketplace',ratio:'4:5',desc:'ภาพพร้อมใช้บน Facebook / IG / Marketplace'}
};
// แก้ตรงนี้ที่เดียว ใช้ทั้งแพ็กโพสต์ + โปสเตอร์
const AD_CONTACT={shop:'ไฟตราเพชร',site:'wdi.co.th',fb:'ไฟตราเพชร',line:'@017cuovn',tel1:'089 177 7464',tel2:'061 409 7633'};
const POST_SCHEDULE=[
  {platform:'Facebook',icon:'📘',slots:['อังคาร–พฤหัส 12:00','ทุกวัน 19:00–21:00','เสาร์–อาทิตย์ 10:00'],note:'เพจ/กลุ่มอะไหล่ + ปักหมุด'},
  {platform:'TikTok',icon:'🎵',slots:['ทุกวัน 18:00–22:00 (พีค 19:00)'],note:'คลิป 15–25วิ + ปักตะกร้า'},
  {platform:'Instagram',icon:'📸',slots:['จันทร์–ศุกร์ 11:00','จันทร์–ศุกร์ 19:00'],note:'ภาพจัตุรัส + Reels'},
  {platform:'LINE OA',icon:'💬',slots:['อังคาร/พฤหัส 10:00','อังคาร/พฤหัส 20:00'],note:'Broadcast + ริชเมนู'},
  {platform:'Shopee',icon:'🛒',slots:['ลง/ดันสินค้า 12:00','แคมเปญ 00:00'],note:'ชื่อสินค้าใส่รหัส + สเปก'}
];
function selectAdMode(btn,mode){adMode=mode;document.querySelectorAll('.ad-nav').forEach(x=>x.classList.remove('active'));if(btn)btn.classList.add('active');if(current)openAdGenerator();}
function productForAI(){return{code:current?.['Product Code']||'',nameTH:current?.['Product Name (TH)']||'',nameEN:current?.['Product Name (EN)']||'',category:current?.Category||'',subCategory:current?.['Sub Category']||'',contextPath:current?.['Context Path']||'',descriptionTH:current?.['Description (TH)']||'',descriptionEN:current?.['Description (EN)']||'',mainImageUrl:current?.['Main Image URL']||'',productUrl:current?.['Product URL']||''};}
function specBullets(){
  const raw=[current?.['Description (TH)'],current?.['Description (EN)']].filter(Boolean).join(' ');
  const parts=raw.split(/[|;\n•·]+/).map(s=>s.trim()).filter(s=>s.length>1);
  const out=[];
  for(const p of parts){ if(out.length>=4)break; if(!out.includes(p)) out.push(p.length>46?p.slice(0,45)+'…':p); }
  if(!out.length&&current?.['Sub Category'])out.push(current['Sub Category']);
  if(!out.length&&current?.Category)out.push(current.Category);
  return out.length?out:['สินค้าแท้ WDI'];
}
function adHashtags(){
  const p=productForAI(),tags=['#DIAMOND','#WDI'];
  if(p.code)tags.push('#'+p.code.replace(/[^A-Za-z0-9ก-๏]/g,''));
  const enCat=(p.category||'').split(/[^A-Za-z]+/).filter(w=>w.length>2).slice(0,2).map(w=>'#'+w);
  tags.push(...enCat);
  tags.push('#อะไหล่รถยนต์','#ไฟตราเพชร');
  return [...new Set(tags)];
}
function buildAdCaptions(){
  const p=productForAI(),specs=specBullets(),tags=adHashtags(),tagStr=tags.join(' ');
  const title=`${p.nameTH}${p.code?` (${p.code})`:''}`;
  const cta=`สนใจทัก LINE ${AD_CONTACT.line} / โทร ${AD_CONTACT.tel1}`;
  const foot=`${AD_CONTACT.shop} | ${AD_CONTACT.site} | FB:${AD_CONTACT.fb}`;
  return {
    facebook:[`${title} ✨`,`✅ ${specs.slice(0,2).join('\n✅ ')}`,`📩 ${cta}`,`📍 ${foot}`,tagStr].filter(Boolean).join('\n'),
    tiktok:[`${title} ใส่แล้วจบ! 🔧`,`${cta}`,tagStr].filter(Boolean).join('\n'),
    instagram:[`💡 ${title}`,specs.slice(0,2).map(s=>`▫️ ${s}`).join('\n'),`📩 ${cta}`,tagStr].filter(Boolean).join('\n'),
    line:[`สวัสดีค่ะ ${AD_CONTACT.shop} 🙏`,`${title}`,...specs.slice(0,3).map(s=>`• ${s}`),``,`${cta}`].filter(Boolean).join('\n'),
    shopee:[`${title} ${p.nameEN||''}`.trim(),...specs.map(s=>`- ${s}`),`รหัส: ${p.code}`,`ร้าน ${AD_CONTACT.shop}`].filter(Boolean).join('\n'),
    hashtags:tagStr
  };
}
function buildSeoKeywords(){
  const p=productForAI(),set=new Set();
  [p.nameTH,p.nameEN,p.code,p.category,p.subCategory].filter(Boolean).forEach(t=>set.add(t.trim()));
  (p.nameTH||'').split(/\s+/).filter(w=>w.length>3).slice(0,4).forEach(w=>set.add(w));
  (p.nameEN||'').split(/\s+/).filter(w=>w.length>3).slice(0,4).forEach(w=>set.add(w));
  [p.descriptionTH,p.descriptionEN].filter(Boolean).join(' ').split(/\s+/).filter(w=>w.length>5).slice(0,4).forEach(w=>set.add(w));
  set.add('ไฟตราเพชร');set.add('WDI');set.add('DIAMOND');
  return [...set].filter(Boolean);
}
function buildN8nPayload(){
  const p=productForAI(),caps=buildAdCaptions();
  return {product_code:p.code,product_name:p.nameTH,product_name_en:p.nameEN,product_url:p.productUrl,image_url:p.mainImageUrl,
    captions:{facebook:caps.facebook,tiktok:caps.tiktok,instagram:caps.instagram,line:caps.line,shopee:caps.shopee},
    hashtags:caps.hashtags.split(' '),seo_keywords:buildSeoKeywords(),schedule:POST_SCHEDULE.map(s=>({platform:s.platform,slots:s.slots})),shop:AD_CONTACT};
}
function n8nWebhookBase(){
  try{return localStorage.getItem('wdi_n8n_wh')||'https://your-n8n/webhook/wdi-ads';}catch(e){return 'https://your-n8n/webhook/wdi-ads';}
}
function saveN8nWebhook(){const v=(document.getElementById('n8nWh')||{}).value||'';try{if(v.trim())localStorage.setItem('wdi_n8n_wh',v.trim());}catch(e){}showToast('บันทึก Webhook แล้ว ✓');}
// ---------- panel ----------
function switchAdTab(t){adTab=t;openAdGenerator();}
function openAdGenerator(){
  if(!current){showToast('เลือกสินค้าก่อน',false);return;}
  const o=$('output');
  o.innerHTML=`<section class="result ad-generator"><div class="result-head"><div><h2>โฆษณาทุกแพลตฟอร์ม</h2><small class="result-sub">${esc(current['Product Code']||'')} · ${esc(current['Product Name (TH)']||'')}</small></div></div>
  <div class="ad-actions"><button class="${adTab==='pack'?'generate':'secondary'}" onclick="switchAdTab('pack')">แคปชั่น + SEO + แผนโพสต์</button><button class="${adTab==='poster'?'generate':'secondary'}" onclick="switchAdTab('poster')">โปสเตอร์ภาพ</button></div>
  <div id="adTabBody"></div></section>`;
  if(adTab==='poster')renderAdPoster();else renderAdPack();
}
function copyAdSection(key,btn){
  const d=window.lastAdPack||{};
  const map={facebook:d.facebook,tiktok:d.tiktok,instagram:d.instagram,line:d.line,shopee:d.shopee,hashtags:d.hashtags,seo:(d.seo||[]).join(', '),schedule:scheduleText(),n8n:JSON.stringify(buildN8nPayload(),null,2)};
  copyText(map[key]||'',btn);
}
function copyAdAll(btn){
  const d=window.lastAdPack||{};
  copyText(['【FACEBOOK】\n'+d.facebook,'【TIKTOK】\n'+d.tiktok,'【INSTAGRAM】\n'+d.instagram,'【LINE】\n'+d.line,'【SHOPEE】\n'+d.shopee,'【HASHTAGS】\n'+d.hashtags,'【SEO】\n'+(d.seo||[]).join(', ')].join('\n\n---\n\n'),btn);
}
function scheduleText(){return POST_SCHEDULE.map(s=>`${s.icon} ${s.platform}\n  ${s.slots.join('\n  ')}\n  (${s.note})`).join('\n');}
function renderAdPack(){
  const caps=buildAdCaptions(),seo=buildSeoKeywords();
  window.lastAdPack={...caps,seo};
  const plats=[['facebook','📘 Facebook'],['tiktok','🎵 TikTok'],['instagram','📸 Instagram'],['line','💬 LINE'],['shopee','🛒 Shopee']];
  $('adTabBody').innerHTML=`
  <h3>แคปชั่นพร้อมโพสต์ <button class="secondary" onclick="copyAdAll(this)" style="margin-left:8px;font-size:12px">Copy ทั้งหมด</button></h3>
  <div class="platform-grid">${plats.map(([k,l])=>`<div class="box"><div class="box-title"><h3>${l}</h3><button onclick="copyAdSection('${k}',this)">Copy</button></div><div class="out">${esc(caps[k])}</div></div>`).join('')}</div>
  <div class="box"><div class="box-title"><h3># แฮชแท็ก</h3><button onclick="copyAdSection('hashtags',this)">Copy</button></div><div class="out">${esc(caps.hashtags)}</div></div>
  <h3>Keyword / SEO (ค้นหาเจอ)</h3>
  <div class="box"><div class="box-title"><h3>คำค้นแนะนำ</h3><button onclick="copyAdSection('seo',this)">Copy</button></div><div class="out">${esc(seo.join(', '))}</div><div class="tags">${seo.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>
  <h3>วันเวลาโพสต์แนะนำ (เวลาไทย)</h3>
  <div class="box"><div class="box-title"><h3>ตารางโพสต์</h3><button onclick="copyAdSection('schedule',this)">Copy</button></div><div class="out">${esc(scheduleText())}</div></div>
  <h3>AutoPost ด้วย n8n (หรือตั้งเวลาเอง)</h3>
  <div class="box"><div class="box-title"><h3>1) วาง Webhook n8n แล้ว Copy คำสั่ง</h3></div>
    <div style="display:flex;gap:6px;margin-bottom:8px"><input id="n8nWh" placeholder="https://your-n8n/webhook/wdi-ads" value="${esc(n8nWebhookBase())}" style="flex:1;min-height:38px;padding:8px 10px;border:1px solid #303744;border-radius:8px;background:#121720;color:#fff"><button class="secondary" onclick="saveN8nWebhook()">บันทึก</button></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="secondary" onclick="copyAdSection('n8n',this)">Copy JSON</button><button class="secondary" onclick="copyN8nCurl(this)">Copy cURL</button></div>
    <div class="out" style="margin-top:8px">วิธีใช้: n8n → Webhook node (POST) → ส่ง JSON นี้เข้า → แยกตาม platform → โพสต์ผ่าน Facebook/TikTok/LINE API หรือตั้ง Schedule node ตามตารางด้านบน ถ้ายังไม่มี n8n ก็ Copy แคปชั่นไปตั้งเวลาโพสต์เองได้เลย</div></div>`;
}
function copyN8nCurl(btn){
  const url=n8nWebhookBase();
  copyText(`curl -X POST "${url}" -H "Content-Type: application/json" -d '${JSON.stringify(buildN8nPayload()).replace(/'/g,"'\\''")}'`,btn);
}
// ---------- poster tab ----------
function buildAdPrompt(mode=adMode){
  const m=adModes[mode]||adModes.hero,p=productForAI();
  const specs=specBullets().join(' / ');
  return `Thai automotive sales poster, 4:5 vertical, for ONE exact WDI / DIAMOND product.\n\nMODE: ${m.label} - ${m.desc}\n\nLAYOUT:\n1. Top-left yellow oval badge, blue "Diamond" text.\n2. Bold headline: "${p.nameTH}"${p.nameEN&&p.nameEN!==p.nameTH?` (${p.nameEN})`:''}.\n3. Center hero: exact product photo (code ${p.code}) on light panel. Specs: ${specs}.\n4. Gold badge bar: "${p.code}".\n5. Spec callouts: ${specs}.\n6. Bottom navy strip: "${AD_CONTACT.shop}" | ${AD_CONTACT.site} | FB ${AD_CONTACT.fb} | LINE ${AD_CONTACT.line} | ${AD_CONTACT.tel1} / ${AD_CONTACT.tel2}.\n7. Dark navy studio + gold light streaks.\n\nPRODUCT DATA:\n${JSON.stringify(p,null,2)}\n\nPRODUCT LOCK: exact silhouette, proportions, lens, housing, bezel, connector, color, material, finish, markings. No redesign, mirror, recolor, invented sides. WDI image is source of truth.\n\nNEGATIVE: wrong product, changed geometry, duplicate, extra parts, random vehicle, fake logo, deformation, cartoon, surreal, excessive VFX.`;
}
function showProductReference(){if(!current)return;const img=current['Main Image URL'];if(!img)return showToast('สินค้านี้ไม่มีรูป WDI',false);const w=window.open();if(w){w.document.write(`<title>WDI Reference ${esc(current['Product Code'])}</title><body style="margin:0;background:#111;display:grid;place-items:center"><img src="${esc(imageUrl(img))}" style="max-width:95vw;max-height:95vh;object-fit:contain"></body>`);w.document.close();}}
function renderAdPoster(){
  const m=adModes[adMode],prompt=buildAdPrompt();
  $('adTabBody').innerHTML=`
  <div class="ad-nav-row" style="margin-bottom:8px">${Object.entries(adModes).map(([k,v])=>`<button class="ad-nav ${k===adMode?'active':''}" onclick="selectAdMode(this,'${k}')">${esc(v.label)}</button>`).join('')}</div>
  <div class="ad-actions"><button class="generate" onclick="askGeneratePreview()">สร้างโปสเตอร์ฟรี</button><button class="secondary" onclick="generateAiPreview()">เจนด้วย AI</button><button class="secondary" onclick="copyText(buildAdPrompt(),this)">Copy Prompt</button><button class="secondary" onclick="showProductReference()">Reference</button></div>
  <div class="prompt-card"><div class="prompt-head"><b>AI IMAGE PROMPT (โปสเตอร์ + สินค้าจริง + ท้ายร้าน)</b><button onclick="copyText(buildAdPrompt(),this)">Copy</button></div><pre>${esc(prompt)}</pre></div>
  <div id="adPreviewArea" class="ad-preview-area"><div class="preview-placeholder">กด “สร้างโปสเตอร์ฟรี” ได้โปสเตอร์จากรูป WDI จริง + สเปก + ท้ายร้านทันที<br><small>ข้อความไทยชัด 100% ไม่ต้องรอ AI</small></div></div>`;
}
function scrollToPreview(){const a=$('adPreviewArea');if(a)a.scrollIntoView({behavior:'smooth',block:'center'});}
function askGeneratePreview(){if(!current){showToast('เลือกสินค้าก่อน',false);return;}generateLocalAdPreview();}
function fitFont(ctx,text,maxW,base,family){let s=base;ctx.font=`800 ${s}px ${family}`;while(s>14&&ctx.measureText(text).width>maxW){s-=2;ctx.font=`800 ${s}px ${family}`;}return s;}
function drawDiamondBadge(ctx,x,y,w,h){
  ctx.save();
  ctx.fillStyle='#2e3d97';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ffdd00';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2-7,h/2-7,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2e3d97';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=`900 ${Math.round(h*0.34)}px Arial`;ctx.fillText('Diamond',x+w/2,y+h/2+2);
  ctx.restore();
}
function drawAdCanvas(ctx,c,im){
  const W=c.width,H=c.height;
  const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#0a1230');bg.addColorStop(0.55,'#0d1a4a');bg.addColorStop(1,'#070b1d');
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.strokeStyle='#ffdd00';ctx.lineWidth=10;ctx.globalAlpha=0.85;
  ctx.beginPath();ctx.moveTo(0,190);ctx.lineTo(W,40);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,240);ctx.lineTo(W,90);ctx.stroke();ctx.restore();
  drawDiamondBadge(ctx,45,35,300,120);
  ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='alphabetic';
  const title=current['Product Name (TH)']||current['Product Name (EN)']||'PRODUCT';
  fitFont(ctx,title.slice(0,40),W-390,64,'Arial');
  ctx.fillText(title.slice(0,40),370,95);
  ctx.fillStyle='#ffdd00';ctx.font='700 30px Arial';
  const en=(current['Product Name (EN)']||'').slice(0,44);
  if(en)ctx.fillText(en,372,135);
  const boxX=60,boxY=185,boxW=W-120,boxH=560;
  ctx.fillStyle='#f4f4f1';ctx.fillRect(boxX,boxY,boxW,boxH);
  ctx.strokeStyle='#ffdd00';ctx.lineWidth=6;ctx.strokeRect(boxX,boxY,boxW,boxH);
  if(im&&im.width){const r=Math.min((boxW-60)/im.width,(boxH-60)/im.height),iw=im.width*r,ih=im.height*r;ctx.drawImage(im,boxX+(boxW-iw)/2,boxY+(boxH-ih)/2,iw,ih);}
  else{ctx.fillStyle='#66707e';ctx.font='32px Arial';ctx.textAlign='center';ctx.fillText(im===undefined?'กำลังโหลดรูปสินค้า...':'ไม่มีรูปสินค้า',boxX+boxW/2,boxY+boxH/2);ctx.textAlign='left';}
  ctx.fillStyle='#ffdd00';ctx.fillRect(boxX,boxY+boxH-64,boxW,64);
  ctx.fillStyle='#1a1a1a';ctx.font='900 38px Arial';ctx.textAlign='center';
  ctx.fillText(current['Product Code']||'',boxX+boxW/2,boxY+boxH-16);ctx.textAlign='left';
  const specs=specBullets();let sy=boxY+boxH+70;
  ctx.font='700 32px Arial';
  specs.forEach(sp=>{ctx.fillStyle='#ffdd00';ctx.beginPath();ctx.arc(90,sy-10,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(sp,120,sy);sy+=52;});
  const fy=H-118;
  ctx.fillStyle='#0a1030';ctx.fillRect(0,fy,W,118);
  ctx.fillStyle='#ffdd00';ctx.fillRect(0,fy,W,5);
  drawDiamondBadge(ctx,30,fy+18,150,62);
  ctx.fillStyle='#fff';ctx.font='700 26px Arial';
  const foot=`${AD_CONTACT.shop}  |  ${AD_CONTACT.site}  |  FB: ${AD_CONTACT.fb}  |  LINE: ${AD_CONTACT.line}`;
  fitFont(ctx,foot,W-230,26,'Arial');ctx.fillText(foot,200,fy+52);
  ctx.fillStyle='#ffdd00';ctx.font='900 30px Arial';
  ctx.fillText(`${AD_CONTACT.tel1} / ${AD_CONTACT.tel2}`,200,fy+92);
}
function generateLocalAdPreview(){
  const area=$('adPreviewArea');if(!area||!current)return;
  area.innerHTML='<canvas id="adCanvas" width="1080" height="1350"></canvas><div class="preview-tools"><button class="generate" onclick="downloadAdPreview()">ดาวน์โหลดโปสเตอร์ PNG</button><span>โปสเตอร์จากรูป WDI จริง + สเปกจริง + ท้ายร้าน</span></div>';
  const c=$('adCanvas'),ctx=c.getContext('2d');
  drawAdCanvas(ctx,c,undefined);
  scrollToPreview();showToast('กำลังสร้างโปสเตอร์... (โครงขึ้นแล้ว กำลังใส่รูปสินค้า)');
  const done=img=>{drawAdCanvas(ctx,c,img||null);showToast(img?'สร้างโปสเตอร์เสร็จ ✓':'รูป WDI โหลดไม่ได้ ใช้โปสเตอร์แบบไม่มีรูป',!!img);scrollToPreview();};
  const img=new Image();img.crossOrigin='anonymous';
  img.onload=()=>done(img);
  img.onerror=()=>{const d=directImageUrl(current['Main Image URL']);if(d&&img.src!==d){img.src=d;}else done(null);};
  img.src=imageUrl(current['Main Image URL'])||directImageUrl(current['Main Image URL']);
  if(!img.src)done(null);
}
function downloadAdPreview(){const c=$('adCanvas');if(!c){showToast('ยังไม่มีโปสเตอร์ให้โหลด',false);return;}const a=document.createElement('a');a.download=`DIAMOND-${current?.['Product Code']||'ad'}-poster.png`;a.href=c.toDataURL('image/png');a.click();showToast('ดาวน์โหลดโปสเตอร์แล้ว ✓');}
async function generateAiPreview(){
  if(!current)return;const area=$('adPreviewArea');if(!area)return;
  const t0=Date.now();
  area.innerHTML='<div class="loading">กำลังเจนภาพด้วย AI (Pollinations ฟรี)... <span id="aiSecs">0วิ</span></div>';scrollToPreview();showToast('เริ่มเจนภาพ AI แล้ว รอ ~10-30วิ');
  const timer=setInterval(()=>{const el=$('aiSecs');if(el)el.textContent=Math.round((Date.now()-t0)/1000)+'วิ';},1000);
  try{const r=await fetch('/api/image-generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:buildAdPrompt(),product:productForAI(),mode:adMode})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'AI image generation unavailable');
  clearInterval(timer);
  const secs=Math.round((Date.now()-t0)/1000);
  area.innerHTML=`<div class="ai-status">AI เจนเสร็จใน ${secs}วิ ✓ (Pollinations FLUX ฟรี)</div><div class="ai-preview"><img src="data:${d.mime};base64,${d.data}" alt="AI preview"><div class="preview-tools"><button class="generate" onclick="downloadAiPreview()">ดาวน์โหลด AI Preview</button><button class="secondary" onclick="generateLocalAdPreview()">ใช้โปสเตอร์ WDI จริง</button></div></div>`;window.lastAiPreview={mime:d.mime,data:d.data};
  showToast(`เจนภาพ AI เสร็จใน ${secs}วิ ✓`);scrollToPreview();
  }catch(e){clearInterval(timer);area.innerHTML=`<div class="preview-placeholder"><b>AI Generate ยังใช้งานไม่ได้</b><br>${esc(e.message)}<br><br><button class="generate" onclick="generateLocalAdPreview()">ใช้โปสเตอร์ WDI จริงแทน</button></div>`;showToast('เจน AI ไม่สำเร็จ: '+e.message,false);scrollToPreview();}
}
function downloadAiPreview(){const d=window.lastAiPreview;if(!d)return;const a=document.createElement('a');a.download=`DIAMOND-${current?.['Product Code']||'ai'}.jpg`;a.href=`data:${d.mime};base64,${d.data}`;a.click();}
