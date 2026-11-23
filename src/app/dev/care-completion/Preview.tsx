'use client';

import { useState } from 'react';
import { CareScreen } from '../../components/OneStepScreens';
import { ACTIVE_CARES } from '../../cares';
import styles from './preview.module.css';

const recommendation = { title: '개발용 돌봄 미리보기', cares: ACTIVE_CARES.slice(0, 3) };

export default function Preview() {
  const [count, setCount] = useState(3);
  const [epoch, setEpoch] = useState(0);
  const [message, setMessage] = useState('');
  const show = (value: number) => { setCount(value); setEpoch(v => v + 1); setMessage(''); };
  return <>
    <main className="app-shell">
      <div className="phone-frame">
        <CareScreen key={epoch} state="normal" recommendation={recommendation}
          completedIds={recommendation.cares.slice(0, count).map(care => care.id)} completed={recommendation.cares[count - 1].id}
          readOnly onComplete={() => {}}
          onShowList={() => setMessage('미리보기: 돌봄 목록 이동은 실행하지 않습니다.')}
          goHome={() => setMessage('미리보기: 정원 이동은 실행하지 않습니다.')}/>
      </div>
    </main>
    <aside className={styles.controls} aria-label="완료 화면 개발 미리보기">
      <details>
        <summary>개발 미리보기 · {count}/3</summary>
        <p>계정 데이터·API를 사용하지 않는 화면입니다.</p>
        <div className={styles.options}>{[1, 2, 3].map(value => <button key={value} aria-pressed={count === value} onClick={() => show(value)}>{value}/3 완료</button>)}</div>
        <button onClick={() => show(count)}>완료 화면 다시 재생</button>
      </details>
      <p role="status">{message}</p>
    </aside>
  </>;
}
