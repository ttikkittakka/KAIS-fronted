'use client';

import { useEffect, useState } from 'react';
import HomePage from '../page';
import { saveConsent } from '../app-storage';
import { adoptCompanion, readCompanions } from '../companions';
import { emptyRecord, readRecords, saveRecord } from '../record-store';
import { localDay } from '../daily-checkin';
import { trailingDays } from '../wellbeing';

let seeded = false;
export function Demo() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      if (!seeded) {
        seeded = true;
        saveConsent();
        const samples = [
          { answers: ['low', 'low', 'normal', 'low'], note: '조금 지쳤지만 창가에서 빛을 보고 한결 편안해졌다.' },
          { answers: ['normal', 'normal', 'good', 'normal'], note: '물을 한 잔 마셨다. 바람이 시원했다.' },
          { answers: ['good', 'normal', 'normal', 'good'], note: '친구에게 안부를 남겼다. 답장에 고마운 마음이 들었다.' },
          { answers: ['normal', 'good', 'good', 'good'], note: '나뭇잎을 보면서 천천히 걷는 게 즐거웠다.', outing: 'outside' as const },
        ];
        const days = trailingDays(9, localDay());
        samples.forEach((sample, index) => saveRecord({ ...emptyRecord(), ...sample, stage: 'care', date: days[index * 2 + 1] }));
        if (!readCompanions()) adoptCompanion('plant', readRecords());
      }
      setReady(true);
    });
  }, []);
  if (!ready) return <main className="app-shell"><section className="phone-frame"><p role="status" className="quiet-status">체험 정원을 여는 중이에요.</p></section></main>;
  return <><div className="demo-note"><span>체험 모드 · 예시 기록</span><a href="/">계정 로그인</a></div><HomePage/></>;
}
