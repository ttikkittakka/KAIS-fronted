import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const { createAccountReflectionStore } = loadTs(new URL('../src/lib/account-reflection/store.ts', import.meta.url));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const date = '2026-11-13', project = 'yhzgucbiwvizjxpzwpqg';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const fixture = (answers = ['', '', '', ''], revision = 0, userId = A) => ({ project, userId, date, today: date, sunshineBalance: 0, cares: [], rewards: [], record: { user_id: userId, record_date: date, answers, revision, stage: 'checkin', plant_state: 'normal', note: '', photo_comment: '', recommendation_title: null } });
function ui(store, options = {}) {
 const slots = []; let cursor = 0;
 const effects = [];
 const react = { useState(init) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; }, useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; }, useEffect(fn) { if (options.effects) effects.push(fn); }, useSyncExternalStore: (_sub, get) => get() };
 const jsx = (type, props) => ({ type, props });
 function load(name) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/app/components/' + name + '.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { exports, setTimeout() { throw Error('Account progress must await server, not timer'); }, require(path) {
   if (path === 'react') return react;
   if (path === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
   if (path === './OneStepScreens') return screens;
   if (path.startsWith('../')) return loadTs(new URL('../src/app/components/' + path + '.ts', import.meta.url));
   return new Proxy({}, { get: (_target, key) => key });
  }}); return exports;
 }
 const screens = load('OneStepScreens'), wrapper = load('AccountReflection');
 const render = () => { cursor = 0; const root = wrapper.default({ store, onBack() {}, ...options }); const screen = screens.CheckinScreen(root.props); effects.splice(0).forEach(fn => fn()); return screen; };
 const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat().flatMap(nodes)];
 const text = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : [n.props?.children].flat().map(text).join('');
 const button = label => nodes(render()).find(n => n.type === 'button' && text(n) === label);
 return { render, text: () => text(render()), button, choose() { const choice = nodes(render()).find(n => n.type === 'button' && n.props.className === ''); assert.ok(choice); assert.equal(choice.props.disabled, false); choice.props.onClick(); }, nodes: () => nodes(render()) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('saved answers reuse original question controls, review all four without writes and survive failed refresh', async () => {
 const { QUESTIONS } = loadTs(new URL('../src/app/questions.ts', import.meta.url));
 const answers = ['good','low','normal','very_low']; let fail = false;
 const store=createAccountReflectionStore(async()=> { if(fail) throw Error('offline'); return json(fixture(answers,4)); });
 store.setSession({userId:A,token:'mock'}); await store.load();
 let completion={phase:'recover',day:null,error:'reflection-commit-not-ready'};
 const commitStore={subscribe(){},getSnapshot:()=>completion};
 const app=ui(store,{commitStore});
 for(const [i,q] of QUESTIONS.entries()) {
  assert.ok(app.text().includes(q.title.replaceAll('\n','')));
  const selected=app.nodes().find(n=>n.type==='button'&&n.props.className==='selected');
  assert.ok(selected);assert.equal(selected.props.disabled,true);
  assert.ok(app.text().includes(q.options.find(o=>o.value===answers[i]).label));
  app.button(i===3?'첫 질문 다시 보기':'다음 질문 보기').props.onClick();
 }
 assert.equal(app.button('다시 시도'),undefined);
 assert.equal(app.button('맞춤 돌봄 다시 연결하기'),undefined);
 fail=true;app.button('저장된 답변 다시 확인').props.onClick();await flush();
 assert.equal(app.nodes().filter(n=>n.props?.className==='choice-list').length,1);
 assert.deepEqual(store.getSnapshot().answers,answers);
 completion={phase:'recover',day:null,error:'read-before-retry'};
 assert.equal(app.button('맞춤 돌봄 다시 연결하기'),undefined);
 completion={phase:'committed',day:null,error:null};
 assert.match(app.text(),/이어서 오늘의 기록을 마쳐/);
 assert.doesNotMatch(app.text(),/오늘의 돌아보기를 마쳤어요/);
});

test('partial records resume next question; complete records review from first question without automatic commit', async () => {
 for (const [answers, count] of [[['','','',''],0], [['normal','low','',''],2], [['normal','low','normal','low'],4]]) {
  const store = createAccountReflectionStore(async () => json(fixture(answers, count)));
  store.setSession({userId:A,token:'mock'}); await store.load();
  let finishes=0;
  const app=ui(store,{effects:true,onFinish:async()=>{finishes++;}});
  if(count<4) { assert.match(app.text(),new RegExp(`${count+1} / 4`)); assert.equal(finishes,0); }
  else {
   assert.match(app.text(),/저장된 답변을 확인하고 있어요/);
   assert.doesNotMatch(app.text(),/4 \/ 4|초안|revision|commit|돌아보기 확정/);
   assert.equal(app.nodes().filter(n=>n.props?.className==='choice-list').length,1);
   assert.equal(finishes,0);
  }
 }
});

test('completed A state is hidden while B loads and B resumes its own next unanswered question',async()=>{
 let owner=A;
 const store=createAccountReflectionStore(async()=>json(fixture(owner===A?['normal','normal','normal','low']:['good','','',''],owner===A?4:1,owner)));
 store.setSession({userId:A,token:'mock'});await store.load();const app=ui(store);
 assert.match(app.text(),/저장된 답변을 확인/);
 owner=B;store.setSession({userId:B,token:'mockB'});
 assert.doesNotMatch(app.text(),/저장된 답변을 확인|4 \/ 4|조금 무거워요/);
 await store.load();assert.match(app.text(),/2 \/ 4/);assert.equal(store.getSnapshot().revision,1);
});

test('real question UI waits for each mocked API acknowledgement; four answers stop at draft, restore revision', async () => {
 let record = fixture(), finish; const posts = [];
 const store = createAccountReflectionStore(async (url, init) => {
  if (init.method === 'GET') return json(record);
  posts.push(url); const body = JSON.parse(init.body);
  return new Promise(resolve => { finish = () => { record = fixture(body.answers, body.revision + 1); resolve(json({ project, userId: A, date, revision: body.revision + 1, changed: true })); }; });
 });
 store.setSession({ userId: A, token: 'mock' }); await store.load(); const app = ui(store);
 for (let q = 0; q < 4; q++) {
  app.choose(); assert.equal(store.getSnapshot().question, q); assert.match(app.text(), /저장하고 있어요/);
  finish(); await flush(); assert.equal(store.getSnapshot().question, q + 1);
 }
 assert.equal(app.nodes().filter(n => n.props?.className === 'choice-list').length, 1); assert.match(app.text(),/저장된 답변을 확인/); assert.doesNotMatch(app.text(), /revision|commit/);
 assert.deepEqual(posts, Array(4).fill('/api/account/reflection/draft'));
 const restored = createAccountReflectionStore(async () => json(record)); restored.setSession({ userId: A, token: 'mock' }); await restored.load();
 assert.equal(restored.getSnapshot().revision, 4); assert.equal(restored.getSnapshot().phase, 'draft-complete');
});

test('explicit UI start hits day API; disabled response never claims success or advances', async () => {
 const calls = []; const store = createAccountReflectionStore(async (url, init) => { calls.push([url, init.method]); return init.method === 'GET' ? json({ ...fixture(), record: null }) : json({ error: 'reflection-not-ready' }, 503); });
 store.setSession({ userId: A, token: 'mock' }); await store.load(); const app = ui(store);
 app.button('오늘의 상태 기록하기').props.onClick(); await flush(); assert.match(app.text(), /지금은 답변을 저장할 수 없어요/);
 assert.equal(store.getSnapshot().question, 0); assert.deepEqual(calls.map(c => c[0]), ['/api/account/records', '/api/account/day/start']);
 app.button('다시 시도').props.onClick(); await flush(); assert.ok(app.button('오늘의 상태 기록하기'));
});

test('draft failure keeps selected answer across screen remount and same revision retry', async () => {
 let fail = true; const revisions = [];
 const store = createAccountReflectionStore(async (_url, init) => {
  if (init.method === 'GET') return json(fixture());
  const body = JSON.parse(init.body); revisions.push(body.revision);
  if (fail) throw Error('network');
  return json({ project, userId: A, date, revision: 1, changed: true });
 });
 store.setSession({ userId: A, token: 'mock' }); await store.load(); let app = ui(store); app.choose(); await flush();
 const pending = [...store.getSnapshot().answers]; app = ui(store);
 assert.ok(app.nodes().some(n => n.props?.className === 'selected')); assert.match(app.text(), /저장 확인 전/);
 fail = false; app.button('다시 시도').props.onClick(); await flush();
 assert.deepEqual(revisions, [0, 0]); assert.deepEqual(store.getSnapshot().answers, pending); assert.equal(store.getSnapshot().question, 1);
});

test('conflict reload requires explicit discard, failed reload retains answers; A late response cannot enter B UI', async () => {
 let failRead = false;
 const store = createAccountReflectionStore(async (_url, init) => { if (init.method === 'POST') return json({ error: 'revision-conflict' }, 409); if (failRead) throw Error('network'); return json(fixture()); });
 store.setSession({ userId: A, token: 'mock' }); await store.load(); const app = ui(store); app.choose(); await flush(); const pending = [...store.getSnapshot().answers];
 app.button('최신 기록 불러오기').props.onClick(); assert.deepEqual(store.getSnapshot().answers, pending);
 app.button('답변 계속 보관하기').props.onClick(); assert.equal(store.getSnapshot().phase, 'conflict');
 app.button('최신 기록 불러오기').props.onClick(); failRead = true;
 app.button('내 미저장 답변 버리고 불러오기').props.onClick(); await flush(); assert.deepEqual(store.getSnapshot().answers, pending); assert.equal(store.getSnapshot().pending, true);
 let finish;
 // Use a separate valid GET fixture per account.
 let owner = A; const isolated = createAccountReflectionStore(async (_url, init) => init.method === 'GET' ? json(fixture(undefined, 0, owner)) : new Promise(resolve => { finish = resolve; }));
 isolated.setSession({ userId: A, token: 'A' }); await isolated.load(); ui(isolated).choose();
 isolated.setSession({ userId: A, token: 'renewed' }); assert.equal(isolated.getSnapshot().pending, true);
 owner = B; isolated.setSession({ userId: B, token: 'B' }); await isolated.load();
 finish(json({ project, userId: A, date, revision: 1, changed: true })); await flush();
 assert.deepEqual(isolated.getSnapshot().answers, ['', '', '', '']); assert.doesNotMatch(ui(isolated).text(), /초안이 서버에 저장/);
 isolated.dispose(); assert.equal(isolated.getSnapshot().revision, null);
});

test('fourth saved answer triggers read-only continuation once without forcing review or committing',async()=>{
 let saved=fixture(['normal','normal','normal',''],3),resumes=0;
 const store=createAccountReflectionStore(async(path,init)=>{if(init.method==='POST'){const body=JSON.parse(init.body);saved=fixture(body.answers,4);return json({project,userId:A,date,revision:4,changed:true});}return json(saved);});
 store.setSession({userId:A,token:'mock'});await store.load();
 const app=ui(store,{effects:true,onResume:async()=>{resumes++;},onFinish:async()=>assert.fail('automatic commit')});app.render();
 await store.saveAnswer(3,'normal');app.render();app.render();await flush();
 assert.equal(resumes,1);assert.equal(app.button('\uB2E4\uC74C \uC9C8\uBB38 \uBCF4\uAE30'),undefined);assert.ok(app.nodes().some(n=>n.type==='button'&&n.props.className==='primary-button'));
});

test('restored four-answer draft waits for the existing continue button even when capability arrives later', async () => {
 const store=createAccountReflectionStore(async()=>json(fixture(['normal','normal','normal','normal'],4)));
 store.setSession({userId:A,token:'mock'}); await store.load();
 let resumes=0,finishes=0;
 const options={effects:true,commitEnabled:false,onResume:async()=>{resumes++;},onFinish:async()=>{finishes++;}};
 const app=ui(store,options); app.render(); options.commitEnabled=true; app.render();app.render();await flush();
 assert.equal(resumes,0);assert.equal(finishes,0);
 app.button('기록 이어가기').props.onClick();await flush();assert.equal(finishes,1);
 const remounted=ui(store,options);remounted.render();assert.equal(resumes,0);
 store.setSession(null);store.setSession({userId:A,token:'renewed'});await store.load();
 ui(store,options).render();assert.equal(resumes,0);assert.equal(finishes,1);
});

test('new fourth-answer acknowledgement with capability resumes once; rerenders do not retry completion', async () => {
 let saved=fixture(['normal','normal','normal',''],3),resumes=0;
 const store=createAccountReflectionStore(async(_path,init)=>{
  if(init.method==='POST'){saved=fixture(JSON.parse(init.body).answers,4);return json({project,userId:A,date,revision:4,changed:true});}
  return json(saved);
 });
 store.setSession({userId:A,token:'mock'});await store.load();
 const app=ui(store,{effects:true,commitEnabled:true,onResume:async()=>{resumes++;},onFinish:async()=>{}});
 app.render();await store.saveAnswer(3,'normal');app.render();await flush();app.render();
 assert.equal(resumes,1);
});
