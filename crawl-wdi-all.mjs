import XLSX from 'xlsx';
const BASE='https://www.wdi.co.th/';
const START='https://www.wdi.co.th/product/category-select.php';
const FILE='D:\\Windows\\Document\\VSCode\\ex\\products_full.xlsx';
const OUT=FILE.replace('products_full.xlsx','products_full__ALL_PRODUCTS.xlsx');
const HEAD=['Category','Sub Category','Product URL','Product Code','Product Name (TH)','Product Name (EN)','Main Image URL','Additional Images','Description (TH)','Description (EN)'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function dec(s){return String(s||'').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'\"').replace(/&#39;/g,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
function text(html){return dec(String(html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());}
function abs(u){if(!u)return '';try{return new URL(u,BASE).href.replace('https://www.wdi.co.th../','https://www.wdi.co.th/');}catch{return u;}}
function links(html){const out=[];for(const m of String(html).matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)){const u=abs(m[1]);if(u.startsWith('https://www.wdi.co.th/product/'))out.push(u);}return [...new Set(out)];}
function attr(html,re){const m=String(html).match(re);return m?dec(m[1]):'';}
function block(html,id){const a=html.indexOf('id="'+id+'"');if(a<0)return '';const s=html.indexOf('>',a)+1;const e=html.indexOf('</div>',s);return e>s?html.slice(s,e):'';}
function parseProduct(html,url){
 const nav=(html.match(/<nav class=["']woocommerce-breadcrumb["'][\s\S]*?<\/nav>/i)||[''])[0];
 const bc=[...nav.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map(m=>text(m[1]));
 const code=text(attr(html,/class=["'][^"']*product-item-number[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));
 const nameTh=attr(html,/class=["'][^"']*product-name[^"']*["'][^>]*data-th=["']([^"']*)["']/i);
 const nameEn=attr(html,/class=["'][^"']*product-name[^"']*["'][^>]*data-th=["'][^"']*["'][^>]*data-en=["']([^"']*)["']/i);
 const main=abs(attr(html,/id=["']main-product-image["'][^>]*src=["']([^"']*)["']/i));
 const adds=[...html.matchAll(/class=["']detail-thumbnail["'][^>]*data-detail-src=["']([^"']+)["']/gi)].map(m=>abs(m[1])).filter((v,i,a)=>v&&a.indexOf(v)===i).join('; ');
 return {Category:bc[0]||'', 'Sub Category':bc[1]||'', 'Product URL':url, 'Product Code':code, 'Product Name (TH)':nameTh, 'Product Name (EN)':nameEn, 'Main Image URL':main, 'Additional Images':adds, 'Description (TH)':text(block(html,'content-th')), 'Description (EN)':text(block(html,'content-en'))};
}
async function fetchPage(url){for(let i=0;i<3;i++){try{const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 WDI-Crawler/1.0','accept-language':'th-TH,th;q=0.9,en;q=0.8'}});if(r.ok)return await r.text();}catch{}await sleep(500*(i+1));}return null;}
const queue=[START];const seen=new Set();const productUrls=new Set();const pages=[];
while(queue.length){const u=queue.shift();if(seen.has(u))continue;seen.add(u);const html=await fetchPage(u);if(!html){console.log('FAIL PAGE',u);continue;}pages.push([u,html]);for(const v of links(html)){if(/\/view-product\.php\?/i.test(v))productUrls.add(v);else if(/\/product-led-lamps\.php(?:\?|$)/i.test(v)&&!seen.has(v))queue.push(v);}if(seen.size%25===0)console.log(`Crawled ${seen.size} pages, products ${productUrls.size}, queue ${queue.length}`);await sleep(60);}
console.log(`DISCOVERY DONE: pages=${seen.size}, product URLs=${productUrls.size}`);
const rows=[];let i=0;for(const u of productUrls){const h=pages.find(x=>x[0]===u)?.[1]||await fetchPage(u);if(!h){console.log('FAIL PRODUCT',u);continue;}try{rows.push(parseProduct(h,u));}catch(e){console.log('PARSE FAIL',u,e.message);}i++;if(i%25===0)console.log(`Parsed ${i}/${productUrls.size}`);await sleep(30);}
rows.sort((a,b)=>String(a['Product Code']).localeCompare(String(b['Product Code']))||String(a['Product URL']).localeCompare(String(b['Product URL'])));
const wb=XLSX.readFile(FILE);wb.Sheets['Sheet2']=XLSX.utils.aoa_to_sheet([HEAD,...rows.map(r=>HEAD.map(h=>r[h]??''))]);XLSX.writeFile(wb,OUT);console.log(`DONE: ${OUT} rows=${rows.length}`);
