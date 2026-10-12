// Lock manager / React adapters, not real browser cross-tab verification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const { acquireRecordSession, RECORD_SESSION_LOCK } = loadTs(new URL('../src/app/record-session.ts', import.meta.url));
const flush = () => new Promise(resolve => setImmediate(resolve));
function lockManager() {
  const queue = []; let current = null;
  function next() { if (!current && queue.length) { current = queue.shift(); current.callback({ name: current.name, mode: 'exclusive' }); } }
  return { request(name, options, callback) { assert.equal(options.mode, 'exclusive'); queue.push({ name, callback }); next(); return new Promise(() => {}); }, terminateOwner() { current = null; next(); }, get waiting() { return queue.length; }, get name() { return current?.name; } };
}
test('two writer sessions serialize photo and metadata access until document termination', async () => {
  const manager = lockManager(); let second = false;
  await acquireRecordSession(manager);
  acquireRecordSession(manager).then(() => { second = true; });
  await flush(); assert.equal(second, false); assert.equal(manager.waiting, 1); assert.equal(manager.name, RECORD_SESSION_LOCK);
  // A background tab has no timer that gives ownership away.
  await flush(); assert.equal(second, false);
  manager.terminateOwner(); await flush(); assert.equal(second, true);
});
test('unsupported and denied lock APIs fail closed instead of allowing unsafe writes', async () => {
  await assert.rejects(acquireRecordSession(undefined), /HTTPS/);
  await assert.rejects(acquireRecordSession({ request: () => Promise.reject(new DOMException('denied', 'SecurityError')) }), { name: 'SecurityError' });
});
const compiled = ts.transpileModule(readFileSync(new URL('../src/app/components/RecordSessionBoundary.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function mountBoundary(win, acquire) {
  const state = []; const effects = []; let cursor = 0;
  const react = { useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; }, useEffect(effect) { const i = cursor++; if (!(i in state)) { state[i] = true; effects.push(effect); } } };
  const jsx = (type, props) => ({ type, props }); const exports = {};
  runInNewContext(compiled, { exports, Error, window: win, navigator: { locks: {} }, require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : { acquireRecordSession: acquire } });
  const child = { app: true }; const cleanups = [];
  function render() { cursor = 0; const tree = exports.default({ children: child }); for (const effect of effects.splice(0)) cleanups.push(effect()); return tree; }
  return { render, child, unmount: () => cleanups.forEach(cleanup => cleanup()) };
}
test('boundary never mounts record readers/writers before ownership and reuses StrictMode request', async () => {
  let grant; let requests = 0; let reloaded = false; const listeners = new Map();
  const win = { location: { reload() { reloaded = true; } }, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  const acquire = () => { requests++; return new Promise(resolve => { grant = resolve; }); };
  const first = mountBoundary(win, acquire); assert.notEqual(first.render(), first.child); first.unmount();
  const second = mountBoundary(win, acquire); assert.notEqual(second.render(), second.child); assert.equal(requests, 1);
  grant(); await flush(); assert.equal(second.render(), second.child);
  listeners.get('pageshow')({ persisted: true }); assert.equal(reloaded, true); second.unmount();
});
test('boundary keeps app unmounted after unsupported storage coordination', async () => {
  const win = { location: {}, addEventListener() {}, removeEventListener() {} };
  const app = mountBoundary(win, () => Promise.reject(new Error('HTTPS 필요')));
  app.render(); await flush(); const tree = app.render(); assert.notEqual(tree, app.child); assert.match(JSON.stringify(tree), /HTTPS/); app.unmount();
});
