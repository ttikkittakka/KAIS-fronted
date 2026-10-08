import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const code=fs.readFileSync('public/design-preview/prototype.js','utf8');
function setup(hash='',raw=null,fail=false){
 const elements=new Map(),events=new Map();
 const element=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',setAttribute(){},focus(){},addEventListener(type,fn){events.set(selector+':'+type,fn);}});return elements.get(selector);};
 const location={hash};const context=vm.createContext({Intl,Date,JSON,Array,Object,String,Math,Set,Map,CSS:{escape:x=>x},console,window:{},location,
 document:{hidden:false,querySelector:s=>s==='#rive-canvas'?null:element(s),querySelectorAll:()=>[],addEventListener:(n,f)=>events.set(n,f)},
 matchMedia:()=>({matches:true,addEventListener(){}}),localStorage:{getItem:()=>raw,setItem:(_,v)=>{if(fail)throw Error('storage blocked');raw=v;}},history:{replaceState:(_,__,s)=>{location.hash=s;},pushState:(_,__,s)=>{location.hash=s;}},
 addEventListener:(n,f)=>events.set(n,f),setInterval(){},clearTimeout(){},setTimeout(){}});
 vm.runInContext(code,context);
 return {run:s=>vm.runInContext(s,context),html:()=>element('#prototype').innerHTML,raw:()=>raw,hash:()=>location.hash,event:n=>events.get(n)?.({key:'little-garden.design-prototype.v1'}),click:dataset=>events.get('#prototype:click')({target:{closest:()=>({dataset,disabled:false})}}),error:()=>element('#form-error').innerHTML};
}
test('five MVP screens render using original character assets',()=>{const app=setup();for(const name of ['onboarding','home','checkin','care','garden'])assert.match(app.run(`screen('${name}',false,true)`),/class="screen/);assert.match(app.html(),/오늘의 나를<br>만나러 가볼까요/);app.click({view:'home'});assert.match(app.html(),/오늘의 나 기록하기/);});
test('check-in must save before care, and three actions retain the low mood',()=>{const a=setup('#care');assert.equal(a.hash(),'#onboarding');a.click({view:'home'});a.click({view:'care'});assert.equal(a.hash(),'#checkin');for(const answer of ['많이 힘들었어요','낮음','조금 먹었어요','조금 무거워요']){a.click({answer});a.click({action:'next'});}a.click({action:'save'});assert.equal(a.hash(),'#care');for(const care of ['walk','water','sky']){a.click({care});a.click({care});}assert.match(a.html(),/세 가지를 해냈어요/);const r=JSON.parse(a.raw()).records[a.run('day()')];assert.equal(r.state,'low');assert.equal(r.cares.length,3);const again=setup('#care',a.raw());assert.equal(again.hash(),'#onboarding');again.click({view:'home'});assert.equal(again.hash(),'#home');assert.match(again.html(),/기록 확인하기/);});
test('failed save retains input and blocks care',()=>{const a=setup('#care',null,true);a.click({view:'home'});a.click({view:'checkin'});a.run("answers=QUESTIONS.map(q=>q[1][0]);note='입력 유지';saveCheckin(false)");assert.equal(a.hash(),'#checkin');assert.equal(a.run('note'),'입력 유지');assert.match(a.error(),/저장하지 못했어요/);assert.equal(a.raw(),null);});
test('same-day record does not duplicate accumulated dates',()=>{const a=setup();a.run('answers=QUESTIONS.map(q=>q[1][3]);saveCheckin(false)');a.run('saveCheckin(false)');assert.equal(Object.keys(JSON.parse(a.raw()).records).length,1);});
test('contrast of body, secondary and primary button passes 4.5:1',()=>{function l(h){const c=h.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}for(const [a,b] of [['293d32','f7f5ee'],['626e63','f7f5ee'],['ffffff','3f5d46'],['3f5d46','dfe8dc']])assert.ok((Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05)>=4.5);});
