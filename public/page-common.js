// page-common.js — SHARED UTILS SOURCE OF TRUTH for standalone sub-pages
// (set/map/image/dist/pub). Loaded WITHOUT app.js, so it carries its own
// minimal copies of $, esc, imageUrl, showToast, sheet drawer and context.
// app.js keeps its own copies for index.html only. Never load both on one page.
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const directImageUrl=u=>String(u||'').replace('co.th../','co.th/');
const imageUrl=u=>{const d=directImageUrl(u);return d?('/api/wdi/image?url='+encodeURIComponent(d)):''};
const copyText=async(t,b)=>{try{await navigator.clipboard.writeText(String(t||''));showToast('คัดลอกแล้ว ✓')}catch{showToast('คัดลอกไม่สำเร็จ',false)}};
function showToast(msg,ok=true){const t=$('toast');if(!t)return;t.textContent=msg;t.style.background=ok?'#1a5c38':'#5c1a1a';t.style.color='#fff';t.style.opacity='1';t.style.pointerEvents='auto';clearTimeout(t._hide);t._hide=setTimeout(()=>{t.style.opacity='0';t.style.pointerEvents='none'},2200)}
window.selectedCatCode='';window.selectedV='V06';window.selectedDur='30s';window.selectedFlowModel='gemini-omni-flash-1.1';window.seriesV=[];
if (typeof window.current === 'undefined') window.current = null;
if (typeof window.selectedProductForUx === 'undefined') window.selectedProductForUx = null;
async function loadProductContext(){const qs=new URLSearchParams(location.search),code=qs.get('code')||localStorage.getItem('wdi:selectedProduct')||'';if(!code)return null;try{const d=await fetch('/api/products?q='+encodeURIComponent(code)+'&limit=5').then(r=>r.json());const list=Array.isArray(d)?d:(d.products||[]);const hit=x=>{const v=String((x&&x['Product Code'])||'');return v===code||v.split('/').map(s=>s.trim()).includes(code)};const p=list.find(hit)||list[0];if(p){window.current=p;window.selectedProductForUx=p;localStorage.setItem('wdi:selectedProduct',p['Product Code']||code);decorateNav();return p}}catch{}return null}
async function loadSeriesContext(){try{const d=await fetch('/api/series-v').then(r=>r.json());if(Array.isArray(d))window.seriesV=d}catch{window.seriesV=[]}}
function decorateNav(){const code=localStorage.getItem('wdi:selectedProduct')||new URLSearchParams(location.search).get('code')||'';document.querySelectorAll('a[data-page-link]').forEach(a=>{const p=a.dataset.pageLink;a.href=p+'.html'+(code?'?code='+encodeURIComponent(code):'')})}
async function openSheetDrawer(){const m=$('sheetModal'),b=$('sheetBody'),p=window.current;if(!m||!b||!p)return; m.classList.add('on');b.innerHTML='<div class="loading">กำลังโหลด Product Sheet...</div>';try{const d=await fetch('/api/sheet/detail?code='+encodeURIComponent(p['Product Code']||'')).then(r=>r.json());if(d.error)throw new Error(d.error);const i=d.identity?.identity||{},c=d.identity?.components||{};const rows=[['รหัส',i.product_code||p['Product Code']],['ชื่อ',i.product_name||p['Product Name (TH)']],['สถานะ',d.sheet?.status],['Version',d.sheet?.version],...Object.values(c).filter(x=>x&&x.value).map(x=>[x.label||x.key,x.value])];b.innerHTML='<div class="sheet-list">'+rows.map(([k,v])=>'<div><span>'+esc(k)+'</span><b>'+esc(v)+'</b></div>').join('')+'</div>'}catch(e){b.innerHTML='<div class="error">'+esc(e.message||'โหลดไม่สำเร็จ')+'</div>'}}
function closeSheet(){const m=$('sheetModal');if(m)m.classList.remove('on')}
async function initPageCommon(){decorateNav();await loadSeriesContext();const p=await loadProductContext();try{const h=await fetch('/api/health').then(r=>r.json());if($('health'))$('health').textContent='● Online';if($('sys'))$('sys').textContent=(h.products||0)+' products · '+(h.templates||0)+' series'}catch{if($('health'))$('health').textContent='● Offline'}return p}
function goProduct(){const c=localStorage.getItem('wdi:selectedProduct')||new URLSearchParams(location.search).get('code')||'';location.href='index.html'+(c?'?code='+encodeURIComponent(c):'')}
