'use client';

import { useEffect, useRef, useState } from 'react';
import { Alignment, EventType, Fit, Layout, useRive, type Rive } from '@rive-app/react-canvas';

export type RivePlantState = 'normal' | 'low';
const layout = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });

export default function RivePlant({
  state = 'normal', celebrate = false, className = '', label = '식물 터치하기', idleOnly = false,
}: { state?: RivePlantState; celebrate?: boolean; className?: string; label?: string; idleOnly?: boolean }) {
  const [error, setError] = useState(false);
  const [renderedRive, setRenderedRive] = useState<Rive | null>(null);
  const touch = useRef<() => void>(() => {});
  const previousState = useRef(state);
  const previousCelebrate = useRef(celebrate);
  const { rive, canvas, RiveComponent } = useRive({
    src: '/plant-final.riv', artboard: 'Artboard 1',
    stateMachine: idleOnly ? undefined : state === 'low' ? 'lowlow_ver.' : 'basic',
    animations: idleOnly ? 'idle' : undefined,
    autoplay: true, layout,
    onLoadError: () => setError(true),
  });

  const ready = !!rive && renderedRive === rive && !error;

  useEffect(() => {
    if (!rive || !canvas) return;
    let frame = 0;
    // Advance fires before draw in this runtime. Reveal on the next browser
    // frame so the canvas has been drawn, not merely downloaded/initialized.
    const onAdvance = () => {
      if (frame || !canvas.width || !canvas.height || !canvas.clientWidth || !canvas.clientHeight) return;
      frame = requestAnimationFrame(() => {
        setRenderedRive(rive);
        rive.off(EventType.Advance, onAdvance);
      });
    };
    rive.on(EventType.Advance, onAdvance);
    return () => {
      cancelAnimationFrame(frame);
      rive.off(EventType.Advance, onAdvance);
    };
  }, [rive, canvas]);

  useEffect(() => {
    if (!rive) return;
    const baseline = idleOnly ? 'idle' : state === 'low' ? 'lowlow_ver.' : 'basic';
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
  }, [rive, state, celebrate, idleOnly]);

  const content = <>
    <RiveComponent className="rive-plant__canvas" aria-hidden="true" />
    <span className="rive-plant__placeholder" aria-hidden="true">
      <svg viewBox="0 0 100 100" fill="none" focusable="false">
        <circle cx="50" cy="50" r="34" fill="var(--light-green)" opacity=".65" />
        <path d="M50 70V43m0 9c-2-15-15-19-25-17 1 12 10 20 25 17Zm0-9c2-14 15-19 25-17-1 12-10 20-25 17Z"
          stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
    <span className={error ? 'rive-plant__error' : 'rive-plant__status'} role="status">
      {error ? '식물을 불러오지 못했어요. 새로고침해 주세요.' : !ready ? '식물이 준비되고 있어요.' : ''}
    </span>
  </>;
  const plantClassName = `rive-plant ${ready ? 'rive-plant--ready' : ''} ${className}`;

  if (idleOnly) return <div className={plantClassName} role="img" aria-label={label} aria-busy={!ready && !error}>
    {content}
  </div>;

  return <button type="button" className={plantClassName} aria-label={label}
    disabled={!ready} aria-busy={!ready && !error}
    onClick={() => touch.current()} style={{ background: 'transparent', padding: 0 }}>
    {content}
  </button>;
}
