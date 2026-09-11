import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
const ROOT=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w):/,'$1:'));
const BASE='https://www.wdi.co.th/';
const START=BASE+'product/category-select.php';
const OUT=path.join(ROOT,'data','WDI-Fitment-Master.xlsx');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const dec=s=>clean(String(s||'').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>'));
const strip=s=>dec(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '));
const abs=u=>{try{const x=new URL(String(u||''),BASE);return x.hostname==='www.wdi.co.th'?x.href:''}catch{return ''}};
function links(html){return [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:abs(m[1]),text:strip(m[2])})).filter(x=>x.url.startsWith(BASE+'product/'));}
async function get(url){for(let n=1;n<=3;n++){try{const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 WDI-Fitment-Sync/1.0','accept-language':'th-TH,th;q=0.9,en;q=0.8'}});if(r.ok)return await r.text()}catch{}await sleep(250*n)}return ''}
const isProduct=u=>/\/product\/view-product\.php\?/i.test(u);
const isFilter=u=>/\/product\/product-led-lamps\.php(?:\?|$)/i.test(u);
function breadcrumb(html){const nav=String(html).match(/<nav[^>]*class=["'][^"']*woocommerce-breadcrumb[^"']*["'][^>]*>[\s\S]*?<\/nav>/i)?.[0]||'';return [...nav.matchAll(/<(?:a|strong)\b[^>]*>([\s\S]*?)<\/(?:a|strong)>/gi)].map(m=>strip(m[1])).filter(Boolean)}
function product(html,url){
 const code=strip(String(html).match(/class=["'][^"']*product-item-number[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
 const th=dec(String(html).match(/class=["'][^"']*product-name[^"']*[^>]*data-th=["']([^"']*)["']/i)?.[1]||'');
 const en=dec(String(html).match(/class=["'][^"']*product-name[^"']*[^>]*data-en=["']([^"']*)["']/i)?.[1]||'');
 const title=strip(String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'')||th||en;
 const main=abs(String(html).match(/id=["']main-product-image["'][^>]*src=["']([^"']+)["']/i)?.[1]||'');
 const imgs=[main,...[...String(html).matchAll(/(?:src|data-detail-src|data-src)=["']([^"']+)["']/gi)].map(m=>abs(m[1]))].filter(u=>u&&/\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(u));
 const unique=[...new Set(imgs)];
 const thDesc=strip(String(html).match(/id=["']content-th["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
 const enDesc=strip(String(html).match(/id=["']content-en["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
 return {Product_ID:url,Product_Code:code,Product_Name_TH:th||title,Product_Name_EN:en,Product_Title:title,Product_URL:url,Main_Image_URL:main,Additional_Images:unique.join('; '),Description_TH:thDesc,Description_EN:enDesc};
}

const queue=[{url:START,path:[]}];
const seen=new Set();
const products=new Map();
const contexts=new Map();
let pages=0;
while(queue.length){
 const cur=queue.shift(); if(seen.has(cur.url))continue; seen.add(cur.url);
 const html=await get(cur.url); pages++; if(!html)continue;
 const crumb=breadcrumb(html); const pathHint=crumb.length?crumb:cur.path;
 if(isProduct(cur.url)) products.set(cur.url,{...(products.get(cur.url)||{}),...product(html,cur.url)});
 if(isFilter(cur.url)){
   const linksOnPage=links(html).filter(x=>isProduct(x.url));
   const context=pathHint.length?pathHint.join(' / '):cur.url;
   contexts.set(cur.url,{url:cur.url,path:pathHint});
   for(const l of linksOnPage){const old=products.get(l.url);products.set(l.url,{...(old||{}),...product(html,l.url),_contexts:[...(old?old._contexts||[]:[]),context]});}
 }
 for(const l of links(html)){
   if((isFilter(l.url)||isProduct(l.url))&&!seen.has(l.url)){
     const next=pathHint.concat(l.text?[l.text]:[]);
     queue.push({url:l.url,path:next});
   }
 }
 if(pages%50===0)console.log(`CRAWL ${pages} pages | queue ${queue.length} | products ${products.size} | contexts ${contexts.size}`);
}
console.log(`DISCOVERY pages=${pages} products=${products.size} contexts=${contexts.size}`);
const productUrls=[...products.keys()];
let detailCount=0;
for(const url of productUrls){
 const html=await get(url);
 if(!html)continue;
 detailCount++;
 const p=product(html,url);
 p.Breadcrumb=breadcrumb(html);
 p._contexts=[...new Set(products.get(url)?._contexts||[])];
 products.set(url,p);
 if(detailCount%50===0)console.log(`DETAIL ${detailCount}/${productUrls.length}`);
}
console.log(`DETAIL DONE ${detailCount}/${productUrls.length}`);
const rows=[];
const productRows=[];
for(const [url,p] of products){
 const contexts=[...new Set(p._contexts||[])].filter(Boolean);
 const bc=p.Breadcrumb?.filter(Boolean)||[];
 const category=bc[0]||'';
 const sub=bc[1]||'';
 productRows.push({Product_ID:url,Product_Code:p.Product_Code,Product_Name_TH:p.Product_Name_TH,Product_Name_EN:p.Product_Name_EN,Product_URL:url,Main_Image_URL:p.Main_Image_URL,Additional_Images:p.Additional_Images,Description_TH:p.Description_TH,Description_EN:p.Description_EN,Category:category,Sub_Category:sub,Breadcrumb:bc.join(' / '),Context_Count:contexts.length});
 for(const c of contexts){
  const parts=c.split(' / ').map(clean).filter(Boolean);
  const cat=parts[0]||category;
  const brand=parts[1]||'';
  const model=parts[2]||'';
  rows.push({Category:cat,Sub_Category:parts.slice(1,-1).join(' / '),Car_Brand:brand,Car_Model:model,Variant_or_Trim:'',Fitment_Context:c,FITMENT_Status:brand&&model?'CONFIRMED_BY_WDI_NAV':'CATEGORY_CONTEXT',Product_Code:p.Product_Code,Product_Name_TH:p.Product_Name_TH,Product_Name_EN:p.Product_Name_EN,Product_URL:url,Source_URL:c,Source_Text:c,Evidence_Description_TH:p.Description_TH,Evidence_Description_EN:p.Description_EN,Main_Image_URL:p.Main_Image_URL,Additional_Images:p.Additional_Images,Notes:'Navigation context from WDI filter pages; product-level wording remains evidence.'});
 }
}
console.log(`ROWS ${rows.length} PRODUCT_ROWS ${productRows.length}`);
const wb=XLSX.utils.book_new();
function addSheet(name,headers,data){
 const ws=XLSX.utils.aoa_to_sheet([headers,...data.map(r=>headers.map(h=>r[h]??''))]);
 ws['!freeze']={xSplit:0,ySplit:1};
 XLSX.utils.book_append_sheet(wb,ws,name);
}
const fitHead=['Category','Sub_Category','Car_Brand','Car_Model','Variant_or_Trim','Fitment_Context','FITMENT_Status','Product_Code','Product_Name_TH','Product_Name_EN','Product_URL','Source_URL','Source_Text','Evidence_Description_TH','Evidence_Description_EN','Main_Image_URL','Additional_Images','Notes'];
const prodHead=['Product_ID','Product_Code','Product_Name_TH','Product_Name_EN','Product_URL','Main_Image_URL','Additional_Images','Description_TH','Description_EN','Category','Sub_Category','Breadcrumb','Context_Count'];
addSheet('Fitment Master',fitHead,rows);
addSheet('Product Master',prodHead,productRows);
const ctx=[...contexts.values()].map(x=>({URL:x.url,Navigation_Path:(x.path||[]).join(' / ')}));
addSheet('WDI Navigation', ['URL','Navigation_Path'], ctx);
const qa=[];
qa.push({Metric:'Pages crawled',Value:pages});
qa.push({Metric:'Filter contexts',Value:contexts.size});
qa.push({Metric:'Unique products',Value:productRows.length});
qa.push({Metric:'Fitment rows',Value:rows.length});
qa.push({Metric:'Rows with car brand',Value:rows.filter(r=>r.Car_Brand).length});
qa.push({Metric:'Rows with car model',Value:rows.filter(r=>r.Car_Model).length});
qa.push({Metric:'Rows with evidence description',Value:rows.filter(r=>r.Evidence_Description_TH||r.Evidence_Description_EN).length});
qa.push({Metric:'GeneratedAt',Value:new Date().toISOString()});
addSheet('QA Summary',['Metric','Value'],qa);
const catCount={}; for(const r of rows){const k=r.Category||'UNKNOWN';catCount[k]=(catCount[k]||0)+1;}
addSheet('Category Coverage',['Category','Fitment_Rows'],Object.entries(catCount).map(([Category,Fitment_Rows])=>({Category,Fitment_Rows})));
fs.mkdirSync(path.dirname(OUT),{recursive:true});
XLSX.writeFile(wb,OUT);
console.log(`DONE ${OUT}`);
console.log(JSON.stringify(qa));

// Build explicit fitment evidence from product descriptions without AI inference.
function fitmentEvidence(text){
 const t=clean(text); if(!t)return [];
 const hits=[];
 const rx=/(?:will\s+also\s+fit\s+on|will\s+also\s+fit\s+|fit\s+on|compatible\s+to|compatible\s+with|à¸•à¸´à¸”à¸•à¸±à¹‰à¸‡à¸à¸±à¸š|à¹ƒà¸Šà¹‰à¸à¸±à¸š|à¸£à¸¸à¹ˆà¸™\s+[^:ï¼š-]{2,40})/gi;
 let m; while((m=rx.exec(t))) hits.push(t.slice(Math.max(0,m.index-20),Math.min(t.length,m.index+240)));
 return [...new Set(hits.map(clean))];
}
const evidenceRows=[];
for(const [url,p] of products){
 const ev=[...fitmentEvidence(p.Description_TH||''),...fitmentEvidence(p.Description_EN||'')];
 for(const text of ev) evidenceRows.push({Product_Code:p.Product_Code,Product_Name_TH:p.Product_Name_TH,Product_URL:url,Evidence_Text:text,Evidence_Type:'PRODUCT_DESCRIPTION',Source_URL:url});
}
addSheet('Fitment Evidence',['Product_Code','Product_Name_TH','Product_URL','Evidence_Text','Evidence_Type','Source_URL'],evidenceRows);

