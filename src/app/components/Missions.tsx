'use client';

import { useEffect, useRef, useState } from 'react';
import { localDay } from '../daily-checkin';
import { needsSafetyRoute } from '../safety';
import { HELLO_MISSION, HELLO_TEMPLATES, MINUTE_MISSIONS, readMissionLog, saveMinuteMission, todaysMissions, toggleMission, type MissionId } from '../missions';

type Minute = typeof MINUTE_MISSIONS[number];
const SECONDS = 60;

/** One minute mission: start → 60s countdown → enter the count (or an optional thought) → saved. */
function MinuteMission({ mission, done, saved, onSaved }: { mission: Minute; done: boolean; saved?: string; onSaved: (done: MissionId[]) => void }) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'input'>('idle');
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(0);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (phase !== 'running') return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endsAt) setPhase('input');
    }, 250);
    return () => clearInterval(timer);
  }, [phase, endsAt]);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const save = () => {
    try {
      const log = saveMinuteMission(mission.id, mission.kind === 'count' ? Number(value) : value);
      onSaved(log.done[localDay()] ?? []); setPhase('idle'); setValue(''); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했어요.'); }
  };
  return <li className={done ? 'missions-done' : ''}>
    <div><strong>{mission.title}</strong><span>{mission.copy}</span>{saved && <span className="missions-saved">오늘 남긴 기록: {saved}</span>}</div>
    {phase === 'idle' && <button type="button" onClick={() => { const t = Date.now(); setNow(t); setEndsAt(t + SECONDS * 1000); setPhase('running'); }}>{done ? '다시 하기' : '1분 시작'}</button>}
    {phase === 'running' && <div className="missions-timer" role="timer" aria-live="off">
      <span className="missions-timer__bar" aria-hidden="true"><i style={{ width: ((SECONDS - left) / SECONDS) * 100 + '%' }}/></span>
      <strong aria-label={`${left}초 남음`}>0:{String(left).padStart(2, '0')}</strong>
      <button type="button" onClick={() => setPhase('idle')}>그만하기</button>
    </div>}
    {phase === 'input' && <div className="missions-input">
      {mission.kind === 'count'
        ? <label>1분 동안 센 횟수<span><input type="number" inputMode="numeric" min={mission.min} max={mission.max} value={value} onChange={e => setValue(e.target.value)} autoFocus/> {mission.unit}</span></label>
        : <label>가장 먼저 떠올랐던 것이나 기억에 남는 것 (적지 않아도 괜찮아요)<textarea maxLength={200} value={value} onChange={e => setValue(e.target.value)} autoFocus/></label>}
      {mission.kind === 'still' && needsSafetyRoute(value) && <p role="status" className="safety-nudge">혼자 견디지 않아도 돼요. <a href="#safety">도움 받을 수 있는 곳 보기</a></p>}
      <div className="missions-actions"><button type="button" onClick={save} disabled={mission.kind === 'count' && !value}>저장</button><button type="button" onClick={() => { setPhase('idle'); setValue(''); setError(''); }}>취소</button></div>
      {mission.kind === 'count' && <small>스스로 센 숫자라 의료 측정이 아니에요.</small>}
      {error && <p role="alert" className="record-error">{error}</p>}
    </div>}
  </li>;
}

const mod = (p: number, n: number) => ((p % n) + n) % n;

/** Hello templates one at a time: swipe sideways or scroll; each step overshoots a little, then settles, and loops. */
function HelloCarousel({ copied, onCopy }: { copied: string; onCopy: (text: string) => void }) {
  const n = HELLO_TEMPLATES.length;
  const [pos, setPos] = useState(0); // unbounded, so stepping past the last one comes round to the first
  const [drag, setDrag] = useState<number | null>(null);
  const startX = useRef(0);
  const moved = useRef(false);
  const view = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    let last = -Infinity;
    // Native listener: React's onWheel is passive and cannot keep the page from scrolling.
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!d) return;
      e.preventDefault();
      if (e.timeStamp - last > 250) setPos(p => p + Math.sign(d)); // one step per wheel burst, trackpad momentum included
      last = e.timeStamp;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const release = (width: number) => {
    if (drag !== null && Math.abs(drag) > width * 0.15) setPos(p => p - Math.sign(drag));
    setDrag(null);
  };
  // Dots take the shorter way round; slots pos-n..pos+n stay rendered so no jump crosses empty space.
  const go = (k: number) => setPos(p => { const d = mod(k - p, n); return p + (d > n / 2 ? d - n : d); });
  return <span className="missions-carousel">
    <span ref={view} className="missions-carousel__view" role="group" aria-label="안부 멘트"
      onPointerDown={e => { startX.current = e.clientX; moved.current = false; setDrag(0); }}
      onPointerMove={e => {
        if (drag === null) return;
        const dx = e.clientX - startX.current;
        if (!moved.current && Math.abs(dx) > 6) { moved.current = true; e.currentTarget.setPointerCapture(e.pointerId); }
        if (moved.current) setDrag(dx);
      }}
      onPointerUp={e => release(e.currentTarget.offsetWidth)}
      onPointerCancel={() => setDrag(null)}
      // A swipe that ends on the link must not open the messaging app.
      onClickCapture={e => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } }}>
      <span className="missions-carousel__track" style={{ transform: `translateX(calc(${-pos * 100}% + ${drag ?? 0}px))`, transition: drag === null ? undefined : 'none' }}>
        {Array.from({ length: 2 * n + 1 }, (_, i) => pos - n + i).map(p => {
          const t = HELLO_TEMPLATES[mod(p, n)];
          return <span key={p} className="missions-template" style={{ transform: `translateX(${p * 100}%)` }} inert={p !== pos}>
            {/* sms: opens the phone's own messaging app with the text filled in; nothing is sent automatically and no contact is read. */}
            <a href={'sms:?&body=' + encodeURIComponent(t)} draggable={false}>{t}</a>
            <button type="button" onClick={() => onCopy(t)} aria-label={`"${t}" 복사하기`}>{copied === t ? '복사됨' : '복사'}</button>
          </span>;
        })}
      </span>
    </span>
    <span className="missions-dots">{HELLO_TEMPLATES.map((t, k) => <button key={t} type="button" aria-label={`${k + 1}번째 멘트`} aria-current={k === mod(pos, n)} onClick={() => go(k)}/>)}</span>
  </span>;
}

/** Optional extras on the care tab: no rewards, no streaks, undo allowed. */
export default function CompanionMissions() {
  const today = localDay();
  const [log, setLog] = useState(() => readMissionLog());
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const done = log.done[today] ?? [];
  const values = log.values[today] ?? {};
  const refresh = () => setLog(readMissionLog());
  const toggle = (id: MissionId) => {
    try { toggleMission(id, today); refresh(); setError(''); }
    catch { setError('미션을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); } catch { setCopied(''); }
  };
  const savedFor = (m: Minute) => m.id === 'heart-1min' ? values.heart && `${values.heart}회/분` : m.id === 'breath-1min' ? values.breath && `${values.breath}회/분` : values.thought && `“${values.thought}”`;
  return <>
    <section className="missions" aria-labelledby="minute-title">
      <h2 id="minute-title">1분 동안 나를 살피기</h2>
      <p>몸과 마음을 잠깐 들여다보는 시간이에요. 남긴 기록은 기록 탭에서 볼 수 있어요.</p>
      <ul>{MINUTE_MISSIONS.map(m => <MinuteMission key={m.id} mission={m} done={done.includes(m.id)} saved={savedFor(m) || undefined} onSaved={refresh}/>)}</ul>
    </section>
    <section className="missions" aria-labelledby="missions-title">
      <h2 id="missions-title">친구와 함께하는 작은 미션</h2>
      <p>하고 싶을 때만 골라 해요. 하지 않아도 아무것도 줄어들지 않아요.</p>
      <ul>
        {todaysMissions(today).map(mission => {
          const isDone = done.includes(mission.id);
          return <li key={mission.id} className={isDone ? 'missions-done' : ''}>
            <div><strong>{mission.title}</strong><span>{mission.copy}</span></div>
            <button type="button" aria-pressed={isDone} onClick={() => toggle(mission.id)}>{isDone ? '했어요 ✓' : '해볼게요'}</button>
          </li>;
        })}
        <li className={'missions-hello' + (done.includes(HELLO_MISSION.id) ? ' missions-done' : '')}>
          <div><strong>{HELLO_MISSION.title}</strong><span>{HELLO_MISSION.copy}</span>
            <HelloCarousel copied={copied} onCopy={t => void copy(t)}/>
          </div>
          <button type="button" aria-pressed={done.includes(HELLO_MISSION.id)} onClick={() => toggle(HELLO_MISSION.id)}>{done.includes(HELLO_MISSION.id) ? '전했어요 ✓' : '전한 걸로 할게요'}</button>
        </li>
      </ul>
      {error && <p role="alert" className="record-error">{error}</p>}
    </section>
  </>;
}
