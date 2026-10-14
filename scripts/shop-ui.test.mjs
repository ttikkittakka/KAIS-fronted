import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const shop=loadTs(new URL('../src/app/shop-store.ts',import.meta.url));
const store=loadTs(new URL('../src/app/record-store.ts',import.meta.url));
const compiled=ts.transpileModule(readFileSync(new URL('../src/app/components/GardenShop.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function mount(days=20,inventory=false){
 const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}; const owner=store.localOwner();
 data.set(store.RECORDS_KEY,JSON.stringify(Array.from({length:days},(_,i)=>{const date='2026-09-'+String(i+1).padStart(2,'0');return {...store.emptyRecord(),date,userId:owner,sunshine:{policyVersion:1,startedAt:date+'T00:00:00Z',transactions:[{id:date+':reflection',date,reason:'reflection',delta:10,createdAt:date+'T01:00:00Z'}]}};})));
 const slots=[];let cursor=0,first=true,home=0,switched=0;const props={inventory,snapshot:shop.shopSnapshot(),storageError:'',onChange:value=>props.snapshot=value,onRetry(){},onHome(){home++;},onSwitch(){switched++;}};
 const react={useState(initial){const i=cursor++;if(first)slots[i]=initial;return[slots[i],value=>slots[i]=value];},useRef(initial){const i=cursor++;if(first)slots[i]={current:initial};return slots[i];}};
 const jsx=(type,props)=>({type,props});const exports={};
 runInNewContext(compiled,{exports,Error,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:name==='./GardenEditor'?{default:props=>jsx('editor',props)}:loadTs(new URL('../src/app/'+name.replace('../','')+'.ts',import.meta.url))});
 function expand(n){if(!n||typeof n!=='object')return n;if(Array.isArray(n))return n.map(expand);if(typeof n.type==='function')return expand(n.type(n.props));return {...n,props:{...n.props,children:expand(n.props?.children)}};}
 function render(){cursor=0;const tree=exports.default(props);first=false;return expand(tree);}
 function text(n){if(n==null||typeof n==='boolean')return '';if(Array.isArray(n))return n.map(text).join('');return typeof n==='object'?text(n.props?.children):String(n);}
 function nodes(n,predicate){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(x=>nodes(x,predicate));return [...(predicate(n)?[n]:[]),...nodes(n.props?.children,predicate)];}
 function button(label){return nodes(render(),n=>n.type==='button').find(n=>text(n).includes(label));}
 return {render,editor:()=>nodes(render(),n=>n.type==='editor')[0],text:()=>text(render()),button,click(label){const b=button(label);assert.ok(b,label);assert.ok(!b.props.disabled,label+' disabled');b.props.onClick();},data,props,home:()=>home,switched:()=>switched};
}
test('detail shows cost and balance, purchase confirmation owns once, completion allows placement',()=>{
 const app=mount();app.click('모모');assert.match(app.text(),/현재 잔액☀️ 200/);assert.match(app.text(),/구매 후 잔액☀️ 50/);
 const confirm=app.button('구매 확인');confirm.props.onClick();confirm.props.onClick();assert.equal(shop.readShop().purchases.length,1);
 assert.match(app.text(),/보관함에 도착/);app.click('정원에 배치하기');assert.equal(app.editor().props.itemId,'momo');assert.ok(!shop.readShop().placed.includes('momo'));assert.equal(app.home(),0);
});
test('store completion leaves item unplaced and opens inventory',()=>{
 const app=mount();app.click('모모');app.click('구매 확인');app.click('보관함에 두기');assert.equal(app.switched(),1);assert.ok(!shop.readShop().placed.includes('momo'));
});
test('insufficient balance disables purchase and cancellation leaves no receipt',()=>{
 const app=mount(1);app.click('모모');assert.equal(app.button('구매 확인').props.disabled,true);assert.match(app.text(),/140개 부족/);app.click('목록으로');assert.equal(shop.readShop().purchases.length,0);
});
test('inventory only lists default and bought items and distinguishes placement',()=>{
 const app=mount(20,true);assert.match(app.text(),/아직 보관 중인 아이템이 없어요/);app.click('배경');assert.match(app.text(),/기본 하늘/);assert.doesNotMatch(app.text(),/노을 정원/);assert.match(app.text(),/배치 중/);
 app.props.snapshot=shop.buyItem('momo');app.click('캐릭터');assert.match(app.text(),/모모/);assert.doesNotMatch(app.text(),/포리/);assert.match(app.text(),/보관 중/);
 app.click('모모');app.click('정원에 배치하기');assert.equal(app.editor().props.itemId,'momo');app.editor().props.onClose();
 app.props.snapshot=shop.placeItem('momo',true);app.click('모모');assert.match(app.text(),/배치 중/);app.click('위치 변경');assert.equal(app.editor().props.itemId,'momo');
});
test('failed purchase shows recovery guidance and never displays success',()=>{
 const app=mount();app.click('모모');localStorage.setItem=()=>{throw new Error('quota');};app.click('구매 확인');assert.match(app.text(),/저장 공간/);assert.doesNotMatch(app.text(),/보관함에 도착/);assert.equal(shop.shopSnapshot().balance,200);
});
