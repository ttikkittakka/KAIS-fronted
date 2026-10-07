// Exercise the page's navigation and persistence with browser/hook adapters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as daily from '../src/app/daily-checkin.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const saved = { version: 1, date: daily.localDay(), answers: ['괜찮게 잤어요', '보통', '든든하게 먹었어요', '잔잔해요'], note: '기존 기록', plantState: 'normal', completedCareIds: ['water'] };
function mount(raw = null, hash = '') {
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
    require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'fragment' } : name === './daily-checkin' ? daily : { default: () => null }
  });
  function render() { cursor = 0; const tree = exports.default(); first = false; return tree; }
  function find(node, name) {
    if (!node || typeof node !== 'object') return null;
    if (node.type?.name === name || node.props?.role === name) return node;
    for (const child of [node.props?.children].flat()) { const match = find(child, name); if (match) return match; }
    return null;
  }
  const initialTree = render(); effects.forEach(fn => fn()); tasks.forEach(fn => fn());
  return {
    initialHome: !!find(initialTree, 'HomeScreen'),
    screen: name => find(render(), name),
    raw: () => raw,
    fail: () => { failSave = true; },
    replaceRecord: value => { raw = value; },
    event(name, hash) { if (hash) window.location.hash = hash; listeners.get(name)?.({ key: daily.DAILY_KEY }); },
    hash: () => window.location.hash
  };
}
test('new visitor: home -> check-in -> persisted care; refresh restores data at home', () => {
  const app = mount();
  assert.ok(app.initialHome);
  app.screen('HomeScreen').props.go('checkin');
  assert.ok(app.screen('CheckinScreen'));
  app.screen('CheckinScreen').props.onDone('normal', saved.answers, '새 기록');
  assert.ok(app.screen('CareScreen'));
  assert.equal(JSON.parse(app.raw()).note, '새 기록');
  const refreshed = mount(app.raw(), '#care');
  assert.ok(refreshed.screen('HomeScreen').props.recorded);
});
test('existing user enters home and reviews restored answers without losing care history', () => {
  const app = mount(JSON.stringify(saved), '#care');
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
  app.fail();
  app.screen('CheckinScreen').props.onDone('normal', saved.answers, '');
  assert.ok(app.screen('CheckinScreen'));
  assert.ok(app.screen('status'));
  assert.equal(app.raw(), null);
  app.event('hashchange', '#care');
  assert.equal(app.screen('CareScreen'), null);
});
