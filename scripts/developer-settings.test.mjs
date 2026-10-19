import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const storage=loadTs(new URL('../src/app/app-storage.ts',import.meta.url));
const shop=loadTs(new URL('../src/app/shop-store.ts',import.meta.url));
const dev=loadTs(new URL('../src/app/developer-state.ts',import.meta.url));
const compiled=ts.transpileModule(readFileSync(new URL('../src/app/components/DeveloperSettings.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function mount(){process.env.NODE_ENV='development';storage.setDeveloperMode(false);globalThis.fetch=async(_url,options)=>Response.json({ok:JSON.parse(options.body).password==='0728'},{status:JSON.parse(options.body).password==='0728'?200:401});const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};const slots=[];let cursor=0,first=true;const opened=[];const props={enabled:false,snapshot:shop.shopSnapshot(),dataError:'',onToggle:async(enabled,password,signal)=>{await storage.setDeveloperMode(enabled,password,signal);props.enabled=enabled;props.snapshot=shop.syncGrowthRewards();},onRefresh:()=>{props.snapshot=shop.syncGrowthRewards();},onOpen:view=>opened.push(view),canReset(){}};
 const jsx=(type,props)=>({type,props});const exports={};const react={useEffect(){},useRef(initial){const i=cursor++;if(first)slots[i]={current:initial};return slots[i];},useState(initial){const i=cursor++;if(first)slots[i]=initial;return[slots[i],value=>slots[i]=value];}};
 runInNewContext(compiled,{exports,Error,AbortController,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:loadTs(new URL('../src/app/'+name.replace('../','')+'.ts',import.meta.url))});
 function render(){cursor=0;const tree=exports.DeveloperSettings(props);first=false;return tree;}
 function text(n){if(n==null||typeof n==='boolean')return '';if(Array.isArray(n))return n.map(text).join('');return typeof n==='object'?text(n.props?.children):String(n);}
 function nodes(n,p){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(x=>nodes(x,p));return [...(p(n)?[n]:[]),...nodes(n.props?.children,p)];}
 function button(label){return nodes(render(),n=>n.type==='button').find(n=>text(n).includes(label));}
 return {props,data,opened,render,async unlock(password='0728'){const input=nodes(render(),n=>n.type==='input'&&n.props.type==='password')[0];input.props.onChange({target:{value:password}});const form=nodes(render(),n=>n.type==='form')[0];form.props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));},text:()=>text(render()),settings:()=>exports.SettingsScreen({onDeveloper:()=>opened.push('developer')}),buttons:()=>nodes(render(),n=>n.type==='button'),switch:()=>nodes(render(),n=>n.props?.role==='switch')[0],click(label){const b=button(label);assert.ok(b,label);b.props.onClick();}};
}
test('settings exposes dev menu; live switch shows tools without refreshing and restores test balance',async()=>{
 const app=mount();assert.match(JSON.stringify(app.settings()),/개발자 테스트/);assert.doesNotMatch(app.text(),/햇살 테스트/);assert.equal(app.switch().props['aria-checked'],false);
 await app.unlock();assert.equal(app.switch().props['aria-checked'],true);app.click('+100 햇살');app.click('+1,000 햇살');assert.equal(shop.shopSnapshot().balance,1100);assert.match(app.text(),/테스트 지급/);app.click('상점 열기');app.click('정원 꾸미기');assert.deepEqual(app.opened,['shop','decorate']);
 app.switch().props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(app.switch().props['aria-checked'],false);assert.doesNotMatch(app.text(),/햇살 테스트/);assert.equal(shop.shopSnapshot().balance,0);app.click('일반 사용자 화면 보기');await app.unlock();assert.equal(shop.shopSnapshot().balance,1100);
});
test('reset requires confirmation; cancel preserves test data and confirm resets only test state',async()=>{
 const app=mount();await app.unlock();app.click('+1,000 햇살');app.click('100일 시뮬레이션');assert.equal(shop.readShop().rewards.length,2);const before=app.data.get(storage.TEST_DATA_KEY);
 app.click('테스트 데이터 초기화');assert.match(app.text(),/초기화할까요/);assert.equal(app.data.get(storage.TEST_DATA_KEY),before);app.click('취소');assert.equal(app.data.get(storage.TEST_DATA_KEY),before);
 app.click('테스트 데이터 초기화');app.click('초기화 확인');assert.equal(shop.shopSnapshot().balance,0);assert.equal(dev.readTestControls().simulatedDays,null);assert.equal(shop.readShop().rewards.length,0);assert.match(app.text(),/초기화했어요/);
});
test('production hides menu and tools even if enabled prop or persisted flag is forged',async()=>{
 const app=mount();app.data.set(storage.DEVELOPER_MODE_KEY,'on');app.props.enabled=true;process.env.NODE_ENV='production';assert.doesNotMatch(JSON.stringify(app.settings()),/개발자 테스트/);assert.equal(app.buttons().length,0);assert.match(app.text(),/개발 환경에서만/);
});

test('wrong password stays locked and displays requested error',async()=>{const app=mount();await app.unlock('1234');assert.match(app.text(),/비밀번호가 올바르지 않아요./);assert.equal(app.props.enabled,false);assert.doesNotMatch(app.text(),/햇살 테스트/);await app.unlock();assert.equal(app.props.enabled,true);});
