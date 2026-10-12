'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import RivePlant, { RivePlantState } from './components/RivePlant';

import { DAILY_KEY, localDay, resolveView, type DailyCheckin, type GardenView } from './daily-checkin';
import { QUESTIONS, normalizeAnswers, plantStateForAnswers } from './questions';
import { displayCareRecommendation, ensureCareHistory } from './daily-cares';
import { cleanupPhotos, emptyRecord, readRecords, recordStorageWarning, RECORDS_KEY, saveRecord } from './record-store';
import { StepHeader, ReflectionExtras, RecordsCalendar, hasUnsavedDrafts } from './components/RecordScreens';
import type { CareRecommendation } from './recommend-cares';
type View = GardenView;
type PlantState = RivePlantState;
type IconName = 'leaf' | 'note' | 'settings' | 'back' | 'drop' | 'cloud' | 'walk' | 'check' | 'arrow';


function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (name === 'leaf') return <svg {...p}><path d="M12 21v-9m0 2c-1-5-6-6-8-5 0 4 3 7 8 5Zm0-3c1-5 6-6 8-5 0 4-3 7-8 5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === 'note') return <svg {...p}><path d="M6 4.5h12v15H6zM9 9h6m-6 4h6m-6 4h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === 'settings') return <svg {...p}><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (name === 'back') return <svg {...p}><path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === 'drop') return <svg {...p}><path d="M12 3s6 6.2 6 11a6 6 0 1 1-12 0c0-4.8 6-11 6-11Z" stroke="currentColor" strokeWidth="1.6"/><path d="M9.5 15.5c.6 1.2 1.5 1.8 2.8 1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
  if (name === 'cloud') return <svg {...p}><path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.3A3.4 3.4 0 0 0 7 18Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (name === 'walk') return <svg {...p}><circle cx="13" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.6"/><path d="m10 21 2-6-2-3 2-4 3 3 3 1M7 14l3-2m5 9-3-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (name === 'check') return <svg {...p}><path d="m5 12 4.2 4.2L19 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  return <svg {...p}><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Plant({ state = 'normal', className = '', celebrate = false }: { state?: PlantState; className?: string; celebrate?: boolean }) {
  return <RivePlant state={state} className={className} celebrate={celebrate} />;
}

function TopBar({ title, onBack, action }: { title: string; onBack?: () => void; action?: React.ReactNode }) {
  return <header className="top-bar"><div>{onBack && <button className="icon-button" onClick={onBack} aria-label="뒤로 가기"><Icon name="back" /></button>}</div><h1>{title}</h1><div>{action}</div></header>;
}

function BottomNav({ active, go }: { active: 'home' | 'garden'; go: (v: View) => void }) {
  return <nav className="bottom-nav" aria-label="주요 메뉴">
    <button className={active === 'home' ? 'active' : ''} onClick={() => go('home')}><span className="nav-symbol" aria-hidden="true">♧</span><span>정원</span></button>
    <button className={active === 'garden' ? 'active' : ''} onClick={() => go('garden')}><span className="nav-symbol" aria-hidden="true">▤</span><span>기록</span></button>
  </nav>;
}

function Onboarding({ start }: { start: () => void }) {
  return <section className="screen onboarding-screen">

    <div className="onboarding-visual"><RivePlant idleOnly className="plant-art" label="작은 정원에서 기다리는 식물" /></div>
    <div className="onboarding-copy"><h1>오늘의 나를<br/>만나러 가볼까요?</h1><p>작은 정원에서<br/>천천히 나를 돌봐요.</p></div>
    <div className="onboarding-action"><button className="primary-button" onClick={start}>시작하기 <Icon name="arrow" size={18}/></button><p>천천히 시작해도 괜찮아요.</p></div>
  </section>;
}

function HomeScreen({ state, go, recorded, completedCount, resume }: { state: PlantState; go: (v: View) => void; recorded: boolean; completedCount: number; resume?: View }) {
  return <section className="screen home-screen">
    <TopBar title="오늘의 정원" action={<button className="icon-button" aria-label="설정"><span aria-hidden="true">⚙</span></button>}/>
    <div className="garden-scene"><div className="scene-weather"><span className="cloud-shape one"/><span className="cloud-shape two"/></div><span className="scene-date">{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</span><div className="hero-plant"><Plant state={state} className="plant-art" /></div><div className="soil-floor"/></div>
    <div className="today-copy"><span className="eyebrow">오늘의 모습</span><h2>{state === 'low' ? '조금 지쳐 보여요.' : '편안하게 기다리고 있어요.'}</h2><p>{state === 'low' ? '오늘은 천천히 가도 괜찮아요.' : '오늘의 나를 가볍게 살펴볼까요?'}</p></div>
    <button className="primary-button home-cta" onClick={() => go(resume ?? (recorded ? 'care' : 'checkin'))}><span className="soft-icon"><Icon name="note" size={18}/></span>{resume && resume !== 'care' ? '오늘의 나 기록 이어하기' : !recorded ? '오늘의 나 기록하기' : completedCount === 0 ? '오늘의 작은 돌봄 시작하기' : completedCount === 3 ? '오늘의 돌봄 돌아보기' : '남은 작은 돌봄 이어하기'}</button>
    {recorded && <p className="home-care-status">오늘의 작은 돌봄 {completedCount}/3 완료</p>}
    <div className="gentle-note"><span>✦</span><p><strong>다시 찾아와줘서 반가워요.</strong><br/>쉬어간 시간도 이 정원에 포근히 남아 있어요.</p></div>
    <div className="daily-value"><span>오늘의 가치</span><strong>자기 존중</strong></div><BottomNav active="home" go={go}/>
  </section>;
}

function CheckinScreen({ onBack, onDone, onDraft, initialRecord }: { onBack: () => void; onDone: (state: PlantState, answers: string[], note: string) => void; onDraft: (answers: string[]) => boolean; initialRecord: DailyCheckin | null }) {
  const [step, setStep] = useState(() => { const i = normalizeAnswers(initialRecord?.answers).findIndex(a => !a); return i < 0 ? 0 : i; });
  const [answers, setAnswers] = useState<Record<number, string | undefined>>(() => Object.fromEntries(normalizeAnswers(initialRecord?.answers).map((answer, index) => [index, answer])));
  const question = QUESTIONS[step];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const choose = (option: string) => {
    if (timer.current) return;
    const next = { ...answers, [step]: option };
    const values = QUESTIONS.map((_, i) => next[i] ?? '');
    if (initialRecord?.answers.every(Boolean) && initialRecord?.stage !== 'checkin') return;
    if (!onDraft(values)) return;
    setAnswers(next);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (step === QUESTIONS.length - 1) onDone(plantStateForAnswers(values), values, initialRecord?.note ?? '');
      else setStep(step + 1);
    }, 220);
  };
  const back = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } if (step > 0) setStep(step - 1); else onBack(); };
  return <section className="screen checkin-screen">
    <TopBar title="오늘의 나" onBack={back}/><StepHeader step={1}/>
    <div className="progress-head"><span>{step + 1} / 4</span><div className="progress-track"><i style={{ width: ((step + 1) / 4) * 100 + '%' }}/></div><small>질문 진행</small></div>
    <div className="question-panel" key={step}>
      <div className={'question-mark' + (step === 0 ? ' question-mark--sleep' : '')}>{['☾','◐','○','♡'][step]}</div><p className={'question-kicker' + (step === 0 ? ' question-kicker--sleep' : '')}>오늘의 나를 가볍게 살펴봐요</p><h2>{question.title.split('\n').map(line => <span key={line}>{line}</span>)}</h2><p className="question-helper">{question.helper}</p>
      <div className="choice-list">{question.options.map((option, index) => <button key={option.value} className={answers[step] === option.value ? 'selected' : ''} disabled={!!initialRecord?.answers.every(Boolean) && initialRecord?.stage !== 'checkin'} onClick={() => choose(option.value)}><span className="choice-dot">{index + 1}</span><strong>{option.label}</strong>{answers[step] === option.value && <Icon name="check" size={18}/>}</button>)}</div>
      {initialRecord?.answers.every(Boolean) && initialRecord?.stage !== 'checkin' && <div className="step-actions"><p className="privacy-note">추천 행동과 연결된 돌아보기 응답은 그대로 보관해요.</p><button className="primary-button" onClick={() => onDone(plantStateForAnswers(initialRecord.answers), initialRecord.answers, initialRecord.note)}>기록 이어가기</button></div>}
    </div>
  </section>;
}

function CareScreen({ state, recommendation, completed, completedIds, onComplete, onShowList, goHome }: { state: PlantState; recommendation: CareRecommendation; completed: string | null; completedIds: string[]; onComplete: (id: string) => void; onShowList: () => void; goHome: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const completedCount = recommendation.cares.filter(care => completedIds.includes(care.id)).length;
  const allCaredFor = completedCount === recommendation.cares.length;
  const selectedCare = recommendation.cares.find(care => care.id === selected);
  const returnToList = () => { setSelected(null); setStarted(null); onShowList(); };
  if (completed) return <section className="screen completion-screen">
    <div className="completion-scene"><span className="droplet d1"/><span className="droplet d2"/><span className="spark s1">✦</span><span className="spark s2">✦</span><Plant state={state} celebrate className="plant-art lifted"/></div>
    <div className="completion-copy"><span className="completion-check"><Icon name="check" size={22}/></span><p className="eyebrow">작은 변화가 도착했어요</p><h1>{allCaredFor ? '오늘의 작은 돌봄을 모두 완료했어요! 🌼' : '작은 돌봄을 완료했어요! 🌷'}</h1><p>{allCaredFor ? '오늘도 나를 돌보는 시간을 만들어 주었네요.' : '오늘도 나를 위해 소중한 시간을 내주었네요.'}</p><p className="kind-message">오늘의 작은 쉼도 소중한 돌봄이에요.</p><p className="completion-status">오늘 {completedCount}/3 완료</p></div>
    <div className="completion-actions"><button className="primary-button" onClick={allCaredFor ? goHome : returnToList}>{allCaredFor ? '정원에서 변화 보기' : '다른 작은 돌봄 이어하기'}</button><button className="secondary-button" onClick={allCaredFor ? returnToList : goHome}>{allCaredFor ? '오늘의 돌봄 다시보기' : '정원에서 변화 보기'}</button></div>
  </section>;
  if (selectedCare) {
    const alreadyCompleted = completedIds.includes(selectedCare.id);
    return <section className="screen care-screen care-detail-screen">
      <TopBar title="오늘의 작은 돌봄" onBack={returnToList}/>
      <div className="care-detail-content">
        <div className={`care-icon ${selectedCare.tone}`}><Icon name={selectedCare.icon} size={30}/></div>
        <span className="eyebrow">오늘 나를 위한 작은 시간</span>
        <h2>{selectedCare.title}</h2><p>{selectedCare.copy}</p><span className="care-detail-meta">{selectedCare.meta}</span>
        {alreadyCompleted && <span className="care-detail-done"><Icon name="check" size={16}/> 완료했어요</span>}
      </div>
      <div className="care-detail-actions">{alreadyCompleted ? <button className="primary-button" onClick={returnToList}>목록으로 돌아가기</button> : <button className="primary-button" onClick={() => started === selectedCare.id ? onComplete(selectedCare.id) : setStarted(selectedCare.id)}>{started === selectedCare.id ? '완료했어요' : '해볼게요'}</button>}</div>
    </section>;
  }
  return <section className="screen care-screen">
    <TopBar title="오늘의 작은 돌봄" onBack={goHome}/>
    <div className="care-intro"><span className="eyebrow">오늘의 마음을 바라봤어요</span><h2>{recommendation.title.split('\n').map((line, index) => <span key={line}>{index > 0 && <br/>}{line}</span>)}</h2><p>이 중 하나만 해도 괜찮아요.</p><span className="care-progress">오늘의 작은 돌봄 {completedCount}/3 완료</span></div>
    <div className="care-list">{recommendation.cares.map((care) => { const done = completedIds.includes(care.id); return <article className={`care-card${done ? ' care-card-done' : ''}`} key={care.id}><div className={`care-icon ${care.tone}`}><Icon name={care.icon}/></div><div className="care-copy"><h3>{care.title}</h3><p>{care.copy}</p><span>{done ? '✓ 완료했어요' : care.meta}</span></div><button onClick={() => { setSelected(care.id); setStarted(null); }}>{done ? '다시 보기' : '선택하기'}</button></article>; })}</div>
    <button className="rest-choice" onClick={goHome}>오늘은 아무것도 하지 않아도 괜찮아요.</button><div className="care-plant"><Plant state={state} className="plant-art"/></div>
  </section>;
}

function GardenScreen({ go, records, onSave }: { go: (v: View) => void; records: DailyCheckin[]; onSave: (record: DailyCheckin) => boolean }) {
  return <section className="screen garden-history-screen"><TopBar title="나의 기록"/><RecordsCalendar records={records} onSave={onSave}/><BottomNav active="garden" go={go}/></section>;
}

function storageMessage(error: unknown) {
    const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
    if (name === 'QuotaExceededError') return '브라우저 저장 공간이 부족해요. 작성한 글이나 사진을 저장하지 못했어요. 이 화면을 닫기 전에 다시 시도해 주세요.';
    if (name === 'SecurityError') return '브라우저 설정 때문에 기록 저장소를 사용할 수 없어요. 저장 권한을 확인해 주세요.';
    if (error instanceof Error && /[가-힣]/.test(error.message)) return error.message;
    return '기록을 저장하지 못했어요. 작성 중인 내용을 확인하고 다시 시도해 주세요.';
}

export default function HomePage() {
  const [view, setView] = useState<View>('onboarding');
  const [daily, setDaily] = useState<DailyCheckin | null>(null);
  const dailyRef = useRef<DailyCheckin | null>(null);
  const viewRef = useRef<View>('onboarding');
  const [records, setRecords] = useState<DailyCheckin[]>([]);
  const [saveError, setSaveError] = useState('');
  const [completedCare, setCompletedCare] = useState<string | null>(null);

  const readToday = useCallback(() => {
    try {
      const all = readRecords();
      setRecords(all);
      setSaveError(recordStorageWarning());
      const record = all.find(r => r.date === localDay()) ?? null;
      if (!record || !record.answers.every(Boolean) || record.careRecommendations?.some(entry => entry.date === record.date)) return record;
      const upgraded = { ...record, careRecommendations: ensureCareHistory(record.date, record.answers, record.careRecommendations) };
      if (recordStorageWarning()) return upgraded;
      try { return saveRecord(upgraded); }
      catch (error) { setSaveError(storageMessage(error)); return upgraded; }
    } catch (error) { setSaveError(storageMessage(error)); return dailyRef.current?.date === localDay() ? dailyRef.current : null; }
  }, []);
  const updateDaily = (value: DailyCheckin | null) => {
    dailyRef.current = value;
    setDaily(value);
  };
  const show = (target: View, replace = false, record = readToday()) => {
    updateDaily(record);
    const next = resolveView(target, record);
    const url = new URL(window.location.href);
    url.hash = next;
    if (replace || window.location.hash !== '#' + next) {
      window.history[replace ? 'replaceState' : 'pushState'](
        { ...window.history.state, gardenView: next }, '', url);
    }
    viewRef.current = next;
    setCompletedCare(null);
    setView(next);
  };
  const save = (record: DailyCheckin) => {
    try {
      const saved = saveRecord(record);
      setRecords(readRecords());
      if (saved.date === localDay()) updateDaily(saved);
      setSaveError('');
      return true;
    } catch (error) { setSaveError(storageMessage(error)); return false; }
  };

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const resize = () => {
      document.documentElement.style.setProperty('--app-viewport-height', viewport.height + 'px');
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (document.activeElement instanceof HTMLTextAreaElement) document.activeElement.scrollIntoView({ block: 'nearest' });
      });
    };
    resize();
    viewport.addEventListener('resize', resize);
    document.addEventListener('focusin', resize);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', resize);
      document.removeEventListener('focusin', resize);
      document.documentElement.style.removeProperty('--app-viewport-height');
    };
  }, []);

  useEffect(() => {
    let active = true;
    const sync = (initial = false) => {
      if (!active) return;
      const record = readToday();
      const requested = window.location.hash.slice(1);
      // Every fresh entry shows the welcome screen; Start explicitly opens the garden.
      const next = resolveView(initial ? 'onboarding' : requested, record);
      updateDaily(record);
      const url = new URL(window.location.href);
      url.hash = next;
      window.history.replaceState({ ...window.history.state, gardenView: next }, '', url);
      viewRef.current = next;
      setView(next);
      setCompletedCare(null);
    };
    queueMicrotask(() => { sync(true); void cleanupPhotos().catch(error => { if (active) setSaveError(storageMessage(error)); }); });
    const onBack = () => sync();
    const onResume = () => { if (document.visibilityState === 'visible') sync(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DAILY_KEY && event.key !== RECORDS_KEY && event.key !== null) return;
      dailyRef.current = null;
      sync();
    };
    let observedDay = localDay();
    const timer = window.setInterval(() => {
      const day = localDay();
      if (observedDay !== day) { observedDay = day; sync(); }
    }, 30000);
    const warnDraft = (event: BeforeUnloadEvent) => { if (hasUnsavedDrafts()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warnDraft);
    window.addEventListener('popstate', onBack);
    window.addEventListener('hashchange', onBack);
    window.addEventListener('pageshow', onBack);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('beforeunload', warnDraft);
      window.removeEventListener('popstate', onBack);
      window.removeEventListener('hashchange', onBack);
      window.removeEventListener('pageshow', onBack);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [readToday]);

  const startCare = (state: PlantState, answers: string[], note: string) => {
    const existing = readToday();
    if (existing?.stage === 'care') { show('care', true, existing); return; }
    const history = records.flatMap(r => r.careRecommendations ?? []);
    const record: DailyCheckin = { ...(existing ?? emptyRecord()), answers, note, plantState: state, stage: 'photo' };
    record.careRecommendations = ensureCareHistory(record.date, answers, history);
    if (save(record)) show('photo', false, record);
  };
  const saveDraft = (answers: string[]) => {
    const existing = readToday() ?? emptyRecord();
    if (existing.stage === 'care') return true;
    return save({ ...existing, answers, plantState: plantStateForAnswers(answers), stage: answers.every(Boolean) ? 'photo' : 'checkin', careRecommendations: answers.every(Boolean) ? ensureCareHistory(existing.date, answers, records.flatMap(r => r.careRecommendations ?? [])) : existing.careRecommendations });
  };
  const advance = (stage: 'growth' | 'care') => {
    const record = readToday();
    if (!record) { show('checkin'); return; }
    const next = { ...record, stage };
    if (save(next)) show(stage, false, next);
  };
  const completeCare = (id: string) => {
    const record = readToday();
    if (!record) { show('checkin', true, null); return; }
    if (!record.careRecommendations?.find(entry => entry.date === record.date)?.ids.some(careId => careId === id)) return;
    if (record.completedCareIds.includes(id)) return;
    if (save({ ...record, completedCareIds: [...record.completedCareIds, id] })) setCompletedCare(id);
  };
  const go = (target: View) => show(target);
  const goHome = () => show('home', viewRef.current === 'onboarding' || viewRef.current === 'checkin');
  const plantState = daily?.plantState ?? 'normal';
  const todayCares = daily?.careRecommendations?.find(entry => entry.date === daily.date);
  const completedCount = todayCares?.ids.filter(id => daily?.completedCareIds.includes(id)).length ?? 0;

  return <main className="app-shell"><div className="phone-frame">
    <>
      {saveError && <p role="status" className="storage-status">{saveError}</p>}
      {view === 'onboarding' && <Onboarding start={goHome}/>}
      {view === 'home' && <HomeScreen state={plantState} go={go} recorded={!!daily?.answers.every(Boolean)} completedCount={completedCount} resume={daily?.stage}/>}
      {view === 'checkin' && <CheckinScreen key={localDay()} onBack={goHome} onDone={startCare} initialRecord={daily} onDraft={saveDraft}/>}
      {(view === 'photo' || view === 'growth') && daily && <ReflectionExtras key={daily.date + view} kind={view} record={daily} onSave={save} onBack={() => go(view === 'photo' ? 'checkin' : 'photo')} onNext={() => advance(view === 'photo' ? 'growth' : 'care')}/>}
      {view === 'care' && daily && todayCares && <CareScreen state={plantState} recommendation={displayCareRecommendation(todayCares)} completed={completedCare} completedIds={daily.completedCareIds} onComplete={completeCare} onShowList={() => setCompletedCare(null)} goHome={goHome}/>}
      {view === 'garden' && <GardenScreen go={go} records={records} onSave={save}/>}
    </>
  </div></main>;
}
