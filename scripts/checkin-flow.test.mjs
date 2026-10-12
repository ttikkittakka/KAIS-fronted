// Exercise the page's navigation and persistence with browser/hook adapters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const daily = loadTs(new URL('../src/app/daily-checkin.ts', import.meta.url));
const { recommendCares } = loadTs(new URL('../src/app/recommend-cares.ts', import.meta.url));

const compiled = ts.transpileModule(readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText + '\nexports.CheckinScreen = CheckinScreen; exports.CareScreen = CareScreen; exports.HomeScreen = HomeScreen; exports.GardenScreen = GardenScreen; exports.BottomNav = BottomNav;';
const saved = { version: 1, date: daily.localDay(), answers: ['괜찮게 잤어요', '보통', '든든하게 먹었어요', '잔잔해요'], note: '기존 기록', plantState: 'normal', completedCareIds: ['water'] };
function mount(raw = null, hash = '', component = 'default', props = {}) {
  const slots = [], effects = [], tasks = [], listeners = new Map();
  let cursor = 0, first = true, failSave = false, interval;
  const data = new Map(raw ? [[daily.DAILY_KEY, raw]] : []);
  if (raw) { try { const owner = JSON.parse(raw).userId; if (owner) data.set('little-garden.local-owner.v1', owner); } catch {} }
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { if (failSave) throw Error('quota'); data.set(key, value); } }; 
  globalThis.localStorage = storage;
  const window = {
    location: new URL('http://localhost:3000/' + hash),
    history: { state: {}, replaceState(state, _, url) { this.state = state; window.location = new URL(url); }, pushState(state, _, url) { this.replaceState(state, _, url); } },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {}, setInterval(fn) { interval = fn; return 1; }
  };
  const react = {
    useCallback(fn) { return fn; },
    useState(initial) { const i = cursor++; if (first) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (first) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect) { if (first) effects.push(effect); }
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  runInNewContext(compiled, { exports, URL, crypto: { randomUUID: () => 'test-owner' }, localStorage: storage, window,
    document: { visibilityState: 'visible', addEventListener: window.addEventListener, removeEventListener() {} },
    queueMicrotask: fn => tasks.push(fn), clearInterval() {},
    setTimeout: fn => { tasks.push(fn); return 1; }, clearTimeout() {},
    require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'fragment' } : name === './components/RecordScreens' ? { hasUnsavedDrafts: () => false, ReflectionExtras: function ReflectionExtras() {}, RecordsCalendar: function RecordsCalendar() {}, StepHeader: function StepHeader() {} } : name.startsWith('./components/') ? { default: () => null } : loadTs(new URL(`../src/app/${name}.ts`, import.meta.url))
  });
  function render() { cursor = 0; const tree = exports[component](props); first = false; return tree; }
  function find(node, name) {
    if (!node || typeof node !== 'object') return null;
    if (node.type?.name === name || node.props?.role === name) return node;
    for (const child of [node.props?.children].flat()) { const match = find(child, name); if (match) return match; }
    return null;
  }
  const initialTree = render(); effects.forEach(fn => fn()); tasks.splice(0).forEach(fn => fn());
  return {
    tree: render,
    tick: () => interval?.(),
    advanceChoice: () => tasks.splice(0).forEach(fn => fn()),
    initialOnboarding: !!find(initialTree, 'Onboarding'),
    start: () => find(render(), 'Onboarding').props.start(),
    screen: name => find(render(), name),
    raw: () => data.get(daily.DAILY_KEY) ?? null,
    next: () => { find(render(), 'ReflectionExtras')?.props.onNext(); },
    fail: () => { failSave = true; },
    replaceRecord: value => { data.clear(); if (value) data.set(daily.DAILY_KEY, value); },
    event(name, hash) { if (hash) window.location.hash = hash; listeners.get(name)?.({ key: daily.DAILY_KEY }); },
    hash: () => window.location.hash
  };
}
test('new visitor: onboarding -> home -> check-in -> persisted care; refresh restores data after Start', () => {
  const app = mount();
  assert.ok(app.initialOnboarding);
  app.start();
  app.screen('HomeScreen').props.go('checkin');
  assert.ok(app.screen('CheckinScreen'));
  app.screen('CheckinScreen').props.onDone('normal', saved.answers, '새 기록');
  if (app.screen('ReflectionExtras')) { assert.equal(app.hash(), '#photo'); app.next(); assert.equal(app.hash(), '#growth'); app.next(); }
  assert.ok(app.screen('CareScreen'));
  assert.equal(JSON.parse(app.raw()).note, '새 기록');
  const refreshed = mount(app.raw(), '#care');
  assert.ok(refreshed.initialOnboarding);
  refreshed.start();
  assert.ok(refreshed.screen('HomeScreen').props.recorded);
});

function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat().flatMap(child => nodes(child, predicate))];
}
function textContent(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return [node.props?.children].flat().map(textContent).join('');
}

test('actual question UI displays labels, saves values and restores old selections', () => {
  let submitted;
  const app = mount(null, '', 'CheckinScreen', { initialRecord: { ...saved, stage: 'checkin' }, onBack() {}, onDone: (...args) => { submitted = args; }, onDraft: () => true });
  const selected = nodes(app.tree(), node => node.props?.className === 'selected')[0];
  assert.match(textContent(selected), /괜찮게 잤어요/);
  for (const label of ['많이 힘들었어요', '매우 낮음', '거의 못 먹었어요', '많이 지쳐요']) {
    const button = nodes(app.tree(), node => node.type === 'button' && textContent(node).includes(label))[0];
    assert.ok(button);
    button.props.onClick(); app.advanceChoice();
    assert.doesNotMatch(textContent(app.tree()), /very_low|very_good/);
  }
  assert.equal(submitted[0], 'low');
  assert.deepEqual(Array.from(submitted[1]), ['very_low', 'very_low', 'very_low', 'very_low']);
});

test('care cards open details before the two-step completion action', () => {
  for (const answers of [
    ['very_low', 'very_low', 'very_low', 'very_low'],
    ['good', 'very_good', 'good', 'very_good'],
    ['very_low', 'low'],
  ]) {
    const completed = [];
    const recommendation = recommendCares(answers, { date: '2026-10-08' });
    const app = mount(null, '', 'CareScreen', { state: 'normal', recommendation, completed: null, completedIds: [], onComplete: id => completed.push(id), onShowList() {}, goHome() {} });
    assert.deepEqual(nodes(app.tree(), node => node.type === 'h3').map(textContent), recommendation.cares.map(care => care.title));
    const cardButton = nodes(app.tree(), node => node.type === 'article')[0].props.children.at(-1);
    cardButton.props.onClick();
    assert.match(textContent(app.tree()), /해볼게요/);
    const action = () => nodes(app.tree(), node => node.type === 'button' && ['해볼게요', '완료했어요'].includes(textContent(node)))[0];
    action().props.onClick(); assert.equal(completed.length, 0);
    assert.equal(textContent(action()), '완료했어요');
    action().props.onClick(); assert.equal(completed.length, 1);
  }
});

test('completion offers the appropriate two choices and keeps the existing celebration', () => {
  const recommendation = recommendCares(['very_low', 'very_low', 'very_low', 'very_low'], { date: '2026-10-08' });
  const ids = recommendation.cares.map(care => care.id);
  for (const count of [1, 2, 3]) {
    let destination = '';
    const app = mount(null, '', 'CareScreen', { state: 'low', recommendation, completed: ids[count - 1], completedIds: ids.slice(0, count), onComplete() {}, onShowList() { destination = 'list'; }, goHome() { destination = 'home'; } });
    const tree = app.tree();
    assert.match(textContent(tree), new RegExp(`오늘 ${count}/3 완료`));
    const buttons = nodes(tree, node => node.type === 'button');
    assert.equal(buttons.length, 2);
    assert.deepEqual(buttons.map(textContent), count === 3 ? ['정원에서 변화 보기', '오늘의 돌봄 다시보기'] : ['다른 작은 돌봄 이어하기', '정원에서 변화 보기']);
    buttons[0].props.onClick(); assert.equal(destination, count === 3 ? 'home' : 'list');
    buttons[1].props.onClick(); assert.equal(destination, count === 3 ? 'list' : 'home');
    const plant = nodes(tree, node => node.type?.name === 'Plant')[0];
    assert.equal(plant.props.celebrate, true);
    assert.equal(plant.props.state, 'low');
  }
});

test('garden entry label follows today’s completion count', () => {
  for (const [count, expected] of [[0, '오늘의 작은 돌봄 시작하기'], [1, '남은 작은 돌봄 이어하기'], [2, '남은 작은 돌봄 이어하기'], [3, '오늘의 돌봄 돌아보기']]) {
    const app = mount(null, '', 'HomeScreen', { state: 'normal', go() {}, recorded: true, completedCount: count });
    assert.match(textContent(app.tree()), new RegExp(expected));
    assert.match(textContent(app.tree()), new RegExp(`오늘의 작은 돌봄 ${count}/3 완료`));
  }
});

test('completed care remains reviewable without another completion action', () => {
  const recommendation = recommendCares(['very_low', 'very_low', 'very_low', 'very_low'], { date: '2026-10-08' });
  const id = recommendation.cares[0].id;
  let completedAgain = false;
  const app = mount(null, '', 'CareScreen', { state: 'normal', recommendation, completed: null, completedIds: [id], onComplete() { completedAgain = true; }, onShowList() {}, goHome() {} });
  const card = nodes(app.tree(), node => node.type === 'article')[0];
  assert.match(textContent(card), /완료했어요/);
  card.props.children.at(-1).props.onClick();
  assert.match(textContent(app.tree()), /완료했어요/);
  assert.doesNotMatch(textContent(app.tree()), /해볼게요/);
  const buttons = nodes(app.tree(), node => node.type === 'button');
  assert.deepEqual(buttons.map(textContent), ['목록으로 돌아가기']);
  buttons[0].props.onClick();
  assert.equal(completedAgain, false);
  assert.equal(nodes(app.tree(), node => node.type === 'article').length, 3);
});
test('existing user enters home and reviews restored answers without losing care history', () => {
  const app = mount(JSON.stringify(saved), '#care');
  app.start();
  assert.ok(app.screen('HomeScreen'));
  app.screen('HomeScreen').props.go('checkin');
  const restored = app.screen('CheckinScreen').props.initialRecord;
  assert.deepEqual(restored.answers, saved.answers);
  assert.equal(restored.note, saved.note);
  assert.deepEqual(restored.completedCareIds, saved.completedCareIds);
  app.screen('CheckinScreen').props.onDone('normal', saved.answers, saved.note);
  if (app.screen('ReflectionExtras')) { assert.equal(app.hash(), '#photo'); app.next(); assert.equal(app.hash(), '#growth'); app.next(); }
  assert.ok(app.screen('CareScreen'));
  assert.deepEqual(JSON.parse(app.raw()).completedCareIds, ['water']);
});
test('direct care entry, refresh, history, resume and storage removal all enforce guard', () => {
  for (const raw of [null, '{', JSON.stringify({ ...saved, date: '2000-01-01' })]) {
    const app = mount(raw, '#care');
    assert.ok(app.initialOnboarding);
    app.start();
    app.screen('HomeScreen').props.go('care');
    assert.ok(app.screen('CheckinScreen'));
    assert.equal(app.hash(), '#checkin');
    for (const event of ['popstate', 'hashchange', 'pageshow', 'visibilitychange', 'storage']) {
      app.event(event, '#care');
      assert.ok(app.screen('CheckinScreen'));
      assert.equal(app.screen('CareScreen'), null);
    }
  }
  const app = mount(JSON.stringify(saved));
  app.event('hashchange', '#care');
  assert.ok(app.screen('CareScreen'));
  app.replaceRecord(null);
  app.event('pageshow');
  assert.ok(app.screen('CheckinScreen'));
});
test('failed save keeps the user in check-in and cannot unlock care', () => {
  const app = mount(null, '#care');
  app.start();
  app.screen('HomeScreen').props.go('checkin');
  app.fail();
  app.screen('CheckinScreen').props.onDone('normal', saved.answers, '');
  if (app.screen('ReflectionExtras')) { assert.equal(app.hash(), '#photo'); app.next(); assert.equal(app.hash(), '#growth'); app.next(); }
  assert.ok(app.screen('CheckinScreen'));
  assert.ok(app.screen('status'));
  assert.equal(app.raw(), null);
  app.event('hashchange', '#care');
  assert.equal(app.screen('CareScreen'), null);
});

test('personalized cares retain completion and plant state through all three actions and reload', () => {
  const app = mount(); app.start();
  app.screen('HomeScreen').props.go('checkin');
  app.screen('CheckinScreen').props.onDone('low', ['very_low', 'very_low', 'very_low', 'very_low'], '');
  if (app.screen('ReflectionExtras')) { assert.equal(app.hash(), '#photo'); app.next(); assert.equal(app.hash(), '#growth'); app.next(); }
  const ids = app.screen('CareScreen').props.recommendation.cares.map(care => care.id);
  for (const id of ids) {
    const care = app.screen('CareScreen');
    assert.deepEqual(care.props.recommendation.cares.map(care => care.id), ids);
    care.props.onComplete(id);
    assert.equal(app.screen('CareScreen').props.completed, id);
    assert.equal(app.screen('CareScreen').props.state, 'low');
    app.screen('CareScreen').props.goHome();
    app.screen('HomeScreen').props.go('care');
  }
  assert.deepEqual(JSON.parse(app.raw()).completedCareIds, ids);
  app.screen('CareScreen').props.onComplete('walk');
  app.screen('CareScreen').props.onComplete(ids[0]);
  assert.deepEqual(JSON.parse(app.raw()).completedCareIds, ids);
  const reopened = mount(app.raw()); reopened.start();
  reopened.screen('HomeScreen').props.go('care');
  assert.deepEqual(reopened.screen('CareScreen').props.completedIds, ids);
});

test('ten reloads, reentry and an answer edit retain the stored cards, order and title', () => {
  let app = mount(); app.start();
  app.screen('HomeScreen').props.go('checkin');
  app.screen('CheckinScreen').props.onDone('low', ['very_low', 'very_low', 'very_low', 'very_low'], '');
  if (app.screen('ReflectionExtras')) { assert.equal(app.hash(), '#photo'); app.next(); assert.equal(app.hash(), '#growth'); app.next(); }
  const original = app.screen('CareScreen').props.recommendation;
  for (let i = 0; i < 10; i++) {
    app = mount(app.raw(), '#care'); app.start();
    app.screen('HomeScreen').props.go('care');
    assert.deepEqual(app.screen('CareScreen').props.recommendation, original);
    app.screen('CareScreen').props.goHome();
    app.screen('HomeScreen').props.go('garden');
    app.screen('BottomNav').props.go('home');
    app.screen('HomeScreen').props.go('care');
    assert.deepEqual(app.screen('CareScreen').props.recommendation, original);
  }
  app.screen('CareScreen').props.goHome();
  app.screen('HomeScreen').props.go('checkin');
  app.screen('CheckinScreen').props.onDone('normal', ['good', 'very_good', 'good', 'very_good'], '다시 기록');
  if (app.screen('ReflectionExtras')) { assert.equal(app.hash(), '#photo'); app.next(); assert.equal(app.hash(), '#growth'); app.next(); }
  assert.deepEqual(app.screen('CareScreen').props.recommendation, original);
  assert.equal(app.screen('CareScreen').props.state, 'low');
});

test('yesterday stays locked until check-in and its recommendation history is carried forward', () => {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const date = daily.localDay(yesterday);
  const old = { ...saved, date, careRecommendations: [{ date, ids: ['rest', 'water', 'music'], title: '어제의 안내' }] };
  const app = mount(JSON.stringify(old)); app.start();
  app.screen('HomeScreen').props.go('care');
  assert.ok(app.screen('CheckinScreen'));
  assert.equal(app.screen('CareScreen'), null);
  assert.equal(app.raw(), JSON.stringify(old));
  app.screen('CheckinScreen').props.onDone('normal', saved.answers, '');
  if (app.screen('ReflectionExtras')) { assert.equal(app.hash(), '#photo'); app.next(); assert.equal(app.hash(), '#growth'); app.next(); }
  const current = JSON.parse(app.raw());
  assert.equal(current.date, daily.localDay());
  assert.equal(current.careRecommendations.length, 2);
  assert.equal(current.careRecommendations[1].date, date);
  assert.deepEqual(current.completedCareIds, []);
});


test('calendar rollover via timer guards today care and preserves yesterday records and rewards', () => {
  const OriginalDate=globalThis.Date; const yesterday=daily.localDay();
  const app=mount();app.start();app.screen('HomeScreen').props.go('checkin');
  app.screen('CheckinScreen').props.onDone('normal',['good','normal','good','normal'],'어제 남긴 말');app.next();app.next();
  const id=app.screen('CareScreen').props.recommendation.cares[0].id;app.screen('CareScreen').props.onComplete(id);
  const nextDay=new OriginalDate();nextDay.setDate(nextDay.getDate()+1);
  globalThis.Date=class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [nextDay.getTime()])); } };
  try {
    app.tick();assert.ok(app.screen('CheckinScreen'));assert.equal(app.screen('CareScreen'),null);
    app.screen('CheckinScreen').props.onDone('normal',['good','normal','good','normal'],'새 날의 말');app.next();app.next();
    assert.deepEqual(app.screen('CareScreen').props.completedIds,[]);
    app.screen('CareScreen').props.goHome();app.screen('HomeScreen').props.go('garden');
    const rows=app.screen('GardenScreen').props.records;assert.equal(rows.length,2);
    assert.equal(rows.find(r=>r.date===yesterday).note,'어제 남긴 말');assert.deepEqual(rows.find(r=>r.date===yesterday).completedCareIds,[id]);
  } finally { globalThis.Date=OriginalDate; }
});

test('all 30 active mission details render instructions, optional examples and helper before unchanged completion', () => {
  const { ACTIVE_CARES } = loadTs(new URL('../src/app/cares.ts', import.meta.url));
  for (const care of ACTIVE_CARES) {
    const completed = [];
    const recommendation = { title: '작은 돌봄', cares: [care, ...ACTIVE_CARES.filter(other => other.id !== care.id).slice(0, 2)] };
    const app = mount(null, '', 'CareScreen', { state: 'normal', recommendation, completed: null, completedIds: [], onComplete: id => completed.push(id), onShowList() {}, goHome() {} });
    nodes(app.tree(), node => node.type === 'article')[0].props.children.at(-1).props.onClick();
    const content = textContent(app.tree());
    for (const value of [care.title, care.instruction, care.helper, care.meta, ...(care.example ? [care.example] : [])]) assert.ok(content.includes(value), care.id + ': ' + value);
    const action = () => nodes(app.tree(), node => node.type === 'button' && ['해볼게요', '완료했어요'].includes(textContent(node)))[0];
    action().props.onClick(); assert.equal(completed.length, 0); action().props.onClick(); assert.deepEqual(completed, [care.id]);
  }
});

// Structural React tests, not browser geometry or physical keyboard tests.
test('one shared tab bar remains outside both scrolling screens and follows tab selection', () => {
  const app = mount();
  assert.equal(nodes(app.tree(), n => n.type?.name === 'BottomNav').length, 0);
  app.start();
  let nav = nodes(app.tree(), n => n.type?.name === 'BottomNav');
  assert.equal(nav.length, 1); assert.equal(nav[0].props.active, 'home');
  nav[0].props.go('garden');
  nav = nodes(app.tree(), n => n.type?.name === 'BottomNav');
  assert.equal(nav.length, 1); assert.equal(nav[0].props.active, 'garden');
  assert.ok(app.screen('GardenScreen'));
  nav[0].props.go('home'); assert.ok(app.screen('HomeScreen'));
  app.screen('HomeScreen').props.go('checkin');
  assert.equal(nodes(app.tree(), n => n.type?.name === 'BottomNav').length, 0);
  for (const [component, props] of [['HomeScreen',{state:'normal',go(){},recorded:false,completedCount:0}], ['GardenScreen',{records:[],onSave:()=>true}]]) {
    const screen = mount(null, '', component, props);
    assert.equal(nodes(screen.tree(), n => n.type?.name === 'BottomNav' || n.type === 'nav').length, 0);
  }
});
test('shared navigation preserves both labels, icons, selected state and destinations', () => {
  for (const active of ['home','garden']) {
    let destination;
    const app = mount(null, '', 'BottomNav', { active, go: value => { destination = value; } });
    const buttons = nodes(app.tree(), n => n.type === 'button');
    assert.deepEqual(buttons.map(textContent), ['♧정원','▤기록']);
    assert.equal(buttons[active === 'home' ? 0 : 1].props.className, 'active');
    buttons[0].props.onClick(); assert.equal(destination,'home');
    buttons[1].props.onClick(); assert.equal(destination,'garden');
  }
});
