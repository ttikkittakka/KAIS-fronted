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
  const gesture = useRef<{ id: number; x: number; y: number; accepted: boolean } | null>(null);
  const probe = useRef<CanvasRenderingContext2D | null>(null);
  const previousState = useRef(state);
  const previousCelebrate = useRef(celebrate);
  const { rive, canvas, RiveComponent } = useRive({
    src: '/plant-final.riv', artboard: 'Artboard 1',
    stateMachine: idleOnly ? undefined : state === 'low' ? 'lowlow_ver.' : 'basic',
    autoplay: !idleOnly, layout,
    onLoadError: () => setError(true),
  });

  const ready = !!rive && renderedRive === rive && !error;

  // Sample the rendered silhouette, not the artboard's transparent rectangle.
  // CSS coordinates are converted to backing pixels (including devicePixelRatio).
  const hitsPlant = (x: number, y: number) => {
    if (!ready || !canvas) return false;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || x < rect.left || y < rect.top || x >= rect.right || y >= rect.bottom) return false;
    try {
      if (!probe.current) {
        const pixel = document.createElement('canvas');
        pixel.width = pixel.height = 1;
        probe.current = pixel.getContext('2d', { willReadFrequently: true });
      }
      const context = probe.current;
      if (!context) return false;
      context.clearRect(0, 0, 1, 1);
      context.drawImage(canvas, Math.floor((x - rect.left) * canvas.width / rect.width), Math.floor((y - rect.top) * canvas.height / rect.height), 1, 1, 0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3] >= 32;
    } catch { return false; } // Unreadable frames never broaden the hit target.
  };

  useEffect(() => {
    const cancel = () => { gesture.current = null; };
    window.addEventListener('scroll', cancel, true);
    return () => window.removeEventListener('scroll', cancel, true);
  }, []);

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
    // Start idle directly: useRive's animations option calls stop() with an
    // array internally, which is deprecated. State machines autoplay above.
    if (celebrate) play('통통');
    else if (idleOnly || stateChanged || celebrationEnded) play(baseline);
    return () => {
      disposed = true;
      touch.current = () => {};
      rive.off(EventType.Loop, finished);
      rive.off(EventType.Stop, finished);
    };
  }, [rive, state, celebrate, idleOnly]);

  const content = <>
    <RiveComponent className="rive-plant__canvas" aria-hidden="true" />
    <span className={`rive-plant__placeholder${state === 'low' ? ' rive-plant__placeholder--low' : ''}`} aria-hidden="true" />
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
    onPointerDown={event => {
      gesture.current = event.isPrimary && event.button === 0 && hitsPlant(event.clientX, event.clientY)
        ? { id: event.pointerId, x: event.clientX, y: event.clientY, accepted: false } : null;
    }}
    onPointerMove={event => {
      const start = gesture.current;
      if (start && (start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8)) gesture.current = null;
    }}
    onPointerUp={event => {
      const start = gesture.current;
      if (start) start.accepted = start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8 && hitsPlant(event.clientX, event.clientY);
    }}
    onPointerCancel={() => { gesture.current = null; }}
    // Touch browsers emit pointerleave after pointerup, before their click.
    // Keep only an already validated release for that single compatibility click.
    onPointerLeave={() => { if (!gesture.current?.accepted) gesture.current = null; }}
    onClick={event => {
      const accepted = gesture.current?.accepted;
      gesture.current = null;
      if (event.detail === 0 || accepted) touch.current();
    }} style={{ background: 'transparent', padding: 0 }}>
    {content}
  </button>;
}
