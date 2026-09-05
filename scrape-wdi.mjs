import XLSX from 'xlsx';
const BASE='https://www.wdi.co.th/';
const FILE='D:\\Windows\\Document\\VSCode\\ex\\products_full.xlsx';
const HEAD=['Category','Sub Category','Product URL','Product Code','Product Name (TH)','Product Name (EN)','Main Image URL','Additional Images','Description (TH)','Description (EN)'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function abs(u){if(!u)return '';try{return new URL(u,BASE).href.replace('https://www.wdi.co.th../','https://www.wdi.co.th/');}catch{return u;}}
function dec(s){return String(s||'').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
function text(html){return dec(String(html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());}
function attr(html,re){const m=String(html).match(re);return m?dec(m[1]):'';}
function block(html,id){const a=html.indexOf('id="'+id+'"');if(a<0)return '';const s=html.indexOf('>',a)+1;const e=html.indexOf('</div>',s);return e>s?html.slice(s,e):'';}
function parse(html,url,fallback){
 const nav=(html.match(/<nav class=["']woocommerce-breadcrumb["'][\s\S]*?<\/nav>/i)||[''])[0];
 const links=[...nav.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map(m=>text(m[1]));
 const code=text(attr(html,/class=["'][^"']*product-item-number[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));
 const nameTh=attr(html,/class=["'][^"']*product-name[^"']*["'][^>]*data-th=["']([^"']*)["']/i);
 const nameEn=attr(html,/class=["'][^"']*product-name[^"']*["'][^>]*data-th=["'][^"']*["'][^>]*data-en=["']([^"']*)["']/i);
 const main=abs(attr(html,/id=["']main-product-image["'][^>]*src=["']([^"']*)["']/i));
 const adds=[...html.matchAll(/class=["']detail-thumbnail["'][^>]*data-detail-src=["']([^"']+)["']/gi)].map(m=>abs(m[1])).filter((v,i,a)=>v&&a.indexOf(v)===i).join('; ');
 const th=text(block(html,'content-th')); const en=text(block(html,'content-en'));
 return {Category:links[0]||fallback.Category||'', 'Sub Category':links[1]||fallback['Sub Category']||'', 'Product URL':url, 'Product Code':code||fallback['Product Code']||'', 'Product Name (TH)':nameTh||fallback['Product Name (TH)']||'', 'Product Name (EN)':nameEn||fallback['Product Name (EN)']||'', 'Main Image URL':main||fallback['Main Image URL']||'', 'Additional Images':adds||fallback['Additional Images']||'', 'Description (TH)':th||fallback['Description (TH)']||'', 'Description (EN)':en||fallback['Description (EN)']||''};
}
async function fetchPage(url){for(let i=0;i<3;i++){try{const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 WDI-data-sync/1.0'}});if(r.ok)return await r.text();}catch{}await sleep(500*(i+1));}return null;}
const wb=XLSX.readFile(FILE);
const old=XLSX.utils.sheet_to_json(wb.Sheets['WDI Products'],{defval:''});
const byUrl=new Map(old.map(r=>[r['Product URL'],r]));
const urls=[...byUrl.keys()].filter(Boolean);
console.log(`Seed products: ${urls.length}`);
const out=[];let done=0,fail=0;
for(let i=0;i<urls.length;i+=8){
 const batch=urls.slice(i,i+8);
 const rows=await Promise.all(batch.map(async u=>{const h=await fetchPage(u);if(!h){fail++;return byUrl.get(u);}try{return parse(h,u,byUrl.get(u));}catch{fail++;return byUrl.get(u);}}));
 out.push(...rows);done+=rows.length;console.log(`Fetched ${done}/${urls.length} (failed ${fail})`);await sleep(100);
}
const data=[HEAD,...out.map(r=>HEAD.map(h=>r[h]??''))];
wb.Sheets['Sheet2']=XLSX.utils.aoa_to_sheet(data);
XLSX.writeFile(wb,FILE.replace("products_full.xlsx","products_full__Sheet2_temp.xlsx"));
console.log(`DONE: Sheet2 rows=${out.length}, failed=${fail}`);
