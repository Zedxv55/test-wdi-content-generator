(function(){
  const activity=document.getElementById('activityBar');
  const pageBusy=document.getElementById('pageBusy');
  const text=document.getElementById('activityText');
  const secs=document.getElementById('activitySecs');
  const busyTitle=document.getElementById('busyTitle');
  const busySecs=document.getElementById('busySecs');
  let timer=null,t0=0;
  function tick(){
    const s=Math.round((Date.now()-t0)/1000)+'วิ';
    if(secs)secs.textContent=s;
    if(busySecs)busySecs.textContent='กำลังทำ... '+s+' (ห้ามรีเฟรชหน้า)';
  }
  function setActivity(msg,on=true){
    if(!activity)return;
    if(text)text.textContent=msg;
    activity.classList.toggle('show',on);
    if(on){t0=Date.now();tick();clearInterval(timer);timer=setInterval(tick,1000);}
    else{clearInterval(timer);if(secs)secs.textContent='';}
  }
  function setOverlay(label,on=true){
    if(!pageBusy)return;
    if(label&&busyTitle)busyTitle.textContent=label;
    pageBusy.classList.toggle('on',on);
    if(on){if(busySecs)busySecs.textContent='กำลังทำ... 0วิ (ห้ามรีเฟรชหน้า)';}
  }
  function wrap(name,label,opts={}){
    const original=window[name]; if(typeof original!=='function'||original.__uxWrapped)return;
    const wrapped=async function(...args){
      const busyButtons=[...document.querySelectorAll('button')].filter(b=>{const oc=b.getAttribute('onclick')||'';return oc.includes(name+'(');});
      busyButtons.forEach(b=>{b.disabled=true;b.classList.add('busy');});
      setActivity(label,true);
      if(opts.overlay)setOverlay(label,true);
      try{return await original.apply(this,args);}
      finally{setActivity('',false);setOverlay('',false);busyButtons.forEach(b=>{b.disabled=false;b.classList.remove('busy');});}
    }; wrapped.__uxWrapped=true; window[name]=wrapped;
  }
  function bindButtons(){
    document.querySelectorAll('button').forEach(btn=>{btn.addEventListener('click',()=>{if(btn.disabled)return;if(/สร้าง|เจน|sync|ค้นหา|โหลด/i.test(btn.textContent)){btn.classList.add('busy');setTimeout(()=>{if(!btn.disabled)btn.classList.remove('busy');},1800);}}, {passive:true});});
  }
  wrap('loadProducts','กำลังโหลดรายการสินค้า...');
  wrap('loadMore','กำลังโหลดสินค้าเพิ่ม...');
  wrap('syncWdi','กำลังซิงค์ข้อมูล WDI (ใช้เวลาหลายนาที)...');
  wrap('generate','กำลังสร้าง Short Video Content Pack...');
  wrap('generateMarketplace','กำลังสร้าง Marketplace Prompts...');
  wrap('generateAiPreview','กำลังเจนภาพโฆษณาด้วย AI...');
  wrap('generateLocalAdPreview','กำลังสร้าง Preview จากรูปสินค้า WDI...');
  setTimeout(bindButtons,350);
  window.addEventListener('error',e=>{if(e?.message){setActivity('เกิดข้อผิดพลาด: '+e.message,true);setOverlay('',false);setTimeout(()=>setActivity('',false),3500);}});
  window.addEventListener('unhandledrejection',e=>{setActivity('เกิดข้อผิดพลาด: '+(e.reason?.message||e.reason||'unknown'),true);setOverlay('',false);setTimeout(()=>setActivity('',false),3500);});
})();

// Fitment UI enhancement: show structured WDI navigation fitment beside product context.
(function(){
  const original=window.selectProduct;
  if(typeof original!=='function'||original.__fitmentWrapped)return;
  const wrapped=function(i,btn){
    const r=original.apply(this,arguments);
    setTimeout(()=>{
      const box=document.querySelector('#detail .context');
      const p=window.current;
      if(!box||!p)return;
      const models=p['Fitment Models']||'';
      const brands=p['Fitment Brands']||'';
      const ev=p['Fitment Evidence']||'';
      if(!models&&!brands&&!ev)return;
      const html=`<hr style="border:0;border-top:1px solid #2a3340;margin:9px 0"><small><b>Fitment จาก WDI:</b> ${esc(brands||'')} ${esc(models||'')}</small>${ev?`<br><small style="color:#8d99aa">Evidence: ${esc(ev.slice(0,500))}</small>`:''}`;
      box.insertAdjacentHTML('beforeend',html);
    },0);
    return r;
  };
  wrapped.__fitmentWrapped=true;
  window.selectProduct=wrapped;
})();

// P2: delegated spotlight tracking (vars inherit to cards; no per-node listeners).
(function(){
  if(!window.matchMedia||!matchMedia('(pointer:fine)').matches)return;
  let raf=0,lx=0,ly=0;
  document.addEventListener('pointermove',e=>{
    lx=e.clientX;ly=e.clientY;
    if(raf)return;
    raf=requestAnimationFrame(()=>{raf=0;
      const t=e.target&&e.target.closest?e.target.closest('#products,.vgrid,#mapCanvas,#setBody'):null;
      if(!t)return;
      const r=t.getBoundingClientRect();
      if(!r.width||!r.height)return;
      t.style.setProperty('--mx',((lx-r.left)/r.width*100).toFixed(1)+'%');
      t.style.setProperty('--my',((ly-r.top)/r.height*100).toFixed(1)+'%');
    });
  },{passive:true});
})();

// P2: ESC closes topmost drawer/modal/nav.
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
    const t=e.target;
    if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'))return;
    if(typeof generate==='function'&&window.current){e.preventDefault();try{generate();}catch{}}
    return;
  }
  if(e.key!=='Escape')return;
  try{
    if(typeof closeCreative==='function')closeCreative();
    const ap=document.getElementById('assistantPanel');
    if(ap&&ap.classList.contains('open')&&typeof toggleAssistant==='function')toggleAssistant();
    ['truthModal','sheetModal'].forEach(id=>{const m=document.getElementById(id);if(m)m.classList.remove('on');});
    document.body.classList.remove('nav-open');
    const cs=document.getElementById('creativeScrim');if(cs)cs.classList.remove('on');
    const ds=document.getElementById('drawerScrim');if(ds)ds.classList.remove('on');
  }catch{}
});

// P2: pause ambient motion when tab hidden.
document.addEventListener('visibilitychange',()=>{
  document.body.classList.toggle('ambient-paused',!!document.hidden);
});
