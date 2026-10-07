'use client';

import { useEffect, useRef, useState } from 'react';
import { Alignment, EventType, Fit, Layout, useRive } from '@rive-app/react-canvas';

export type RivePlantState = 'normal' | 'low';
const layout = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });

export default function RivePlant({
  state = 'normal', celebrate = false, className = '', label = '식물 터치하기',
}: { state?: RivePlantState; celebrate?: boolean; className?: string; label?: string }) {
  const [error, setError] = useState(false);
  const touch = useRef<() => void>(() => {});
  const previousState = useRef(state);
  const previousCelebrate = useRef(celebrate);
  const { rive, RiveComponent } = useRive({
    src: '/plant-final.riv', artboard: 'Artboard 1',
    stateMachine: state === 'low' ? 'lowlow_ver.' : 'basic',
    autoplay: true, layout,
    onLoadError: () => setError(true),
  });

  useEffect(() => {
    if (!rive) return;
    const baseline = state === 'low' ? 'lowlow_ver.' : 'basic';
    const stateChanged = previousState.current !== state;
    const celebrationEnded = previousCelebrate.current && !celebrate;
    previousState.current = state;
    previousCelebrate.current = celebrate;
    let active = '';
    let disposed = false;
    let generation = 0;
    const play = (name: string) => {
      if (![...rive.stateMachineNames, ...rive.animationNames].includes(name)) {
        console.error(`Missing Rive animation: ${name}`, rive.contents);
        return;
      }
      generation++;
      active = '';
      rive.stop();
      active = name;
      rive.play(name);
    };
    const finished = (event: { data?: unknown }) => {
      const data = event.data;
      const names = typeof data === 'string' ? [data] : Array.isArray(data) ? data
        : data && typeof data === 'object' && 'animation' in data ? [data.animation] : [];
      if (!active || !names.includes(active)) return;
      const current = generation;
      // Defer until Rive finishes dispatching the old animation's events.
      queueMicrotask(() => {
        if (!disposed && current === generation) play(baseline);
      });
    };
    rive.on(EventType.Loop, finished);
    rive.on(EventType.Stop, finished);
    touch.current = () => play('touch');
    // The requested artboard/state machine starts in useRive itself. Only
    // interrupt it for explicit interactions or when its state changes.
    if (celebrate) play('통통');
    else if (stateChanged || celebrationEnded) play(baseline);
    return () => {
      disposed = true;
      touch.current = () => {};
      rive.off(EventType.Loop, finished);
      rive.off(EventType.Stop, finished);
    };
  }, [rive, state, celebrate]);

  return <button type="button" className={`rive-plant ${className}`} aria-label={label}
    onClick={() => touch.current()} style={{ background: 'transparent', padding: 0 }}>
    <RiveComponent aria-hidden="true" style={{ background: 'transparent', pointerEvents: 'none' }} />
    {error && <span role="status">식물을 불러오지 못했어요. 새로고침해 주세요.</span>}
  </button>;
}
