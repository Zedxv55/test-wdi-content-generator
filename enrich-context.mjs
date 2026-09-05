import XLSX from 'xlsx';
const BASE='https://www.wdi.co.th/';
const START=BASE+'product/category-select.php';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const abs=u=>{try{return new URL(u,BASE).href.replace('https://www.wdi.co.th../','https://www.wdi.co.th/')}catch{return ''}};
const hrefs=h=>[...h.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map(m=>abs(m[1])).filter(Boolean);
async function get(u){for(let n=0;n<4;n++){try{const r=await fetch(u,{headers:{'user-agent':'Mozilla/5.0 WDI-Crawler/4.0','accept-language':'th-TH,th;q=0.9,en;q=0.8'}});if(r.ok)return await r.text()}catch{}await sleep(400*(n+1))}return null}
const decode=x=>{try{return Buffer.from(decodeURIComponent(x||''),'base64').toString('utf8')}catch{return ''}};
const q=[START],seen=new Set([START]),pageContexts=new Map();
while(q.length){const batch=q.splice(0,10);await Promise.all(batch.map(async u=>{const h=await get(u);if(!h)return;for(const v of hrefs(h)){if(/\/product-led-lamps\.php(?:\?|$)/i.test(v)&&!seen.has(v)){seen.add(v);q.push(v)}}if(/product-led-lamps\.php/i.test(u)){const p=new URL(u), c=p.searchParams.get('category01')||p.searchParams.get('category');const b=p.searchParams.get('car_brand_input'),m=p.searchParams.get('car_model_input');const productUrls=hrefs(h).filter(v=>/\/view-product\.php\?/i.test(v));if(c||b||m)pageContexts.set(u,{Category:decode(c),'Car Brand':decode(b),'Car Model':decode(m),products:productUrls})}}));if(seen.size%50<10)console.log('Discovery',seen.size,'queue',q.length,'contexts',pageContexts.size)}
console.log('DISCOVERY DONE',seen.size,'pages',pageContexts.size);
const f='D:/Windows/Document/VSCode/ex/products_full__ALL_PRODUCTS.xlsx';
const wb=XLSX.readFile(f), rows=XLSX.utils.sheet_to_json(wb.Sheets['Sheet2'],{defval:''}), by=new Map(rows.map(r=>[r['Product URL'],r]));
const out=[], keys=new Set();
for(const [source,c] of pageContexts){for(const url of c.products){const h=by.get(url);if(!h)continue;const r={...h,Category:c.Category||h.Category,'Car Brand':c['Car Brand'],'Car Model':c['Car Model'],'Source Page URL':source};r['Context Path']=[r.Category,r['Car Brand'],r['Car Model']].filter(Boolean).join(' > ');const k=[url,source].join('|');if(!keys.has(k)){keys.add(k);out.push(r)}}}
const headers=['Category','Sub Category','Car Brand','Car Model','Product URL','Product Code','Product Name (TH)','Product Name (EN)','Main Image URL','Additional Images','Description (TH)','Description (EN)','Source Page URL','Context Path'];
const ws=XLSX.utils.aoa_to_sheet([headers,...out.map(r=>headers.map(h=>r[h]??''))]);wb.Sheets['Context Data']=ws;
XLSX.writeFile(wb,'D:/Windows/Document/VSCode/ex/products_full__CONTEXT.xlsx');
const unique=new Set(out.map(r=>r['Product URL']));
console.log('DONE context rows',out.length,'unique products mapped',unique.size,'of',by.size,'context pages',pageContexts.size);
