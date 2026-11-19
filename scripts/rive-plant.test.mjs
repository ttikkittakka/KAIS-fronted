import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the real component with a controllable runtime and frame scheduler.
const compiled = ts.transpileModule(readFileSync(new URL('../src/app/components/RivePlant.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function mount(initialProps = {}) {
  const slots = [], pending = [], frames = new Map(), microtasks = [], listeners = new Map(), played = [];
  let cursor = 0, frameId = 0, runtime = null, params, props = initialProps;
  const canvas = { width: 500, height: 500, clientWidth: 274, clientHeight: 274, alpha: 255, getBoundingClientRect: () => ({left:0,top:0,right:274,bottom:274,width:274,height:274}) };
  const emit = (type, data) => [...(listeners.get(type) ?? [])].forEach(fn => fn({ data }));
  const instance = {
    stateMachineNames: ['basic', 'lowlow_ver.'], animationNames: ['idle', 'touch', '통통'],
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    off(type, fn) { listeners.get(type)?.delete(fn); },
    stop() { emit('stop', played.at(-1)); },
    play(name) { played.push(name); },
  };
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
    useEffect(effect, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((dep, j) => !Object.is(dep, previous.deps[j]))) {
        pending.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  runInNewContext(compiled, {
    exports, console, window: { addEventListener() {}, removeEventListener() {} },
    document: { createElement: () => ({getContext: () => ({clearRect() {}, drawImage() {}, getImageData: () => ({data:[0,0,0,canvas.alpha]})})}) },
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    queueMicrotask(fn) { microtasks.push(fn); },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === '@rive-app/react-canvas') return {
        Alignment: { Center: 'center' }, Fit: { Contain: 'contain' }, Layout: class {},
        EventType: { Advance: 'advance', Loop: 'loop', Stop: 'stop' },
        useRive(options) { params = options; return { rive: runtime, canvas, RiveComponent: 'canvas' }; },
      };
      throw Error(name);
    },
  });
  const render = () => { cursor = 0; const tree = exports.default(props); pending.splice(0).forEach(fn => fn()); return tree; };
  render();
  return {
    render, canvas, played, params: () => params, emit,
    load() { runtime = instance; return render(); },
    frame() { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn()); return render(); },
    update(next) { props = { ...props, ...next }; return render(); },
    flush() { microtasks.splice(0).forEach(fn => fn()); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    listenerCount() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
    pendingFrames: () => frames.size,
  };
}

test('download completion alone keeps the placeholder; advance and paint enable touch', () => {
  const app = mount();
  assert.equal(app.render().props.disabled, true);
  assert.equal(app.load().props.disabled, true);
  app.emit('advance');
  assert.equal(app.render().props.disabled, true);
  const ready = app.frame();
  assert.equal(ready.props.disabled, false);
  assert.equal(ready.props['aria-busy'], false);
  assert.match(ready.props.className, /rive-plant--ready/);
  ready.props.onClick({ detail: 0 });
  assert.equal(app.played.at(-1), 'touch');
  app.emit('loop', { animation: 'touch' });
  app.flush();
  assert.equal(app.played.at(-1), 'basic');
});

test('silhouette tap fires once after touch pointerleave; transparent pixels and drags never fire', () => {
  const app = mount(); app.load(); app.emit('advance'); const tree = app.frame();
  const event = {isPrimary:true,button:0,pointerId:1,clientX:100,clientY:100};
  const tap = () => { tree.props.onPointerDown(event); tree.props.onPointerUp(event); tree.props.onPointerLeave(); tree.props.onClick({detail:1}); };
  tap(); assert.deepEqual(app.played, ['touch']);
  tree.props.onClick({detail:1}); assert.equal(app.played.length, 1);
  app.canvas.alpha=0; tap(); assert.equal(app.played.length, 1);
  app.canvas.alpha=255; tree.props.onPointerDown(event); tree.props.onPointerMove({...event,clientX:140});tree.props.onPointerUp(event);tree.props.onClick({detail:1});assert.equal(app.played.length,1);
  tree.props.onPointerDown(event);tree.props.onPointerCancel();tree.props.onClick({detail:1});assert.equal(app.played.length,1);
});

test('zero-size canvas stays covered until it has a drawable size', () => {
  const app = mount(); app.load(); app.canvas.clientWidth = 0;
  app.emit('advance');
  assert.equal(app.pendingFrames(), 0);
  assert.equal(app.frame().props.disabled, true);
  app.canvas.clientWidth = 274; app.emit('advance');
  assert.equal(app.frame().props.disabled, false);
});

test('load errors keep the placeholder and stop the loading announcement', () => {
  const app = mount(); app.load(); app.emit('advance');
  app.params().onLoadError();
  const tree = app.frame();
  assert.equal(tree.props.disabled, true);
  assert.equal(tree.props['aria-busy'], false);
  assert.doesNotMatch(tree.props.className, /rive-plant--ready/);
  const status = tree.props.children.props.children.at(-1);
  assert.equal(status.props.className, 'rive-plant__error');
  assert.match(status.props.children, /불러오지 못했어요/);
});

test('unmount cancels the pending reveal and all runtime listeners', () => {
  const app = mount(); app.load(); app.emit('advance');
  assert.equal(app.pendingFrames(), 1);
  app.unmount();
  assert.equal(app.pendingFrames(), 0);
  assert.equal(app.listenerCount(), 0);
});

test('low state, celebration and return to the baseline preserve existing playback', () => {
  const app = mount({ state: 'low' }); app.load();
  assert.equal(app.params().src, '/plant-final.riv');
  assert.equal(app.params().stateMachine, 'lowlow_ver.');
  app.emit('advance'); app.frame();
  assert.equal(app.update({ celebrate: true }).props.disabled, false);
  assert.equal(app.played.at(-1), '통통');
  app.emit('stop', ['통통']); app.flush();
  assert.equal(app.played.at(-1), 'lowlow_ver.');
  app.update({ celebrate: false, state: 'normal' });
  assert.equal(app.played.at(-1), 'basic');
});

test('idle-only introduction retains its animation and noninteractive wrapper', () => {
  const app = mount({ idleOnly: true }); app.load();
  assert.equal(app.params().animations, undefined);
  assert.equal(app.params().autoplay, false);
  assert.equal(app.played.at(-1), 'idle');
  assert.equal(app.params().stateMachine, undefined);
  app.emit('advance'); const tree = app.frame();
  assert.equal(tree.type, 'div');
  assert.equal(tree.props.role, 'img');
  assert.equal(tree.props.onClick, undefined);
  assert.match(tree.props.className, /rive-plant--ready/);
});
