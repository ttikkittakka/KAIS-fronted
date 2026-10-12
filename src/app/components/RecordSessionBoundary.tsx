'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { acquireRecordSession } from '../record-session';

declare global {
  interface Window { littleGardenRecordSession?: Promise<void>; }
}
export default function RecordSessionBoundary({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    // Share a single request across StrictMode remounts and development hot reload.
    window.littleGardenRecordSession ??= acquireRecordSession(navigator.locks);
    window.littleGardenRecordSession.then(() => { if (active) setReady(true); }, error => {
      if (active) setError(error instanceof Error && /[가-힣]/.test(error.message) ? error.message : '기록 저장소를 열지 못했어요. 다른 탭을 닫고 새로고침해 주세요.');
    });
    // A restored document must never reuse an ownership promise from before unload.
    const restored = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener('pageshow', restored);
    return () => { active = false; window.removeEventListener('pageshow', restored); };
  }, []);
  if (ready) return children;
  return <main className="app-shell"><div className="phone-frame"><section className="screen session-screen" aria-busy={!error}>
    <h1>오늘의 정원</h1><p role={error ? 'alert' : 'status'}>{error || '기록을 안전하게 열고 있어요. 다른 탭에서 정원을 열었다면 그 탭을 닫아주세요. 이어서 자동으로 열려요.'}</p>
    <p className="privacy-note">한 번에 한 탭에서 기록을 돌봐요. 다른 탭을 닫기 전에는 작성한 내용과 사진이 저장됐는지 확인해 주세요.</p>
  </section></div></main>;
}
