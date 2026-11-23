'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './CareTimer.module.css';

/** Optional, ephemeral practice aid. It never writes data or completes an activity. */
export default function CareTimer({ minutes, disabled, onComplete }: { minutes?: number; disabled: boolean; onComplete: () => void }) {
  const duration = minutes && Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0;
  const [remaining, setRemaining] = useState(duration);
  const [running, setRunning] = useState(duration > 0);
  const [visible, setVisible] = useState(duration > 0);
  const deadline = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.scrollIntoView({ block: 'nearest' }); }, []);
  useEffect(() => {
    if (!running) return;
    if (deadline.current === null) deadline.current = Date.now() + duration;
    const interval = setInterval(() => {
      const left = Math.max(0, deadline.current! - Date.now());
      setRemaining(left);
      if (left === 0) setRunning(false);
    }, 100);
    return () => clearInterval(interval);
  }, [running, duration]);
  const pause = () => { if (running && deadline.current !== null) setRemaining(Math.max(0, deadline.current - Date.now())); setRunning(false); };
  const resume = () => { if (remaining <= 0) return; deadline.current = Date.now() + remaining; setRunning(true); };
  const seconds = Math.ceil(remaining / 1000);
  const time = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  return <div ref={panel} className={styles.panel} data-care-timer data-duration={duration / 1000}>
    {visible ? <>
      <span className={styles.time} role="timer" aria-label="남은 돌봄 시간" aria-live="off">{time}</span>
      <progress className={styles.progress} value={duration - remaining} max={duration} aria-label="돌봄 시간 진행"/>
      <p className={styles.hint} role="status">{remaining === 0 ? '작은 쉼의 시간이 지났어요. 편할 때 마무리해 주세요.' : running ? '내 속도에 맞춰 천천히 해봐요.' : '잠시 쉬어가도 괜찮아요.'}</p>
      <div className={styles.controls}>
        {remaining > 0 && <button type="button" onClick={running ? pause : resume}>{running ? '일시정지' : '이어하기'}</button>}
        <button type="button" onClick={() => { pause(); setVisible(false); }}>타이머 없이 하기</button>
      </div>
    </> : <p className={styles.hint}>시간을 재지 않고 편하게 돌봐도 괜찮아요.</p>}
    <button type="button" className="primary-button" disabled={disabled} onClick={() => { pause(); onComplete(); }}>돌봄 마쳤어요</button>
    <p className={styles.hint}>시간이 남아 있어도 마무리할 수 있어요.</p>
  </div>;
}
