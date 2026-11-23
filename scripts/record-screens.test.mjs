// React/event adapters only. These tests do not verify browser layout, keyboard or camera UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
import { installPhotoDb } from './helpers/fake-photo-db.mjs';
const store = loadTs(new URL('../src/app/record-store.ts', import.meta.url));
const daily = loadTs(new URL('../src/app/daily-checkin.ts', import.meta.url));
const cares = loadTs(new URL('../src/app/daily-cares.ts', import.meta.url));
const compiled = ts.transpileModule(readFileSync(new URL('../src/app/components/RecordScreens.tsx', import.meta.url), 'utf8'), { compilerOptions: { target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX } }).outputText + '\nexports.LocalReflectionExtras = LocalReflectionExtras;';
function nodes(node,predicate) { if (!node || typeof node !== 'object') return []; return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(n => nodes(n,predicate))]; }
function text(node) { if (node == null || typeof node === 'boolean') return ''; if (typeof node !== 'object') return String(node); return [node.props?.children].flat(Infinity).map(text).join(''); }
function mount(name,props) {
  const slots=[],effects=[],listeners=new Map();let cursor=0;
  const react = {
    useSyncExternalStore(subscribe, getSnapshot) { const i=cursor++; if (!(i in slots)) slots[i]={cleanup:subscribe(()=>{})}; return getSnapshot(); },
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function' ? initial() : initial; return [slots[i],v=>{slots[i]=typeof v==='function' ? v(slots[i]) : v;}]; },
    useRef(initial) { const i=cursor++; if (!(i in slots)) slots[i]={current:initial}; return slots[i]; },
    useEffect(effect,deps) { const i=cursor++; const old=slots[i]; if (!old || deps.some((d,j)=>!Object.is(d,old.deps[j]))) { slots[i]={deps,cleanup:old?.cleanup}; effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=effect();}); } }
  };
  const jsx=(type,props)=>({type,props});const exports={};let urls=0,revoked=0;
  runInNewContext(compiled,{exports,Blob,AbortController,queueMicrotask,crypto:globalThis.crypto,URL:{createObjectURL:()=> 'blob:test-'+(++urls),revokeObjectURL(){revoked++;}},window:{addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)},require: name => name.endsWith('.module.css') ? {default:{editor:'editor',input:'input',count:'count',save:'save',status:'status'}} : name==='react' ? react : name==='react/jsx-runtime' ? {jsx,jsxs:jsx,Fragment:'fragment'} : name==='@astryxdesign/core/Button' ? {Button:'button'} : name.startsWith('./') ? {HelpLink:()=>null,Icon:()=>null,default:()=>null,cameraSupported:()=>false} : loadTs(new URL('../src/app/'+name.replace('../','')+'.ts',import.meta.url))});
  function render(){cursor=0;const tree=exports[name](props);effects.splice(0).forEach(fn=>fn());return tree;}
  render();
  return { tree:render,button(label){return nodes(render(),n=>n.type==='button'&&(n.props.label??text(n))===label)[0];},listeners,get revoked(){return revoked;},unmount(){for(const slot of slots)slot?.cleanup?.();},remount(){for(const slot of slots)slot?.cleanup?.();slots.length=0;render();} };
}
function setup(){const data=new Map();globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};globalThis.createImageBitmap=async()=>({width:1200,height:800,close(){}});globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toBlob:fn=>fn(new Blob(['pixels'],{type:'image/jpeg'}))})};return data;}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('saved mood is read-only, uses every saved answer label and hides missing answers',()=>{
 for(const [answer,label]of [['very_low','많이 지쳐요'],['low','조금 무거워요'],['normal','잔잔해요'],['good','괜찮아요'],['very_good','가벼워요']]){
  const app=mount('SavedMood',{answers:['normal','normal','normal',answer]});
  assert.equal(text(app.tree()),'♡오늘의 마음 · '+label);assert.equal(app.tree().type,'p');assert.equal(app.tree().props.onClick,undefined);
 }
 for(const answer of ['',undefined,'invalid'])assert.equal(mount('SavedMood',{answers:['normal','normal','normal',answer]}).tree(),null);
});

test('comment primary action distinguishes disabled, saving, failure and confirmed success',async()=>{
 setup();let finish;
 const comment={text:'',saved:'',onEdit(value){comment.text=value;},onSave(){return new Promise(resolve=>{finish=resolve;});}};
 const app=mount('AccountPhotoPreview',{comment,onPending(){},onSave:async()=>true});
 nodes(app.tree(),n=>n.type==='input'&&!n.props.capture)[0].props.onChange({target:{files:[{type:'image/jpeg',size:12}],value:'file'}});
 await flush();await flush();app.button('이 사진 저장하기').props.onClick();await flush();
 assert.equal(app.button('코멘트 저장').props.disabled,true);
 nodes(app.tree(),n=>n.type==='textarea')[0].props.onChange({target:{value:'draft'}});
 assert.match(app.button('코멘트 저장').props.className,/primary-button/);assert.equal(app.button('코멘트 저장').props.disabled,false);
 app.button('코멘트 저장').props.onClick();assert.equal(app.button('저장 중…').props.disabled,true);assert.equal(app.button('저장 중…').props['aria-busy'],true);
 finish(false);await flush();assert.equal(app.button('저장 실패 · 다시 저장').props.disabled,false);assert.equal(comment.text,'draft');
 app.button('저장 실패 · 다시 저장').props.onClick();comment.saved='draft';finish(true);await flush();
 assert.equal(app.button('✓ 저장 완료').props.disabled,true);assert.match(text(app.tree()),/코멘트를 저장했어요/);
 nodes(app.tree(),n=>n.type==='textarea')[0].props.onChange({target:{value:''}});assert.equal(app.button('코멘트 저장').props.disabled,false);app.unmount();
});

test('account photo uses original optional comment field and retains text after partial failure and navigation',async()=>{
 setup();let pending=false,calls=0,received;
 const comment={text:'',saved:'',onEdit(value){comment.text=value;},async onSave(){return true;}};
 const props={comment,onPending:value=>pending=value,onSave:async(_blob,_id,_signal,value)=>{calls++;received=value;return false;}};
 const app=mount('AccountPhotoPreview',props);
 assert.equal(nodes(app.tree(),n=>n.type==='textarea').length,0);
 nodes(app.tree(),n=>n.type==='input'&&!n.props.capture)[0].props.onChange({target:{files:[{type:'image/jpeg',size:12}],value:'file'}});
 await flush();await flush();
 const field=nodes(app.tree(),n=>n.type==='textarea')[0];assert.equal(field.props.id,'photo-comment');assert.match(field.props.className,/comment-input/);assert.equal(field.props.maxLength,100);
 field.props.onChange({target:{value:'x'.repeat(101)}});assert.equal(comment.text.length,100);
 app.button('이 사진 저장하기').props.onClick();await flush();assert.equal(calls,1);assert.equal(received,comment.text);assert.equal(pending,true);
 assert.equal(nodes(app.tree(),n=>n.type==='textarea')[0].props.value,comment.text);
 app.unmount();app.remount(); // Draft is owned by the account/day parent, not the photo component.
 assert.equal(comment.text.length,100);app.unmount();
});

test('account confirmation keeps preview on failure, blocks double clicks and clears pending only on success',async()=>{
 setup();let calls=0,finish,pending=false;
 const app=mount('AccountPhotoPreview',{onPending:v=>pending=v,onSave:async()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 const input=nodes(app.tree(),n=>n.type==='input'&&!n.props.capture)[0];
 input.props.onChange({target:{files:[{type:'image/jpeg',size:12,name:'selected.jpg'}],value:'file'}});await flush();await flush();
 const save=app.button('이 사진 저장하기');assert.equal(save.props.disabled,false);
 save.props.onClick();save.props.onClick();assert.equal(calls,1);assert.equal(pending,true);
 finish(false);await flush();assert.equal(nodes(app.tree(),n=>n.type==='img').length,1);assert.equal(pending,true);
 app.button('이 사진 저장하기').props.onClick();assert.equal(calls,2);finish(true);await flush();assert.equal(pending,false);assert.equal(app.button('이 사진 저장하기'),undefined);
});

test('server month markers use the original calendar and selecting a date delegates only a read',()=>{
 const picked=[];const app=mount('RecordsCalendar',{records:[],recordedDates:['2026-11-16','2026-11-17'],today:'2026-11-18',readOnly:true,onSave:()=>assert.fail('write'),onDate:d=>picked.push(d)});
 const days=nodes(app.tree(),n=>n.type==='button'&&n.props['aria-label']?.includes('2026-11-16'));
 assert.equal(days.length,1);assert.match(days[0].props['aria-label'],/기록 있음/);
 days[0].props.onClick();assert.deepEqual(picked,['2026-11-16']);
});

test('account photo picker opens the native input and previews only in memory with cancellation and remount isolation',async()=>{
  const storage=setup(),db=installPhotoDb();let pending=false,clicks=0;
  const before=JSON.stringify([...storage]);
  const app=mount('AccountPhotoPreview',{onPending:value=>pending=value});
  const input=nodes(app.tree(),n=>n.type==='input'&&!n.props.capture)[0];
  input.props.ref.current={click(){clicks++;}};
  app.button('사진 선택').props.onClick();assert.equal(clicks,1);
  input.props.onChange({target:{files:[{type:'image/jpeg',size:100}],value:'file'}});
  await flush();assert.equal(pending,true);assert.match(nodes(app.tree(),n=>n.type==='img')[0].props.src,/^blob:/);
  assert.equal(app.button('이 사진 저장하기').props.disabled,true);
  assert.equal(db.files.size,0);assert.equal(JSON.stringify([...storage]),before);
  app.button('선택 취소').props.onClick();assert.equal(pending,false);assert.equal(nodes(app.tree(),n=>n.type==='img').length,0);assert.equal(app.revoked,1);
  input.props.onChange({target:{files:[{type:'image/jpeg',size:100}],value:'file'}});await flush();
  app.remount();assert.equal(nodes(app.tree(),n=>n.type==='img').length,0);assert.equal(app.revoked,2);assert.equal(db.files.size,0);
  app.unmount();
});

test('late account photo preparation cannot restore an image after unmount',async()=>{
  setup();let resolve;
  globalThis.createImageBitmap=()=>new Promise(r=>{resolve=r;});
  const app=mount('AccountPhotoPreview',{onPending(){}});
  nodes(app.tree(),n=>n.type==='input'&&!n.props.capture)[0].props.onChange({target:{files:[{type:'image/jpeg',size:100}],value:'file'}});
  app.unmount();resolve({width:10,height:10,close(){}});await flush();
  app.remount();assert.equal(nodes(app.tree(),n=>n.type==='img').length,0);
  app.unmount();
});
test('failed text save retains draft, blocks progression, retries, accepts edits and deletes',()=>{
  let fail=true,pending=false;const writes=[];const props={id:'note',value:'',maxLength:300,placeholder:'한마디',allowDelete:true,onPending:v=>pending=v,onSave:value=>{writes.push(value);if(fail)return false;props.value=value;return true;}};
  const app=mount('SavedTextField',props);
  nodes(app.tree(),n=>n.type==='textarea')[0].props.onChange({target:{value:'저장되지 않아도 남아야 해요'}});
  assert.equal(nodes(app.tree(),n=>n.type==='textarea')[0].props.value,'저장되지 않아도 남아야 해요');assert.ok(pending);assert.ok(app.listeners.has('beforeunload'));
  app.remount();assert.equal(nodes(app.tree(),n=>n.type==='textarea')[0].props.value,'저장되지 않아도 남아야 해요');
  fail=false;app.button('다시 저장').props.onClick();assert.equal(pending,false);assert.equal(props.value,'저장되지 않아도 남아야 해요');
  app.button('한마디 삭제').props.onClick();assert.equal(props.value,'');assert.ok(writes.length===3);
});
test('suggestions remain editable and textarea enforces maximum length in save callbacks',()=>{
  const props={id:'note',value:'',maxLength:300,placeholder:'한마디',suggestions:['오늘도 수고했어.'],onSave:value=>{props.value=value;return true;}};const app=mount('SavedTextField',props);
  app.button('오늘도 수고했어.').props.onClick();assert.equal(props.value,'오늘도 수고했어.');
  nodes(app.tree(),n=>n.type==='textarea')[0].props.onChange({target:{value:'가'.repeat(301)}});assert.equal(props.value.length,300);
});
test('photo select previews, cancel unlocks next, and saving writes exactly one linked Blob',async()=>{
  setup();const db=installPhotoDb();let pending=false;const props={record:store.saveRecord(store.emptyRecord()),onSave:r=>{props.record=store.saveRecord(r);return true;},onPending:v=>pending=v};const app=mount('PhotoEditor',props);
  const select=()=>nodes(app.tree(),n=>n.type==='input'&&n.props.capture===undefined)[0].props.onChange({target:{files:[{type:'image/jpeg',size:100}],value:'file'}});
  select();await flush();app.tree();await flush();assert.ok(pending);assert.match(nodes(app.tree(),n=>n.type==='img')[0].props.src,/blob:/);
  app.remount();await flush();assert.match(nodes(app.tree(),n=>n.type==='img')[0].props.src,/blob:/); // Same-page step/back navigation recreates component, not its draft cache.
  app.button('선택 취소').props.onClick();assert.equal(pending,false);assert.equal(db.files.size,0);
  select();await flush();app.tree();await flush();app.button('이 사진 저장하기').props.onClick();await flush();app.tree();
  assert.equal(pending,false);assert.equal(db.files.size,1);assert.ok(props.record.photoId);assert.ok(db.files.get(props.record.photoId) instanceof Blob);assert.ok(app.revoked>=1);
  app.unmount();
});
test('photo deletion saves cleared metadata and offers retry until Blob is actually removed',async()=>{
  setup();const db=installPhotoDb();const id=store.localOwner()+':'+daily.localDay()+':photo';await store.photoOperation(id,'write',new Blob(['photo']));
  const props={record:store.saveRecord({...store.emptyRecord(),photoId:id,photoComment:'설명'}),onSave:r=>{props.record=store.saveRecord(r);return true;}};const app=mount('PhotoEditor',props);
  db.failure='delete';app.button('사진과 코멘트 삭제').props.onClick();await flush();
  assert.equal(props.record.photoId,undefined);assert.equal(props.record.photoComment,'');assert.ok(db.files.has(id));assert.ok(app.button('사진 정리 다시 시도'));
  app.button('사진 정리 다시 시도').props.onClick();await flush();assert.equal(db.files.has(id),false);assert.equal(app.button('사진 정리 다시 시도'),undefined);
});
test('calendar connects all four answers, note, photo, comment and finished activities',()=>{
  const date=daily.localDay();const answers=['good','normal','low','very_low'];const rec=cares.ensureCareHistory(date,answers);const record={...store.emptyRecord(),answers,note:'오늘도 수고했어.',photoId:'test:'+date+':photo',photoComment:'기억할 장면',careRecommendations:rec,completedCareIds:[rec[0].ids[0]]};
  const app=mount('RecordsCalendar',{records:[record],onSave:()=>true});const content=text(app.tree());
  for(const value of ['괜찮게 잤어요','보통','조금 먹었어요','많이 지쳐요','기억할 장면','오늘도 수고했어.','마친 활동 1개'])assert.ok(content.includes(value));
  assert.equal(nodes(app.tree(),n=>n.type==='li').length,1);assert.equal(nodes(app.tree(),n=>typeof n.type==='function'&&n.type.name==='PhotoPreview')[0].props.id,record.photoId);
  app.button('일기 수정').props.onClick();assert.ok(nodes(app.tree(),n=>typeof n.type==='function'&&n.type.name==='PhotoEditor').length);
  app.button('다음 달').props.onClick();assert.match(text(app.tree()),/이날에 남긴 일기가 없어요/);
  app.button('이전 달').props.onClick();const day=nodes(app.tree(),n=>n.props?.['aria-label']===date+' 많이 지침')[0];day.props.onClick();assert.match(text(app.tree()),/기억할 장면/);
});
test('optional photo and growth screens offer the existing next action without mandatory input',()=>{
  for(const kind of ['photo','growth']) {let next=0;const app=mount('LocalReflectionExtras',{kind,record:store.emptyRecord(),onSave:()=>true,onBack(){},onNext:()=>next++});
    const primary=app.button(kind==='photo' ? '성장하기로 이어가기' : '일기 닫기');assert.equal(primary.props.disabled,false);primary.props.onClick();assert.equal(next,1);
    assert.match(text(app.tree()),kind==='photo' ? /사진 없이도/ : /글 없이도/);
  }
});

test('photo transaction quota failure preserves old photo and pending replacement for retry', async () => {
  setup(); const db = installPhotoDb(); const id = store.localOwner() + ':' + daily.localDay() + ':old';
  await store.photoOperation(id, 'write', new Blob(['old']));
  const props = { record: store.saveRecord({ ...store.emptyRecord(), photoId: id }), onSave(record) { props.record = store.saveRecord(record); return true; } };
  const app = mount('PhotoEditor', props);
  nodes(app.tree(), n => n.type === 'input')[0].props.onChange({ target: { files: [{ type: 'image/jpeg', size: 100 }], value: 'file' } });
  await flush(); db.failure = 'write'; app.button('이 사진 저장하기').props.onClick(); await flush();
  assert.match(text(app.tree()), /저장 공간이 부족/); assert.equal(props.record.photoId, id); assert.ok(db.files.has(id)); assert.ok(app.button('이 사진 저장하기'));
  app.button('이 사진 저장하기').props.onClick(); await flush(); assert.notEqual(props.record.photoId, id); assert.equal(db.files.size, 1); app.unmount();
});

test('record calendar preserves completed retired activities without repeating unused recommendations', () => {
  const date = daily.localDay();
  const record = { ...store.emptyRecord(), answers: ['good','good','good','good'], careRecommendations: [{ date, title: '과거 추천', ids: ['warm-drink','walk','emoji'] }], completedCareIds: ['warm-drink','emoji'] };
  const app = mount('RecordsCalendar', { records: [record], onSave: () => true });
  const items = nodes(app.tree(), n => n.type === 'li').map(text);
  assert.deepEqual(items, ['따뜻한 음료 마시기', '이모지 하나 보내기']);
});

test('read-only calendar never mounts local photo or text editors even with a photo ID', () => {
 const record = { version: 1, userId: 'account', date: daily.localDay(), answers: ['normal','normal','normal','normal'], note: 'server note', photoId: 'legacy-must-not-open', completedCareIds: [], plantState: 'normal' };
 const previous = globalThis.localStorage;
 globalThis.localStorage = { getItem() { throw Error('local read'); }, setItem() { throw Error('local write'); } };
 try {
  const app = mount('RecordsCalendar', { readOnly: true, records: [record], onSave() { throw Error('write'); } });
  assert.equal(app.button('기록 수정'), undefined);
  assert.equal(nodes(app.tree(), n => ['PhotoPreview', 'PhotoEditor', 'NoteEditor'].includes(n.type?.name)).length, 0);
  assert.match(text(app.tree()), /server note/);
 } finally { globalThis.localStorage = previous; }
});
