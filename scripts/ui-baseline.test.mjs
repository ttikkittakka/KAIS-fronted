import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {loadTs} from './helpers/load-ts.mjs';
const baseline='cdb41447aa26b6db97c0646cb2f5550853964f93';
const gitFile=(path, revision=baseline)=>execFileSync('git',['show',`${revision}:${path}`],{encoding:'utf8',windowsHide:true});
const names=['HomeScreen','CheckinScreen','CareScreen','GardenScreen','TopBar','BottomNav','Onboarding'];
function screens(source){
 const exports={};
 const react={useState:init=>[typeof init==='function'?init():init,()=>{}],useRef:current=>({current}),useEffect(){}};
 const jsx=(type,props)=>({type:typeof type==='function'?type.name:type,props});
 const code=ts.transpileModule(source+'\n'+names.map(n=>`exports.${n} = ${n};`).join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,Date,require(name){
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name.endsWith('/questions'))return loadTs(new URL('../src/app/questions.ts',import.meta.url));
  return new Proxy({},{get:(_,key)=>key==='__esModule'?true:String(key)});
 }});
 return exports;
}
function normalized(node){
 if(node==null||node===false||typeof node==='function')return undefined;
 if(Array.isArray(node))return node.flatMap(n=>{const value=normalized(n);return value===undefined?[]:n?.type==='div'&&['home-scroll-content','home-progress-actions'].includes(n.props?.className)?value:[value];});
 if(typeof node!=='object')return node;
 if(node.type==='GardenTools' && node.props?.account===true){
  const {account, ...props}=node.props;
  return normalized({...node,props});
 }
 // Only the home scroll/action grouping changes. Compare every original child and style prop.
 if(node.type==='div' && ['home-scroll-content','home-progress-actions'].includes(node.props?.className))return normalized(node.props.children);
 const result=Object.fromEntries(Object.entries(node).flatMap(([key,value])=>{
  if(key==='key'||key.startsWith('on'))return [];
  const next=normalized(value);return next===undefined?[]:[[key,next]];
 }));
 // The original action is now outside the scrolling content; its props/copy stay identical.
 if(result.type==='section' && result.props?.className==='screen home-screen'){
  const children=result.props.children;
  const at=children.findIndex(n=>n.props?.className==='primary-button home-cta');
  const [action]=children.splice(at,1);
  const after=children.findIndex(n=>n.props?.className==='today-copy');
  children.splice(after+1,0,action);
 }
 return result;
}
test('server-account screens preserve GitHub baseline layout and copy',()=>{
 const old=screens(gitFile('src/app/page.tsx').split('function storageMessage')[0]);
 const current=screens(readFileSync('src/app/components/OneStepScreens.tsx','utf8'));
 const props={HomeScreen:{state:'low',recorded:false,completedCount:0,balance:17,shop:null,growthSnapshot:null},CheckinScreen:{initialRecord:null},CareScreen:{state:'normal',completed:null,completedIds:[],recommendation:{title:'Saved title',cares:[]}},GardenScreen:{records:[]},TopBar:{title:'오늘의 나'},BottomNav:{active:'home'},Onboarding:{}};
 // CareScreen has an explicitly approved inline timer and dynamic progress redesign.
 // Its layout and reward behavior are covered by care-specific browser/regression tests.
 for(const name of names.filter(name=>name!=='CareScreen'))assert.deepEqual(JSON.parse(JSON.stringify(normalized(current[name](props[name])))),JSON.parse(JSON.stringify(normalized(old[name](props[name])))),name);
});
test('account layout rules, recommendation algorithm and Rive asset remain unchanged',()=>{
 // The wrapper now performs the approved silhouette hit test; the animation asset is unchanged.
 assert.deepEqual(readFileSync('public/plant-final.riv'),execFileSync('git',['show',`${baseline}:public/plant-final.riv`],{windowsHide:true}));
 for(const path of ['src/app/recommend-cares.ts','src/app/daily-cares.ts']){
  assert.equal(readFileSync(path,'utf8').replaceAll('\r\n','\n'),gitFile(path).replaceAll('\r\n','\n'),path);
 }
 for(const file of ['HomeLayout.css','CareLayout.css','CareCompletion.css']){
  const path='src/app/components/'+file;
  assert.equal(readFileSync(path,'utf8').replaceAll('\r\n','\n'),gitFile(path,'17cfe4d').replaceAll('\r\n','\n'),path);
 }
});
