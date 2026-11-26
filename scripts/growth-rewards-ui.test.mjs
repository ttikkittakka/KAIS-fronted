import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const compiled=ts.transpileModule(readFileSync(new URL('../src/app/components/GrowthRewards.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const jsx=(type,props)=>({type,props});const exports={};
runInNewContext(compiled,{exports,Error,require:name=>name==='react'?{useState:initial=>[initial,()=>{}]}:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='./GardenPlacement'?{ItemArt:props=>jsx('item-art',props)}:loadTs(new URL('../src/app/'+name.replace('../','')+'.ts',import.meta.url))});
function text(n){if(n==null||typeof n==='boolean')return '';if(Array.isArray(n))return n.map(text).join('');return typeof n==='object'?text(n.props?.children):String(n);}
function nodes(n,p){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(x=>nodes(x,p));return [...(p(n)?[n]:[]),...nodes(n.props?.children,p)];}
const snapshot=(days,receivedItemIds=[])=>({activeDays:days,balance:0,state:{rewards:[
 ...(days>=50?[{id:'days-50',receivedItemIds:receivedItemIds.filter(id=>id==='anniversary-friend')}]:[]),
 ...(days>=100?[{id:'days-100',receivedItemIds:receivedItemIds.filter(id=>id!=='anniversary-friend')}]:[]),
]}});
test('each eligible gift can be received and only received items offer placement',()=>{
 const placed=[];let extra=0;const tree=exports.GrowthRewardsScreen({snapshot:snapshot(100,['anniversary-sky']),error:'',onRetry(){},onChange(){},onPlace:id=>placed.push(id),onExtra:()=>extra++});
 assert.match(text(tree),/정원에 새로운 친구가 찾아왔어요!/);assert.match(text(tree),/함께한 시간만큼 정원에도 새로운 모습이 생겼어요./);
 const receiveButtons=nodes(tree,n=>n.type==='button'&&text(n)==='받기');
 assert.deepEqual(receiveButtons.map(button=>button.props['aria-label']),['누리 · 50일 친구 받기','백일의 꽃 받기']);
 assert.ok(receiveButtons.every(button=>!button.props.disabled));
 for(const button of nodes(tree,n=>n.type==='button'&&text(n)==='배치하기'))button.props.onClick();
 assert.deepEqual(placed,['anniversary-sky']);assert.doesNotMatch(text(tree),/선물 확인했어요/);
 nodes(tree,n=>n.type==='button'&&text(n)==='선택형 돌봄 둘러보기')[0].props.onClick();assert.equal(extra,1);
 const locked=exports.GrowthRewardsScreen({snapshot:snapshot(49),error:'',onRetry(){},onChange(){},onPlace(){},onExtra(){}});
 assert.equal(nodes(locked,n=>n.type==='button'&&text(n)==='받기'&&n.props.disabled).length,3);assert.doesNotMatch(text(locked),/수령 완료/);
});
test('optional care gates direct entry and has no required completion action',()=>{
 const locked=exports.OptionalCareScreen({snapshot:snapshot(99),onHome(){}});assert.equal(nodes(locked,n=>n.type==='details').length,0);
 const open=exports.OptionalCareScreen({snapshot:snapshot(100),onHome(){}});assert.equal(nodes(open,n=>n.type==='details').length,1);assert.match(text(open),/추가 과제나 완료 횟수는 없어요/);assert.deepEqual(nodes(open,n=>n.type==='button').map(text),['정원으로 돌아가기']);
});
test('unseen reward notice is persistent and save errors expose retry without claiming success',()=>{
 const progress=exports.GrowthProgress({snapshot:snapshot(50),onOpen(){}});assert.match(text(progress),/새로운 성장 보상이 도착했어요/);
 const failed=exports.GrowthRewardsScreen({snapshot:snapshot(49),error:'저장 공간이 부족해요',onRetry(){},onChange(){},onPlace(){},onExtra(){}});assert.match(text(failed),/완료한 활동 기록은 유지/);assert.ok(nodes(failed,n=>n.type==='button'&&text(n)==='다시 확인하기').length);
});
