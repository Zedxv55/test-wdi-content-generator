import { spawn } from 'node:child_process';
import path from 'node:path';
const ROOT=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w):/,'$1:'));
function run(file){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(ROOT,file)],{cwd:ROOT,windowsHide:true});let out='',err='';p.stdout.on('data',d=>{out+=d.toString();process.stdout.write(d)});p.stderr.on('data',d=>{err+=d.toString();process.stderr.write(d)});p.on('close',code=>code===0?resolve(out):reject(new Error(err||out||`${file} exited ${code}`)));p.on('error',reject);});}
await run('wdi-catalog.mjs');
await run('fitment-catalog.mjs');
console.log('WDI + FITMENT sync complete');
