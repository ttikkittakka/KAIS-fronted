// Checks a running production server and real HTTP assets. This is not a UI test.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2] ?? 'http://localhost:3101';
const response=await fetch(base);assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('오늘의 정원'));assert.ok(html.includes('기록을 안전하게 열고 있어요'));
const styles=Array.from(html.matchAll(/href="([^"]+\.css(?:\?[^"]*)?)"/g),m=>m[1]);assert.ok(styles.length);
const css=(await Promise.all(styles.map(async path=>{const r=await fetch(new URL(path,base));assert.equal(r.status,200);return r.text();}))).join('\n');
for(const family of ['Gowun Dodum','Do Hyeon','Geist','Geist Mono'])assert.ok(css.includes(family));
assert.equal(css.includes('fonts.googleapis.com'),false);assert.equal(css.includes('fonts.gstatic.com'),false);
const scripts=Array.from(new Set(Array.from(html.matchAll(/src="([^"]+\.js(?:\?[^"]*)?)"/g),m=>m[1])));
assert.ok(scripts.length);await Promise.all(scripts.map(async path=>{const r=await fetch(new URL(path,base));assert.equal(r.status,200,path);assert.ok((await r.arrayBuffer()).byteLength>0);}));
const fonts=Array.from(new Set(Array.from((await readFile(new URL('../src/app/fonts.css',import.meta.url),'utf8')).matchAll(/url\("(\/fonts\/[^"]+)"\)/g),m=>m[1])));
for(let i=0;i<fonts.length;i+=12)await Promise.all(fonts.slice(i,i+12).map(async path=>{const r=await fetch(new URL(path,base));assert.equal(r.status,200,path);const bytes=new Uint8Array(await r.arrayBuffer());assert.equal(Buffer.from(bytes.subarray(0,4)).toString(),'wOF2',path);}));
const rive=await fetch(new URL('/plant-final.riv',base));assert.equal(rive.status,200);assert.ok((await rive.arrayBuffer()).byteLength>1000);
const license=await fetch(new URL('/fonts/OFL.txt',base));assert.equal(license.status,200);
const api=await fetch(new URL('/api/checkins',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mood:3,energy:3,canGoOut:false})});assert.equal(api.status,200);const result=await api.json();assert.equal(result.success,true);assert.equal(result.recommendations.length,3);
console.log(JSON.stringify({home:response.status,stylesheets:styles.length,javascriptFiles:scripts.length,fontFiles:fonts.length,rive:rive.status,api:api.status,recommendedQuests:result.recommendations.length,noGoogleFontUrls:true},null,2));
