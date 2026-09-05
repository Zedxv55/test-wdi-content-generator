import XLSX from 'xlsx';
const BASE='https://www.wdi.co.th/';const START=BASE+'product/category-select.php';
const FILE='D:\\Windows\\Document\\VSCode\\ex\\products_full.xlsx';const OUT=FILE.replace('products_full.xlsx','products_full__ALL_PRODUCTS.xlsx');
const HEAD=['Category','Sub Category','Product URL','Product Code','Product Name (TH)','Product Name (EN)','Main Image URL','Additional Images','Description (TH)','Description (EN)'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dec=s=>String(s||'').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'\"').replace(/&#39;/g,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
const text=s=>dec(String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const abs=u=>{try{return new URL(u,BASE).href.replace('https://www.wdi.co.th../','https://www.wdi.co.th/')}catch{return ''}};
const hrefs=h=>[...h.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map(m=>abs(m[1])).filter(u=>u.startsWith(BASE+'product/'));
async function get(u){for(let n=0;n<5;n++){try{const r=await fetch(u,{headers:{'user-agent':'Mozilla/5.0 WDI-Reliable/1.0','accept-language':'th-TH,th;q=0.9,en;q=0.8','cache-control':'no-cache'}});if(r.ok)return await r.text()}catch{}await sleep(800*(n+1))}return null}
const attr=(h,re)=>{const m=h.match(re);return m?dec(m[1]):''};
const block=(h,id)=>{const a=h.indexOf('id="'+id+'"');if(a<0)return '';const s=h.indexOf('>',a)+1,e=h.indexOf('</div>',s);return e>s?h.slice(s,e):''};
function parse(h,u){const nav=(h.match(/<nav class=["']woocommerce-breadcrumb["'][\s\S]*?<\/nav>/i)||[''])[0];const bc=[...nav.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map(m=>text(m[1]));const code=text(attr(h,/class=["'][^"']*product-item-number[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));const th=attr(h,/class=["'][^"']*product-name[^"']*["'][^>]*data-th=["']([^"']*)["']/i);const en=attr(h,/class=["'][^"']*product-name[^"']*["'][^>]*data-th=["'][^"']*["'][^>]*data-en=["']([^"']*)["']/i);const main=abs(attr(h,/id=["']main-product-image["'][^>]*src=["']([^"']*)["']/i));const adds=[...h.matchAll(/class=["']detail-thumbnail["'][^>]*data-detail-src=["']([^"']+)["']/gi)].map(m=>abs(m[1])).filter((v,i,a)=>v&&a.indexOf(v)===i).join('; ');return {Category:bc[0]||'', 'Sub Category':bc[1]||'', 'Product URL':u, 'Product Code':code, 'Product Name (TH)':th, 'Product Name (EN)':en, 'Main Image URL':main, 'Additional Images':adds, 'Description (TH)':text(block(h,'content-th')), 'Description (EN)':text(block(h,'content-en'))}}
async function pool(items,limit,fn){const out=new Array(items.length);let next=0;async function w(){for(;;){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i)}}await Promise.all(Array.from({length:limit},w));return out}
const q=[START],seen=new Set([START]),products=new Set();
while(q.length){const batch=q.splice(0,8);const got=await pool(batch,8,async u=>[u,await get(u)]);for(const [u,h] of got){if(!h)continue;for(const v of hrefs(h)){if(/\/view-product\.php\?/i.test(v))products.add(v);else if(/\/product-led-lamps\.php(?:\?|$)/i.test(v)&&!seen.has(v)){seen.add(v);q.push(v)}}}if(seen.size%40<8)console.log(`DISCOVERY ${seen.size} pages | ${products.size} products`) }
const urls=[...products];console.log(`DISCOVERY DONE ${urls.length} product URLs`);
const rows=await pool(urls,4,async(u,i)=>{const h=await get(u);if((i+1)%25===0)console.log(`FETCH ${i+1}/${urls.length}`);return h?parse(h,u):null});
const clean=rows.filter(Boolean).sort((a,b)=>String(a['Product Code']).localeCompare(String(b['Product Code']))||a['Product URL'].localeCompare(b['Product URL']));
const wb=XLSX.readFile(FILE);wb.Sheets['Sheet2']=XLSX.utils.aoa_to_sheet([HEAD,...clean.map(r=>HEAD.map(h=>r[h]??''))]);XLSX.writeFile(wb,OUT);console.log(`DONE rows=${clean.length}, failed=${urls.length-clean.length}`);
