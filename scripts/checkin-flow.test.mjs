// Exercise the page's navigation and persistence with browser/hook adapters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const daily = loadTs(new URL('../src/app/daily-checkin.ts', import.meta.url));

const compiled = ts.transpileModule(readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText + '\nexports.CheckinScreen = CheckinScreen; exports.CareScreen = CareScreen;';
const saved = { version: 1, date: daily.localDay(), answers: ['괜찮게 잤어요', '보통', '든든하게 먹었어요', '잔잔해요'], note: '기존 기록', plantState: 'normal', completedCareIds: ['water'] };
function mount(raw = null, hash = '', component = 'default', props = {}) {
  const slots = [], effects = [], tasks = [], listeners = new Map();
  let cursor = 0, first = true, failSave = false;
  const storage = { getItem: () => raw, setItem: (_, value) => { if (failSave) throw Error('quota'); raw = value; } };
  const window = {
    location: new URL('http://localhost:3000/' + hash),
    history: { state: {}, replaceState(state, _, url) { this.state = state; window.location = new URL(url); }, pushState(state, _, url) { this.replaceState(state, _, url); } },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {}, setInterval() { return 1; }
  };
  const react = {
    useState(initial) { const i = cursor++; if (first) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (first) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect) { if (first) effects.push(effect); }
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  runInNewContext(compiled, { exports, URL, localStorage: storage, window,
    document: { visibilityState: 'visible', addEventListener: window.addEventListener, removeEventListener() {} },
    queueMicrotask: fn => tasks.push(fn), clearInterval() {},
    setTimeout: fn => { tasks.push(fn); return 1; }, clearTimeout() {},
    require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'fragment' } : name.startsWith('./components/') ? { default: () => null } : loadTs(new URL(`../src/app/${name}.ts`, import.meta.url))
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
    advanceChoice: () => tasks.splice(0).forEach(fn => fn()),
    initialOnboarding: !!find(initialTree, 'Onboarding'),
    start: () => find(render(), 'Onboarding').props.start(),
    screen: name => find(render(), name),
    raw: () => raw,
    fail: () => { failSave = true; },
    replaceRecord: value => { raw = value; },
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
  const app = mount(null, '', 'CheckinScreen', { initialRecord: saved, onBack() {}, onDone: (...args) => { submitted = args; } });
  const selected = nodes(app.tree(), node => node.props?.className === 'selected')[0];
  assert.match(textContent(selected), /괜찮게 잤어요/);
  for (const label of ['많이 힘들었어요', '매우 낮음', '거의 못 먹었어요', '많이 지쳐요']) {
    const button = nodes(app.tree(), node => node.type === 'button' && textContent(node).includes(label))[0];
    assert.ok(button);
    button.props.onClick(); app.advanceChoice();
    assert.doesNotMatch(textContent(app.tree()), /very_low|very_good/);
  }
  nodes(app.tree(), node => node.type === 'button' && textContent(node) === '오늘의 나를 살펴봤어요')[0].props.onClick();
  assert.equal(submitted[0], 'low');
  assert.deepEqual(Array.from(submitted[1]), ['very_low', 'very_low', 'very_low', 'very_low']);
});

test('actual care cards show all three scenarios and preserve the two-step completion action', () => {
  for (const [answers, expected] of [
    [['very_low', 'very_low', 'very_low', 'very_low'], ['3분만 눈 감기', '물 몇 모금', '좋아하는 노래 한 곡']],
    [['good', 'very_good', 'good', 'very_good'], ['5분 걷기', '하늘 바라보기', '햇빛 잠깐 받기']],
    [['very_low', 'low'], ['물 몇 모금', '하늘 바라보기', '몸 한 번 펴기']],
  ]) {
    const completed = [];
    const app = mount(null, '', 'CareScreen', { state: 'normal', answers, completed: null, completedIds: [], onComplete: id => completed.push(id), goHome() {} });
    assert.deepEqual(nodes(app.tree(), node => node.type === 'h3').map(textContent), expected);
    const button = () => nodes(app.tree(), node => node.type === 'article')[0].props.children.at(-1);
    button().props.onClick(); assert.equal(completed.length, 0);
    assert.equal(button().props.children, '완료했어요');
    button().props.onClick(); assert.equal(completed.length, 1);
  }
});

test('all recommended cares completed still plays the existing celebration with gentle copy', () => {
  const app = mount(null, '', 'CareScreen', { state: 'low', answers: ['very_low', 'very_low', 'very_low', 'very_low'], completed: 'music', completedIds: ['rest', 'water', 'music'], onComplete() {}, goHome() {} });
  assert.match(textContent(app.tree()), /오늘 나를 위해잠깐 시간을 썼어요/);
  const plant = nodes(app.tree(), node => node.type?.name === 'Plant')[0];
  assert.equal(plant.props.celebrate, true);
  assert.equal(plant.props.state, 'low');
});
test('existing user enters home and reviews restored answers without losing care history', () => {
  const app = mount(JSON.stringify(saved), '#care');
  app.start();
  assert.ok(app.screen('HomeScreen'));
  app.screen('HomeScreen').props.go('checkin');
  assert.deepEqual(app.screen('CheckinScreen').props.initialRecord, saved);
  app.screen('CheckinScreen').props.onDone('normal', saved.answers, saved.note);
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
  for (const id of ['rest', 'water', 'music']) {
    const care = app.screen('CareScreen');
    assert.deepEqual(Array.from(care.props.answers), ['very_low', 'very_low', 'very_low', 'very_low']);
    care.props.onComplete(id);
    assert.equal(app.screen('CareScreen').props.completed, id);
    assert.equal(app.screen('CareScreen').props.state, 'low');
    app.screen('CareScreen').props.goHome();
    app.screen('HomeScreen').props.go('care');
  }
  assert.deepEqual(JSON.parse(app.raw()).completedCareIds, ['rest', 'water', 'music']);
  app.screen('CareScreen').props.onComplete('walk');
  app.screen('CareScreen').props.onComplete('music');
  assert.deepEqual(JSON.parse(app.raw()).completedCareIds, ['rest', 'water', 'music']);
  const reopened = mount(app.raw()); reopened.start();
  reopened.screen('HomeScreen').props.go('care');
  assert.deepEqual(reopened.screen('CareScreen').props.completedIds, ['rest', 'water', 'music']);
});
