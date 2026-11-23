'use client';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { localDay, type DailyCheckin } from '../daily-checkin';
import { guardianAvailable, guardianStatus, guardianTokenValid, readGuardianShare, revokeGuardianShare, startGuardianShare, syncGuardianShare, type GuardianShare } from '../guardian-share';
import { ENERGY_LABELS, MOOD_LABELS, moodPattern, moodSnapshot, OUTING_LABELS, trailingDays } from '../wellbeing';
import { QUESTIONS } from '../questions';
import { Icon } from './PetIcon';

const briefDate = (value: string) => `${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일`;
const finish = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });

export function GuardianSettings({ records }: { records: DailyCheckin[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const available = guardianAvailable();
  const entries = moodSnapshot(records);
  useEffect(() => {
    let current = true;
    void guardianStatus().then(value => { if (current) setActive(value); }, () => { if (current) setStatus('공유 상태를 확인하지 못했어요.'); });
    return () => { current = false; };
  }, []);

  const action = async (mode: 'create' | 'sync' | 'revoke') => {
    setBusy(true);
    setStatus('');
    try {
      if (mode === 'create') {
        const link = await startGuardianShare(entries);
        setActive(link.expiresAt); setUrl(link.url); setStatus('7일 동안 열 수 있는 링크를 만들었어요.');
        setConsent(false);
      } else if (mode === 'sync') {
        await syncGuardianShare(entries); setStatus('최근 기록을 링크에 갱신했어요.');
      } else {
        await revokeGuardianShare(); setActive(null); setUrl(''); setConsent(false); setStatus('공유를 중단했어요.');
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : '다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: '오늘의 정원 보호자 화면', url });
      else { await navigator.clipboard.writeText(url); setStatus('링크를 복사했어요.'); }
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('아래 주소를 길게 눌러 복사해 주세요.'); }
  };

  return <div className="work-area guardian-settings">
    <header className="quiet-intro"><div className="quiet-glyph"><Icon name="hug" size={26}/></div><h2>마음을 나누는 사람</h2><p>내가 남긴 최근 14일의 상태를 믿는 사람과 공유해요.</p></header>
    <section className="quiet-card">
      <h3>공유되는 항목</h3><p>날짜별 마음, 에너지, 수면, 식사, 외출 응답</p>
      <p>일기 원문, 사진, 위치, 연락처는 기기에 남아요.</p>
    </section>
    {available ? <section className="quiet-card">
      <h3>{active ? `${finish(active)}까지 공유 중` : '보호자 링크'}</h3>
      {active && <div className="quiet-actions">
        <Button label="기록 갱신" isDisabled={busy} onClick={() => void action('sync')}/>
        <Button label="공유 중단" isDisabled={busy} onClick={() => void action('revoke')}/>
      </div>}
      {url ? <><input aria-label="보호자 공유 주소" readOnly value={url} onFocus={event => event.currentTarget.select()}/>
        <Button label="링크 공유·복사" variant="primary" onClick={() => void share()}/></> : <>
        <label className="quiet-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>
          <span>동의합니다. 링크를 가진 사람에게 상태 기록이 7일 동안 공개돼요.{active ? ' 새 링크를 만들면 이전 링크는 닫혀요.' : ''}</span></label>
        <Button label={active ? '새 링크 만들기' : '링크 만들기'} variant="primary" isDisabled={!consent || busy} onClick={() => void action('create')}/>
      </>}
    </section> : <section className="quiet-card"><h3>보호자 화면 체험</h3><p>실제 공유는 Supabase에 연결된 계정에서 열 수 있어요.</p><a className="quiet-link" href="/guardian#demo">예시 보호자 화면 열기 <Icon name="arrow" size={18}/></a></section>}
    {status && <p role="status" className="quiet-status">{status}</p>}
  </div>;
}

function exampleShare(): GuardianShare {
  const days = trailingDays(10);
  const moods = ['low', 'normal', 'low', 'good', 'normal', 'good'] as const;
  const entries = [1, 3, 5, 6, 7, 9].map((offset, index) => ({
    date: days[offset], mood: moods[index], energy: moods[Math.max(0, index - 1)], meal: 'normal' as const, sleep: 'normal' as const,
    ...(index === 4 ? { outing: 'outside' as const } : {}),
  }));
  return { entries, updatedAt: new Date().toISOString(), expiresAt: '' };
}

export default function GuardianViewer() {
  const [share, setShare] = useState<GuardianShare | null>(null);
  const [demo, setDemo] = useState(false);
  const [state, setState] = useState('공유 링크를 확인 중이에요.');
  const [date, setDate] = useState('');
  useEffect(() => {
    let current = true;
    let request = 0;
    let lastToken = '';
    const load = () => {
      const token = window.location.hash.slice(1);
      const changed = token !== lastToken;
      lastToken = token;
      const attempt = ++request;
      if (token === 'demo') {
        if (!changed) return;
        const sample = exampleShare();
        setDemo(true); setShare(sample); setDate(sample.entries.at(-1)?.date ?? '');
        return;
      }
      setDemo(false);
      if (!guardianTokenValid(token)) { setShare(null); setState('받은 링크를 다시 열어 주세요.'); return; }
      if (changed) { setShare(null); setDate(''); setState('공유 링크를 확인 중이에요.'); }
      void readGuardianShare(token).then(value => {
        if (!current || request !== attempt) return;
        setShare(value);
        setDate(previous => previous || value?.entries.at(-1)?.date || '');
        if (!value) setState('공유가 중단됐거나 링크의 기간이 끝났어요.');
      }, error => { if (current && request === attempt) { setShare(null); setState(error.message); } });
    };
    load();
    window.addEventListener('hashchange', load);
    window.addEventListener('focus', load);
    const timer = window.setInterval(load, 60_000);
    return () => { current = false; window.clearInterval(timer); window.removeEventListener('hashchange', load); window.removeEventListener('focus', load); };
  }, []);
  const pattern = moodPattern(share?.entries ?? []);
  const selected = share?.entries.find(entry => entry.date === date);
  const entryMap = new Map(share?.entries.map(entry => [entry.date, entry]));
  const days = trailingDays(14, localDay());
  return <main className="app-shell"><div className="phone-frame guardian-frame"><section className="screen work-screen">
    <header className="guardian-hero">
      <a href={demo ? '/demo' : '/'} className="guardian-back" aria-label="정원으로 돌아가기"><Icon name="back"/></a>
      <div className="quiet-glyph"><Icon name="hug"/></div>
      <h1>함께 보는 마음</h1><p>{demo ? '보호자 화면 · 예시 기록' : '보호자 화면 · 최근 14일'}</p>
    </header>
    <div className="work-area">
      {!share ? <div className="quiet-card"><p role="status">{state}</p><a className="quiet-link" href="#demo">예시 보기</a></div> : <>
        <section className="quiet-card"><div className="quiet-section-head"><h2>마음의 흐름</h2><span>{pattern.recentCount}일 기록 / 최근 7일</span></div>
          <div className="garden-mood-strip" aria-label="최근 14일 날짜별 마음">
            {days.map(day => { const entry = entryMap.get(day); return <button type="button" key={day} aria-pressed={date === day}
              aria-label={briefDate(day) + ' ' + (entry ? MOOD_LABELS[entry.mood] : '기록 없음')}
              onClick={() => setDate(day)}><i data-mood={entry?.mood}/><small>{Number(day.slice(8,10))}</small></button>; })}
          </div>
          <h3>{date ? briefDate(date) : '공유 기록 없음'}</h3>
          {selected ? <dl className="quiet-facts">
            <div><dt>마음</dt><dd>{MOOD_LABELS[selected.mood]}</dd></div>
            <div><dt>에너지</dt><dd>{ENERGY_LABELS[selected.energy]}</dd></div>
            <div><dt>수면</dt><dd>{QUESTIONS[0].options.find(choice => choice.value === selected.sleep)?.label}</dd></div>
            <div><dt>식사</dt><dd>{QUESTIONS[2].options.find(choice => choice.value === selected.meal)?.label}</dd></div>
            {selected.outing && <div><dt>외출</dt><dd>{OUTING_LABELS[selected.outing]}</dd></div>}
          </dl> : <p>이날에 공유된 응답이 없어요.</p>}
        </section>
        <section className="quiet-card"><h2>함께 이야기해요</h2>
          <p>{pattern.gap ? '최근 일주일에 공유된 기록이 없어요. 편할 때 안부를 물어볼 수 있어요.' :
            pattern.changed ? '최근에 마음이 무겁다고 남긴 날이 늘었어요. 편할 때 가볍게 안부를 물어보세요.' :
            '기록은 사용자가 직접 남긴 답이에요. 오늘은 어떻게 지냈는지 가볍게 물어볼 수 있어요.'}</p>
          {!demo && <p className="quiet-note">최근 갱신 {finish(share.updatedAt)} · 열람 기간 {finish(share.expiresAt)}까지</p>}
        </section>
      </>}
    </div>
  </section></div></main>;
}
