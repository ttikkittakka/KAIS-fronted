// Viewport event adapters only: no browser layout, safe-area or keyboard geometry assertions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const source = ts.transpileModule(readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function mount(viewport) {
  const effects = [], styles = new Map(), focusListeners = new Map(); let frame, scrolled = 0;
  class TextArea { scrollIntoView(options) { assert.equal(options.block, 'nearest'); scrolled++; } }
  const react = { useState: value => [typeof value === 'function' ? value() : value, () => {}], useRef: current => ({current}), useCallback: fn => fn, useEffect: fn => effects.push(fn) };
  const document = { activeElement: new TextArea(), documentElement: { style: { setProperty: (key,value) => styles.set(key,value), removeProperty: key => styles.delete(key) } }, addEventListener: (key,fn) => focusListeners.set(key,fn), removeEventListener: key => focusListeners.delete(key) };
  const jsx = (type,props) => ({type,props}); const exports = {};
  runInNewContext(source, { exports, window: { visualViewport: viewport }, document, HTMLTextAreaElement: TextArea,
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame: () => { frame = undefined; },
    require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? {jsx,jsxs:jsx,Fragment:'fragment'} : name.includes('/components/') ? {} : loadTs(new URL('../src/app/' + name + '.ts', import.meta.url)) });
  exports.default(); const cleanup = effects[0]();
  return { styles, focusListeners, cleanup, flush: () => { const callback = frame; frame = undefined; callback?.(); }, get scrolled() { return scrolled; } };
}
test('viewport resize and pan update shell bounds; focus stays reachable without scroll feedback', () => {
  const listeners = new Map();
  const viewport = { height: 800, offsetTop: 0, addEventListener: (key,fn) => listeners.set(key,fn), removeEventListener: key => listeners.delete(key) };
  const app = mount(viewport); assert.equal(app.styles.get('--app-viewport-height'),'800px');
  app.flush(); assert.equal(app.scrolled,1);
  viewport.height = 310; viewport.offsetTop = 90; listeners.get('resize')(); app.flush();
  assert.equal(app.styles.get('--app-viewport-height'),'310px'); assert.equal(app.styles.get('--app-viewport-top'),'90px');
  const beforePan = app.scrolled; viewport.offsetTop = 110; listeners.get('scroll')(); app.flush();
  assert.equal(app.styles.get('--app-viewport-top'),'110px'); assert.equal(app.scrolled,beforePan);
  viewport.height = 430; viewport.offsetTop = 0; listeners.get('resize')(); app.flush();
  assert.equal(app.styles.get('--app-viewport-height'),'430px');
  app.focusListeners.get('focusin')(); app.flush(); assert.equal(app.scrolled,beforePan+2);
  app.cleanup(); assert.equal(listeners.size,0); assert.equal(app.focusListeners.size,0); assert.equal(app.styles.size,0);
});
test('without VisualViewport the CSS dvh fallback remains available without runtime errors', () => {
  const app = mount(undefined); assert.equal(app.styles.size,0); assert.equal(app.cleanup,undefined);
});
