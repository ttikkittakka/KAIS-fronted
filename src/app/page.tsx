'use client';

import { useEffect, useRef, useState } from 'react';
import RivePlant, { RivePlantState } from './components/RivePlant';

import { DAILY_KEY, localDay, parseDaily, resolveView, type DailyCheckin, type GardenView } from './daily-checkin';
import { QUESTIONS, normalizeAnswers, plantStateForAnswers } from './questions';
import { displayCareRecommendation, ensureCareHistory, readCareHistory } from './daily-cares';
import type { CareRecommendation } from './recommend-cares';
type View = GardenView;
type PlantState = RivePlantState;
type IconName = 'leaf' | 'note' | 'settings' | 'back' | 'drop' | 'cloud' | 'walk' | 'check' | 'arrow';

const CALENDAR = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, null, null, null];

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

function HomeScreen({ state, go, recorded, completedCount }: { state: PlantState; go: (v: View) => void; recorded: boolean; completedCount: number }) {
  return <section className="screen home-screen">
    <TopBar title="오늘의 정원" action={<button className="icon-button" aria-label="설정"><span aria-hidden="true">⚙</span></button>}/>
    <div className="garden-scene"><div className="scene-weather"><span className="cloud-shape one"/><span className="cloud-shape two"/></div><span className="scene-date">10월 1일 · 목요일</span><div className="hero-plant"><Plant state={state} className="plant-art" /></div><div className="soil-floor"/></div>
    <div className="today-copy"><span className="eyebrow">오늘의 모습</span><h2>{state === 'low' ? '조금 지쳐 보여요.' : '편안하게 기다리고 있어요.'}</h2><p>{state === 'low' ? '오늘은 천천히 가도 괜찮아요.' : '오늘의 나를 가볍게 살펴볼까요?'}</p></div>
    <button className="primary-button home-cta" onClick={() => go(recorded ? 'care' : 'checkin')}><span className="soft-icon"><Icon name="note" size={18}/></span>{!recorded ? '오늘의 나 기록하기' : completedCount === 0 ? '오늘의 작은 돌봄 시작하기' : completedCount === 3 ? '오늘의 돌봄 돌아보기' : '남은 작은 돌봄 이어하기'}</button>
    {recorded && <p className="home-care-status">오늘의 작은 돌봄 {completedCount}/3 완료</p>}
    <div className="gentle-note"><span>✦</span><p><strong>다시 찾아와줘서 반가워요.</strong><br/>쉬어간 시간도 이 정원에 포근히 남아 있어요.</p></div>
    <BottomNav active="home" go={go}/>
  </section>;
}

function CheckinScreen({ onBack, onDone, initialRecord }: { onBack: () => void; onDone: (state: PlantState, answers: string[], note: string) => void; initialRecord: DailyCheckin | null }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string | undefined>>(() => Object.fromEntries(normalizeAnswers(initialRecord?.answers).map((answer, index) => [index, answer])));
  const [note, setNote] = useState(initialRecord?.note ?? '');
  const isNote = step === QUESTIONS.length;
  const question = QUESTIONS[Math.min(step, QUESTIONS.length - 1)];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const choose = (option: string) => {
    if (timer.current) return;
    setAnswers((old) => ({ ...old, [step]: option }));
    timer.current = setTimeout(() => {
      timer.current = null;
      setStep(step + 1);
    }, 220);
  };
  const finish = () => {
    const values = QUESTIONS.map((_, i) => answers[i]);
    if (values.some(value => !value)) return;
    const completed = values as string[];
    onDone(plantStateForAnswers(completed), completed, note);
  };
  return <section className="screen checkin-screen">
    <TopBar title="오늘의 나" onBack={step > 0 ? () => setStep((old) => old - 1) : onBack}/>
    <div className="progress-head"><span>{Math.min(step + 1, 4)} / 4</span><div className="progress-track"><i style={{ width: `${Math.min(((step + 1) / 4) * 100, 100)}%` }}/></div><small>약 30초</small></div>
    {!isNote ? <div className="question-panel" key={step}>
      <div className={`question-mark${step === 0 ? ' question-mark--sleep' : ''}`}>{['☾','◐','○','♡'][step]}</div><p className={`question-kicker${step === 0 ? ' question-kicker--sleep' : ''}`}>오늘의 나를 가볍게 살펴봐요</p><h2>{question.title.split('\n').map((line) => <span key={line}>{line}</span>)}</h2><p className="question-helper">{question.helper}</p>
      <div className="choice-list">{question.options.map((option, index) => <button key={option.value} className={answers[step] === option.value ? 'selected' : ''} onClick={() => choose(option.value)}><span className="choice-dot">{index + 1}</span><strong>{option.label}</strong>{answers[step] === option.value && <Icon name="check" size={18}/>}</button>)}</div>
    </div> : <div className="question-panel note-panel">
      <div className="question-mark">✎</div><p className="question-kicker">마지막으로, 선택 사항이에요</p><h2>오늘을 한마디로<br/>남겨볼까요?</h2><p className="question-helper">잘 정리된 문장이 아니어도 괜찮아요.</p>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="마음에 남은 순간을 적어보세요."/><span className="text-count">{note.length} / 120</span><button className="primary-button" onClick={finish}>오늘의 나를 살펴봤어요</button><button className="text-button" onClick={finish}>건너뛰어도 괜찮아요</button>
    </div>}
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
    <div className="completion-copy"><span className="completion-check"><Icon name="check" size={22}/></span><p className="eyebrow">작은 변화가 도착했어요</p><h1>{allCaredFor ? '오늘의 작은 돌봄을 모두 완료했어요! 🌼' : '작은 돌봄을 완료했어요! 🌷'}</h1><p>{allCaredFor ? '오늘도 나를 돌보는 시간을 만들어 주었네요.' : '오늘도 나를 위해 소중한 시간을 내주었네요.'}</p><p className="completion-status">오늘 {completedCount}/3 완료</p></div>
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

function MiniPlant() {
  return <Plant className="calendar-rive" />;
}

function GardenScreen({ state, go }: { state: PlantState; go: (v: View) => void }) {
  const entries = [['9/13', '☁', '하늘을 봤어요'], ['9/12', '◌', '물을 마셨어요'], ['9/11', '♧', '천천히 산책했어요'], ['9/10', '♡', '다시 찾아왔어요']];
  return <section className="screen garden-history-screen">
    <TopBar title="나의 정원" action={<span className="month-tag">10월</span>}/>
    <div className="calendar-card"><div className="calendar-head"><div><span className="eyebrow">OCTOBER GARDEN</span><h2>2026년 10월</h2></div><span>‹　›</span></div><div className="week-row">{['월','화','수','목','금','토','일'].map((d) => <span key={d}>{d}</span>)}</div><div className="calendar-grid">{CALENDAR.map((day, index) => <div key={`${day}-${index}`} className={day === 1 ? 'today' : ''}>{day && <><small>{day}</small>{[1,3,5,8,10,12,13,16,19,22,25,28,31].includes(day) && <MiniPlant/>}</>}</div>)}</div><p className="calendar-note">기록하지 않은 날도 정원은 조용히 기다려요.</p></div>
    <section className="week-garden"><div className="week-plant"><Plant state={state} className="plant-art"/></div><div><span className="eyebrow">이번 주의 식물</span><h2>조금씩 나를<br/>돌봤어요.</h2><p>작은 순간들이 모여<br/>새 잎이 되었어요.</p></div></section>
    <section className="memory-timeline"><div className="section-heading"><span className="eyebrow">작은 돌봄의 흔적</span><h2>최근의 기억</h2></div>{entries.map((entry, index) => <article key={entry[0]}><time>{entry[0]}</time><span className="memory-icon">{entry[1]}</span><p>{entry[2]}</p>{index < entries.length - 1 && <i/>}</article>)}</section>
    <BottomNav active="garden" go={go}/>
  </section>;
}

export default function HomePage() {
  const [view, setView] = useState<View>('onboarding');
  const [daily, setDaily] = useState<DailyCheckin | null>(null);
  const dailyRef = useRef<DailyCheckin | null>(null);
  const viewRef = useRef<View>('onboarding');
  const [saveError, setSaveError] = useState(false);
  const [completedCare, setCompletedCare] = useState<string | null>(null);

  const readToday = () => {
    try {
      const record = parseDaily(localStorage.getItem(DAILY_KEY));
      if (!record || record.careRecommendations?.some(entry => entry.date === record.date)) return record;
      // Upgrade a previously completed v1 record once, outside the render path.
      const upgraded = { ...record, careRecommendations: ensureCareHistory(record.date, record.answers, record.careRecommendations) };
      try { localStorage.setItem(DAILY_KEY, JSON.stringify(upgraded)); }
      catch { setSaveError(true); } // Deterministic fallback remains usable if storage is full.
      return upgraded;
    }
    catch { return null; }
  };
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
      localStorage.setItem(DAILY_KEY, JSON.stringify(record));
      updateDaily(record);
      setSaveError(false);
      return true;
    } catch { setSaveError(true); return false; }
  };

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
    queueMicrotask(() => sync(true));
    const onBack = () => sync();
    const onResume = () => { if (document.visibilityState === 'visible') sync(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DAILY_KEY && event.key !== null) return;
      dailyRef.current = null;
      sync();
    };
    const timer = window.setInterval(() => {
      if (dailyRef.current && dailyRef.current.date !== localDay()) sync();
    }, 30000);
    window.addEventListener('popstate', onBack);
    window.addEventListener('hashchange', onBack);
    window.addEventListener('pageshow', onBack);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('popstate', onBack);
      window.removeEventListener('hashchange', onBack);
      window.removeEventListener('pageshow', onBack);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, []);

  const startCare = (state: PlantState, answers: string[], note: string) => {
    const existing = readToday();
    let history = existing?.careRecommendations ?? [];
    // Yesterday's answers do not unlock care, but its recommendation history survives.
    if (!existing) {
      try { history = readCareHistory(localStorage.getItem(DAILY_KEY)); }
      catch { /* The existing save path reports unavailable storage. */ }
    }
    const record: DailyCheckin = {
      version: 1, date: localDay(), answers, note, plantState: state, completedCareIds: existing?.completedCareIds ?? [],
    };
    record.careRecommendations = ensureCareHistory(record.date, answers, history);
    if (save(record)) show('care', true, record);
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
      {saveError && <p role="status" style={{ padding: 16 }}>이 브라우저에 기록을 저장하지 못했어요. 이 화면을 닫으면 기록이 사라질 수 있어요.</p>}
      {view === 'onboarding' && <Onboarding start={goHome}/>}
      {view === 'home' && <HomeScreen state={plantState} go={go} recorded={!!daily} completedCount={completedCount}/>}
      {view === 'checkin' && <CheckinScreen key={localDay()} onBack={goHome} onDone={startCare} initialRecord={daily}/>}
      {view === 'care' && daily && todayCares && <CareScreen state={plantState} recommendation={displayCareRecommendation(todayCares)} completed={completedCare} completedIds={daily.completedCareIds} onComplete={completeCare} onShowList={() => setCompletedCare(null)} goHome={goHome}/>}
      {view === 'garden' && <GardenScreen state={plantState} go={go}/>}
    </>
  </div></main>;
}
