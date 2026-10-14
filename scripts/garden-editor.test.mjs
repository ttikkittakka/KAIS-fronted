import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const shop=loadTs(new URL('../src/app/shop-store.ts',import.meta.url));
const store=loadTs(new URL('../src/app/record-store.ts',import.meta.url));
const garden=loadTs(new URL('../src/app/garden-layout.ts',import.meta.url));
const compiled=ts.transpileModule(readFileSync(new URL('../src/app/components/GardenEditor.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function mount(){
 const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};const owner=store.localOwner();
 data.set(store.RECORDS_KEY,JSON.stringify(Array.from({length:20},(_,i)=>{const date='2026-09-'+String(i+1).padStart(2,'0');return {...store.emptyRecord(),date,userId:owner,sunshine:{policyVersion:1,startedAt:date+'T00:00:00Z',transactions:[{id:date+':reflection',date,reason:'reflection',delta:10,createdAt:date+'T01:00:00Z'}]}};})));shop.buyItem('momo');
 const slots=[];let cursor=0,first=true,closed=0,home=0;const props={snapshot:shop.shopSnapshot(),itemId:'momo',plantState:'low',onChange:value=>props.snapshot=value,onClose:()=>closed++,onHome:()=>home++};
 const react={useState(initial){const i=cursor++;if(first)slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=value];},useRef(initial){const i=cursor++;if(first)slots[i]={current:initial};return slots[i];}};
 const jsx=(type,props)=>({type,props});const exports={};
 runInNewContext(compiled,{exports,Error,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='./RivePlant'?{default:props=>jsx('sprout',props)}:name==='./GardenPlacement'?{default:props=>jsx('placements',props)}:loadTs(new URL('../src/app/'+name.replace('../','')+'.ts',import.meta.url))});
 function expand(n){if(!n||typeof n!=='object')return n;if(Array.isArray(n))return n.map(expand);if(typeof n.type==='function')return expand(n.type(n.props));return {...n,props:{...n.props,children:expand(n.props?.children)}};}
 function render(){cursor=0;const tree=exports.default(props);first=false;return expand(tree);}
 function text(n){if(n==null||typeof n==='boolean')return '';if(Array.isArray(n))return n.map(text).join('');return typeof n==='object'?text(n.props?.children):String(n);}
 function nodes(n,p){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(x=>nodes(x,p));return [...(p(n)?[n]:[]),...nodes(n.props?.children,p)];}
 function button(label){return nodes(render(),n=>n.type==='button').find(n=>text(n).includes(label));}
 return {props,data,text:()=>text(render()),button,find:type=>nodes(render(),n=>n.type===type),click(label){const b=button(label);assert.ok(b,label);assert.ok(!b.props.disabled,label+' disabled');b.props.onClick();},closed:()=>closed,home:()=>home};
}
test('select -> preview -> save is explicit; returning home receives committed layout',()=>{
 const app=mount();const original=app.data.get(shop.SHOP_KEY);assert.equal(app.button('미리보기 확인').props.disabled,true);
 assert.equal(app.find('sprout')[0].props.state,'low');app.click('좌측 친구');assert.equal(app.find('placements')[0].props.layout['friend-left'],'momo');assert.equal(app.data.get(shop.SHOP_KEY),original);
 app.click('미리보기 확인');assert.match(app.text(),/좌측 친구: 빈자리 → 모모/);assert.equal(app.data.get(shop.SHOP_KEY),original);
 const save=app.button('배치 저장');save.props.onClick();save.props.onClick();assert.equal(shop.readShop().layout['friend-left'],'momo');assert.match(app.text(),/배치 저장 완료/);assert.doesNotMatch(app.text(),/정원 정보가 바뀌었어요/);assert.equal(shop.shopSnapshot().balance,50);app.click('정원으로 돌아가기');assert.equal(app.home(),1);
});
test('move and remove affect only drafts until saved; cancelling keeps original garden',()=>{
 const app=mount();app.click('좌측 친구');app.click('우측 친구');assert.equal(app.find('placements')[0].props.layout['friend-left'],undefined);assert.equal(app.find('placements')[0].props.layout['friend-right'],'momo');app.click('배치 해제');assert.equal(app.find('placements')[0].props.layout['friend-right'],undefined);app.click('변경 취소');assert.equal(app.closed(),1);assert.equal(shop.readShop().placed.includes('momo'),false);assert.ok(shop.ownedItemIds(shop.readShop()).includes('momo'));
});
test('failed save keeps previous garden and pending preview, then retry succeeds',()=>{
 const app=mount();app.click('앞쪽 친구');app.click('미리보기 확인');const set=localStorage.setItem;localStorage.setItem=()=>{throw new Error('quota');};app.click('배치 저장');assert.match(app.text(),/저장 공간/);assert.equal(shop.readShop().placed.includes('momo'),false);assert.equal(app.find('placements')[0].props.layout['friend-front'],'momo');localStorage.setItem=set;app.click('배치 저장');assert.equal(shop.readShop().layout['friend-front'],'momo');
});
test('stale editor offers explicit reload without erasing the newer placement',()=>{
 const app=mount();app.click('좌측 친구');app.click('미리보기 확인');const latest=shop.readShop();shop.saveGardenLayout(garden.assignGardenSlot(latest.layout,'momo','friend-right'),latest.revision);app.click('배치 저장');assert.match(app.text(),/정원 정보가 바뀌었어요/);assert.equal(shop.readShop().layout['friend-right'],'momo');app.click('최신 배치 다시 불러오기');assert.equal(app.find('placements')[0].props.layout['friend-right'],'momo');assert.equal(app.button('미리보기 확인').props.disabled,true);
});
