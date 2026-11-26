'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import HomePage from '../page';
import { appStorage, resetDemoSession, saveConsent } from '../app-storage';
import { adoptCompanion, readCompanions } from '../companions';
import { emptyRecord, readRecords, saveRecord } from '../record-store';
import { localDay } from '../daily-checkin';
import { trailingDays } from '../wellbeing';
import { QUESTIONS, plantStateForAnswers } from '../questions';
import { ensureCareHistory } from '../daily-cares';
import { CARE_SCENARIOS, demoAnswers } from './scenarios';

let seeded = false;
export function Demo() {
  const [ready, setReady] = useState(false);
  const [answers, setAnswers] = useState(CARE_SCENARIOS[0].answers);
  useEffect(() => {
    queueMicrotask(() => {
      if (!seeded) {
        const selected = demoAnswers(new URLSearchParams(window.location.search));
        const scenario = selected?.join(':') ?? '';
        if (appStorage.getItem('demo-scenario') !== scenario) {
          resetDemoSession();
          appStorage.setItem('demo-scenario', scenario);
        }
        if (selected) setAnswers(selected);
        seeded = true;
        saveConsent();
        const samples = [
          { answers: ['low', 'low', 'normal', 'low'], note: '조금 지쳤지만 창가에서 빛을 보고 한결 편안해졌다.' },
          { answers: ['normal', 'normal', 'good', 'normal'], note: '물을 한 잔 마셨다. 바람이 시원했다.' },
          { answers: ['good', 'normal', 'normal', 'good'], note: '친구에게 안부를 남겼다. 답장에 고마운 마음이 들었다.' },
          { answers: ['normal', 'good', 'good', 'good'], note: '나뭇잎을 보면서 천천히 걷는 게 즐거웠다.', outing: 'outside' as const },
        ];
        const days = trailingDays(9, localDay());
        samples.forEach((sample, index) => {
          const date = days[index * 2 + 1];
          if (!readRecords().some(record => record.date === date)) saveRecord({ ...emptyRecord(), ...sample, stage: 'care', date });
        });
        if (selected && !readRecords().some(record => record.date === localDay())) {
          saveRecord({ ...emptyRecord(), answers: selected, plantState: plantStateForAnswers(selected), stage: 'care',
            careRecommendations: ensureCareHistory(localDay(), selected) });
        }
        if (!readCompanions()) adoptCompanion('bonsai', readRecords());
      }
      setReady(true);
    });
  }, []);
  if (!ready) return <main className="app-shell"><section className="phone-frame"><p role="status" className="quiet-status">체험 정원을 여는 중이에요.</p></section></main>;
  return <><div className="demo-note"><span>체험 모드 · 예시 기록</span><Link href="/" prefetch={false}>계정 로그인</Link>
    <details><summary>상태별 추천 체험</summary>
      <form action="/demo#care" method="get">
        <p>새 상태를 적용하면 체험 기록만 새로 시작해요. 새로고침하면 현재 체험을 이어가요.</p>
        {CARE_SCENARIOS.map(scenario => <button type="button" key={scenario.label} onClick={() => setAnswers(scenario.answers)}>{scenario.label}</button>)}
        {QUESTIONS.map((question, index) => <label key={question.id}>{question.title}
          <select name={question.id} value={answers[index]} onChange={event => setAnswers(values => values.map((value, i) => i === index ? event.target.value : value))}>
            {question.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>)}
        <button type="submit">이 상태로 돌봄 체험</button>
      </form>
    </details>
  </div><HomePage/></>;
}
