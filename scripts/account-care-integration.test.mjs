import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {loadTs} from './helpers/load-ts.mjs';
const lib=name=>loadTs(new URL('../src/lib/'+name+'.ts',import.meta.url));
const {createAccountCommitStore}=lib('account-reflection/commit-store');
const {createAccountRecordsStore}=lib('account-records/store');
const {createAccountReflectionStore}=lib('account-reflection/store');
const {recommendAccountReflection}=lib('account-reflection/recommendation-server');
const {displayCareRecommendation}=loadTs(new URL('../src/app/daily-cares.ts',import.meta.url));
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date='2026-11-16';
function draft(id){return {project:'yhzgucbiwvizjxpzwpqg',userId:id,today:date,date,sunshineBalance:0,
 record:{user_id:id,record_date:date,answers:['normal','normal','normal','normal'],stage:'checkin',plant_state:'normal',note:'',photo_comment:'',recommendation_title:null,revision:4},cares:[],rewards:[]};}
function committed(day){const saved=structuredClone(day),r=recommendAccountReflection(day,[]),owner={user_id:day.userId,record_date:date};
 saved.record.stage='photo';saved.record.revision++;saved.record.recommendation_title=r.title;
 saved.cares=r.ids.map((care_id,i)=>({...owner,care_id,position:i+1,catalog_version:2,completed_at:null}));
 saved.rewards=[{...owner,event_key:date+':reflection',reason:'reflection',delta:10,policy_version:1}];saved.sunshineBalance=10;return saved;
}
function mount(owner,db,{sealed=false,failRefresh=false,bookmarkStorage,activityEnabled=false,reflectionEnabled=false,historicalDay}={}){
 let posts=0,readsAfterCommit=0;const paths=[];
 const request=async(path,init)=>{
  paths.push(path);assert.equal(init.headers.Authorization,'Bearer mock-'+owner);
  if(init.method==='POST'){
   if(path==='/api/account/activity'){
    posts++;const input=JSON.parse(init.body),before=structuredClone(db.get(owner)),after=structuredClone(before);
    after.record.revision++;
    if(input.action==='photo_done')after.record.stage='growth';
    if(input.action==='growth_done'){after.record.stage='care';after.rewards.push({user_id:owner,record_date:date,event_key:date+':participation',reason:'participation',delta:5,policy_version:1});after.sunshineBalance+=5;}
    if(input.action==='care_done'){after.cares.find(c=>c.care_id===input.careId).completed_at=date+'T03:00:00Z';if(!after.rewards.some(r=>r.reason==='firstCare')){after.rewards.push({user_id:owner,record_date:date,event_key:date+':firstCare',reason:'firstCare',delta:10,policy_version:1});after.sunshineBalance+=10;}}
    db.set(owner,after);return Response.json({day:after,changed:true,effect:lib('account-activity/model').activityEffect(before,after,input,true,after.record.revision)});
   }
   assert.equal(path,'/api/account/reflection/commit');posts++;
   if(sealed)return Response.json({error:'reflection-commit-not-ready'},{status:503});
   db.set(owner,committed(db.get(owner)));return Response.json({day:db.get(owner),recovered:false});
  }
  if(posts&&++readsAfterCommit===2&&failRefresh)throw Error('snapshot unavailable');
  return Response.json(historicalDay && path.includes('?date='+historicalDay.date) ? historicalDay : db.get(owner));
 };
 const history=createAccountRecordsStore(request),today=createAccountRecordsStore(request),reflection=createAccountReflectionStore(request),commit=createAccountCommitStore(request);
 for(const s of [history,today,reflection,commit])s.setSession({userId:owner,token:'mock-'+owner});
 const activity=lib('account-activity/store').createAccountActivityStore(request);activity.setSession({userId:owner,token:'mock-'+owner});
 const garden={getSnapshot:()=>({phase:'ready',data:{userId:owner,today:date,garden:{sunshine_balance:0,active_days:0,layout_revision:0},placements:[],growthGrants:[],inventory:[]}}),subscribe(){},load(){},dispose(){}};
 const slots=[];let cursor=0,recordStore=0;const exports={};
 const jsx=(type,props)=>({type,props});
 const code=ts.transpileModule(readFileSync('src/app/components/AccountGarden.tsx','utf8').replace('const ACTIVITY_UI_ENABLED = false;', 'const ACTIVITY_UI_ENABLED = '+activityEnabled+';').replace('const REFLECTION_COMMIT_UI_ENABLED = false;', 'const REFLECTION_COMMIT_UI_ENABLED = '+reflectionEnabled+';'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,fetch:request,require(name){
  if(name==='react')return {useState(init){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],v=>{slots[i]=v;}];},useRef(value){const i=cursor++;return slots[i]??={current:value};},useEffect(){},useSyncExternalStore:(_,get)=>get()};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  if(name.endsWith('account-activity/store'))return {createAccountActivityStore:()=>activity};
  if(name.endsWith('account-garden/store'))return {createAccountGardenStore:()=>garden};
  if(name.endsWith('account-records/store'))return {createAccountRecordsStore:()=>recordStore++===0?history:today};
  if(name.endsWith('account-reflection/store'))return {createAccountReflectionStore:()=>reflection};
  if(name.endsWith('account-reflection/commit-store'))return {createAccountCommitStore:()=>commit};
  if(name.endsWith('account-activity/navigation')){const nav=lib('account-activity/navigation');return {accountResumeView:day=>nav.accountResumeView(day,bookmarkStorage),rememberAccountView:(day,view)=>nav.rememberAccountView(day,view,bookmarkStorage)};}
  if(name.startsWith('../../lib/'))return name.endsWith('/auth-client')?{}:loadTs(new URL('../src/'+name.slice(6)+'.ts',import.meta.url));
  if(name==='../daily-cares')return {displayCareRecommendation};
  if(name==='./AccountReflection')return {default:'Reflection'};
  if(name==='./PersonalGarden')return {usePersonalGarden:()=>null};
  return new Proxy({},{get:(_,key)=>String(key)});
 }});
 const flatten=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat().flatMap(flatten)];
 const render=()=>{cursor=0;return flatten(exports.default({userId:owner,onLogout(){}}));};
 return {async ready(){await today.load();await reflection.load();render();},find:type=>render().find(n=>n.type===type),get posts(){return posts;},paths,commit};
}
test('read-only continuation displays three already saved care cards in original CareScreen',async()=>{
 const db=new Map([[A,committed(draft(A))]]),app=mount(A,db);await app.ready();
 app.find('BottomNav').props.go('checkin');await new Promise(r=>setImmediate(r));assert.equal(app.posts,0);
 await app.find('Reflection').props.onFinish();
 assert.equal(app.find('ReflectionExtras').props.kind,'photo');
 app.find('ReflectionExtras').props.onNext();assert.equal(app.find('ReflectionExtras').props.kind,'growth');
 app.find('ReflectionExtras').props.onNext();
 const care=app.find('CareScreen');assert.ok(care);assert.equal(care.props.recommendation.cares.length,3);
 assert.deepEqual(Array.from(care.props.recommendation.cares,c=>c.id),db.get(A).cares.map(c=>c.care_id));
 assert.equal(care.props.recommendation.title,db.get(A).record.recommendation_title);assert.equal(care.props.readOnly,true);assert.equal(app.posts,0);
 care.props.goHome();assert.equal(app.find('HomeScreen').props.balance,10);assert.equal(app.find('HomeScreen').props.resume,'photo');
});
test('sealed or failed final snapshot never opens care or claims completion',async()=>{
 for(const options of [{sealed:true},{failRefresh:true}]){
  const db=new Map([[A,draft(A)]]),app=mount(A,db,options);await app.ready();
  app.find('BottomNav').props.go('checkin');await new Promise(r=>setImmediate(r));await app.find('Reflection').props.onFinish();
  assert.equal(app.find('CareScreen'),undefined);assert.equal(app.posts,0);
  if(options.sealed)assert.equal(db.get(A).cares.length,0);
 }
});
test('relogin restores saved recommendations and progress; account B never sees A or posts again',async()=>{
 const saved=committed(draft(A));saved.record.stage='care';saved.cares[1].completed_at=date+'T03:00:00Z';
 const db=new Map([[A,saved],[B,draft(B)]]);
 for(const owner of [A,B,A]){
  const app=mount(owner,db);await app.ready();const home=app.find('HomeScreen');
  assert.equal(home.props.recorded,owner===A);assert.equal(home.props.completedCount,owner===A?1:0);
  if(owner===A){home.props.go(home.props.resume);const care=app.find('CareScreen');assert.equal(care.props.recommendation.cares.length,3);assert.deepEqual(Array.from(care.props.completedIds),[saved.cares[1].care_id]);}
  assert.equal(app.posts,0);
 }
});

 test('saved photo stage resumes optional screens without writes across reload and account switch',async()=>{
 const saved=committed(draft(A)),db=new Map([[A,saved],[B,draft(B)]]);
 const before=JSON.stringify([...db]);
 for(const owner of [A,A,B,A]){
  const app=mount(owner,db);await app.ready();const home=app.find('HomeScreen');
  assert.equal(home.props.balance,owner===A?10:0);
  if(owner===A){
   assert.equal(home.props.resume,'photo');home.props.go(home.props.resume);
   const photo=app.find('ReflectionExtras');assert.equal(photo.props.readOnly,true);assert.equal(photo.props.kind,'photo');
   photo.props.onBack();await new Promise(r=>setImmediate(r));
   await app.find('Reflection').props.onFinish();assert.equal(app.posts,0);
   app.find('ReflectionExtras').props.onNext();app.find('ReflectionExtras').props.onNext();
   const care=app.find('CareScreen');assert.equal(care.props.recommendation.cares.length,3);assert.equal(care.props.completedIds.length,0);assert.equal(care.props.readOnly,true);
  }else{assert.equal(home.props.recorded,false);home.props.go('care');assert.equal(app.find('CareScreen'),undefined);}
  assert.equal(app.posts,0);
 }
 assert.equal(JSON.stringify([...db]),before);
 });

test('home ignores optional screen bookmark on remount and relogin without changing server stage or B',async()=>{
 const saved=committed(draft(A)),db=new Map([[A,saved],[B,draft(B)]]),values=new Map();
 const bookmarkStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const before=JSON.stringify([...db]);
 let app=mount(A,db,{bookmarkStorage});await app.ready();app.find('HomeScreen').props.go('photo');app.find('ReflectionExtras').props.onNext();
 app=mount(A,db,{bookmarkStorage});await app.ready();assert.equal(app.find('HomeScreen').props.resume,'photo');
 app.find('HomeScreen').props.go('growth');app.find('ReflectionExtras').props.onNext();
 for(const owner of [B,A,A]){app=mount(owner,db,{bookmarkStorage});await app.ready();assert.equal(app.find('HomeScreen').props.resume,owner===A?'photo':'checkin');assert.equal(app.find('HomeScreen').props.balance,owner===A?10:0);assert.equal(app.posts,0);}
 assert.equal(JSON.stringify([...db]),before);
 const nav=lib('account-activity/navigation');
 assert.equal(nav.accountResumeView({...saved,record:{...saved.record,revision:6}},bookmarkStorage),'photo');
 assert.equal(nav.accountResumeView({...saved,date:'2026-11-17',today:'2026-11-17'},bookmarkStorage),'photo');
 assert.equal(nav.accountResumeView(saved,{getItem(){throw Error('blocked');}}),'photo');
 assert.equal(nav.accountResumeView(saved,{getItem:()=>'{broken'}),'photo');
 assert.equal(nav.accountResumeView(saved,{getItem:()=>JSON.stringify({revision:5,view:'settings'})}),'photo');
});

test('prepared activity UI advances only verified snapshots and celebrates new care once',async()=>{
 const saved=committed(draft(A));saved.sunshineBalance=20;
 const db=new Map([[A,saved]]),app=mount(A,db,{activityEnabled:true});await app.ready();
 app.find('BottomNav').props.go('checkin');await new Promise(r=>setImmediate(r));await app.find('Reflection').props.onResume();
 const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
 app.find('ReflectionExtras').props.onNext();await settle();
 assert.equal(db.get(A).record.stage,'growth');assert.equal(app.find('ReflectionExtras').props.kind,'growth');assert.equal(db.get(A).sunshineBalance,20);
 app.find('ReflectionExtras').props.onNext();await settle();assert.equal(app.find('CareScreen').props.completed,null);assert.equal(db.get(A).sunshineBalance,25);
 const id=db.get(A).cares[0].care_id;app.find('CareScreen').props.onComplete(id);await settle();
 assert.equal(app.find('CareScreen').props.completed,id);assert.deepEqual(Array.from(app.find('CareScreen').props.completedIds),[id]);assert.equal(db.get(A).sunshineBalance,35);assert.equal(app.posts,3);
 app.find('CareScreen').props.onShowList();app.find('CareScreen').props.onComplete(id);await settle();assert.equal(app.posts,3);assert.equal(app.find('CareScreen').props.completed,null);
 const restored=mount(A,db,{activityEnabled:true});await restored.ready();restored.find('HomeScreen').props.go('care');assert.equal(restored.find('CareScreen').props.completed,null);assert.equal(restored.find('CareScreen').props.completedIds.length,1);assert.equal(restored.posts,0);
});

test('read-only question continuation follows exact server stage, ignoring browsing bookmark and sealed commit',async()=>{
 for(const stage of ['photo','growth','care']){
  const saved=committed(draft(A));saved.record.stage=stage;
  if(stage==='care'){saved.sunshineBalance=15;saved.rewards.push({user_id:A,record_date:date,event_key:date+':participation',reason:'participation',delta:5,policy_version:1});}
  const db=new Map([[A,saved]]);
  for(let reload=0;reload<2;reload++){const app=mount(A,db,{sealed:true,bookmarkStorage:{getItem:()=>JSON.stringify({revision:5,view:'care'})}});await app.ready();app.find('BottomNav').props.go('checkin');await new Promise(r=>setImmediate(r));await app.find('Reflection').props.onResume();
   if(stage==='care')assert.equal(app.find('CareScreen').props.recommendation.cares.length,3);else assert.equal(app.find('ReflectionExtras').props.kind,stage);
   assert.equal(app.posts,0);
  }
 }
});

test('midnight continuation reads displayed date and renders past growth without today substitution or POST',async()=>{
 const past=committed(draft(A));past.record.stage='growth';past.record.revision=6;const db=new Map([[A,past]]);
 const app=mount(A,db,{historicalDay:past});await app.ready();app.find('BottomNav').props.go('checkin');await new Promise(r=>setImmediate(r));
 const today=draft(A);today.today='2026-11-17';today.date='2026-11-17';today.record.record_date='2026-11-17';db.set(A,today);past.today='2026-11-17';
 await app.find('Reflection').props.onFinish();
 assert.equal(app.find('ReflectionExtras').props.kind,'growth');assert.equal(app.find('ReflectionExtras').props.record.date,'2026-11-16');assert.ok(app.paths.includes('/api/account/records?date=2026-11-16'));assert.equal(app.posts,0);
});

test('approved UI seam commits today once and opens photo only after saved Snapshot',async()=>{
 const db=new Map([[A,draft(A)]]),app=mount(A,db,{reflectionEnabled:true});await app.ready();app.find('BottomNav').props.go('checkin');await new Promise(r=>setImmediate(r));
 const reflection=app.find('Reflection');await Promise.all([reflection.props.onResume(),reflection.props.onFinish()]);
 assert.equal(app.posts,1);assert.equal(app.find('ReflectionExtras').props.kind,'photo');assert.equal(db.get(A).cares.length,3);assert.equal(db.get(A).sunshineBalance,10);
});

test('home resumes every server stage despite a care bookmark and never commits again',async()=>{
 const values=new Map(),bookmarkStorage={getItem:()=>JSON.stringify({revision:5,view:'care'}),setItem:(k,v)=>values.set(k,v)};
 for(const stage of ['checkin','photo','growth','care']){
  const a=stage==='checkin'?draft(A):committed(draft(A));a.record.stage=stage;
  if(stage==='care'){a.sunshineBalance=15;a.rewards.push({user_id:A,record_date:date,event_key:date+':participation',reason:'participation',delta:5,policy_version:1});}
  const db=new Map([[A,a],[B,draft(B)]]),before=JSON.stringify([...db]);
  for(const owner of [A,B,A]){const app=mount(owner,db,{bookmarkStorage});await app.ready();const home=app.find('HomeScreen');const expected=owner===A?stage:'checkin';
   assert.equal(home.props.resume,expected);home.props.go(home.props.resume);await new Promise(r=>setImmediate(r));
   if(expected==='checkin')assert.ok(app.find('Reflection'));else if(expected==='care')assert.equal(app.find('CareScreen').props.recommendation.cares.length,3);else assert.equal(app.find('ReflectionExtras').props.kind,expected);
   assert.equal(app.posts,0);
  }assert.equal(JSON.stringify([...db]),before);
 }
});
