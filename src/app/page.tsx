'use client';

import { useEffect, useRef, useState } from 'react';
import RivePlant, { RivePlantState } from './components/RivePlant';

import { DAILY_KEY, localDay, parseDaily, resolveView, type DailyCheckin, type GardenView } from './daily-checkin';
type View = GardenView;
type PlantState = RivePlantState;
type IconName = 'leaf' | 'note' | 'settings' | 'back' | 'drop' | 'cloud' | 'walk' | 'check' | 'arrow';

const QUESTIONS = [
  { title: '오늘 잠은 어땠나요?', helper: '완벽하게 기억하지 않아도 괜찮아요.', options: ['많이 힘들었어요', '조금 뒤척였어요', '그냥 그래요', '괜찮게 잤어요'] },
  { title: '지금 에너지는\n어느 정도인가요?', helper: '지금 이 순간에 가장 가까운 것을 골라주세요.', options: ['매우 낮음', '낮음', '보통', '괜찮음', '충분함'] },
  { title: '오늘 식사는 어땠나요?', helper: '잘 챙기지 못한 날도 있는 그대로 괜찮아요.', options: ['거의 못 먹었어요', '조금 먹었어요', '평소와 비슷해요', '든든하게 먹었어요'] },
  { title: '지금 마음은 어떤가요?', helper: '이름 붙이기 어려운 마음도 괜찮아요.', options: ['많이 지쳐요', '조금 무거워요', '잔잔해요', '괜찮아요', '가벼워요'] },
];

const CARES = [
  { id: 'water', icon: 'drop' as IconName, title: '물 한 컵', copy: '몸에 물을 조금 채워줘요.', meta: '1분 · 아주 쉬움' },
  { id: 'sky', icon: 'cloud' as IconName, title: '하늘 바라보기', copy: '창문을 열고 2분만 바라봐요.', meta: '2분 · 아주 쉬움' },
  { id: 'walk', icon: 'walk' as IconName, title: '5분 걷기', copy: '멀리 가지 않아도 괜찮아요.', meta: '5분 · 쉬움' },
];

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
    <button className={active === 'home' ? 'active' : ''} onClick={() => go('home')}><Icon name="leaf"/><span>정원</span></button>
    <button className={active === 'garden' ? 'active' : ''} onClick={() => go('garden')}><Icon name="note"/><span>기록</span></button>
  </nav>;
}

function Onboarding({ start }: { start: () => void }) {
  return <section className="screen onboarding-screen">
    <button className="skip-button" onClick={start}>건너뛰기</button>
    <div className="onboarding-visual"><span className="sun-orb"/><span className="floating-leaf leaf-a">⌁</span><span className="floating-leaf leaf-b">⌁</span><Plant state="normal" className="plant-art" /></div>
    <div className="onboarding-copy"><span className="eyebrow">A LITTLE GARDEN FOR ME</span><h1>나를 돌보는 작은<br/>정원을 만들어볼까요?</h1><p>당신의 상태에 따라<br/>식물의 모습도 조금씩 달라져요.</p></div>
    <div className="onboarding-action"><button className="primary-button" onClick={start}>시작하기 <Icon name="arrow" size={18}/></button><p>천천히 시작해도 괜찮아요.</p></div>
  </section>;
}

function HomeScreen({ state, go, recorded }: { state: PlantState; go: (v: View) => void; recorded: boolean }) {
  return <section className="screen home-screen">
    <TopBar title="오늘의 정원" action={<button className="icon-button" aria-label="설정"><Icon name="settings" size={20}/></button>}/>
    <div className="garden-scene"><div className="scene-weather"><span className="cloud-shape one"/><span className="cloud-shape two"/></div><span className="scene-date">10월 1일 · 목요일</span><div className="hero-plant"><Plant state={state} className="plant-art" /></div><div className="soil-floor"/></div>
    <div className="today-copy"><span className="eyebrow">오늘의 모습</span><h2>{state === 'low' ? '조금 지쳐 보여요.' : '편안하게 기다리고 있어요.'}</h2><p>{state === 'low' ? '오늘은 천천히 가도 괜찮아요.' : '오늘의 나를 가볍게 살펴볼까요?'}</p></div>
    <button className="primary-button home-cta" onClick={() => go('checkin')}><span className="soft-icon"><Icon name="note" size={18}/></span>{recorded ? '오늘의 작은 돌봄 다시 보기' : '오늘의 나 기록하기'}</button>
    <div className="gentle-note"><span>✦</span><p><strong>다시 찾아와줘서 반가워요.</strong><br/>쉬어간 시간도 이 정원에 포근히 남아 있어요.</p></div>
    <BottomNav active="home" go={go}/>
  </section>;
}

function CheckinScreen({ onBack, onDone, initialRecord }: { onBack: () => void; onDone: (state: PlantState, answers: string[], note: string) => void; initialRecord: DailyCheckin | null }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>(() => Object.fromEntries(initialRecord?.answers.map((answer, index) => [index, answer]) ?? []));
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
    const low = QUESTIONS.some((q, i) => {
      const index = q.options.indexOf(answers[i]);
      return index >= 0 && index < 2;
    });
    if (QUESTIONS.some((q, i) => !q.options.includes(answers[i]))) return;
    onDone(low ? 'low' : 'normal', QUESTIONS.map((_, i) => answers[i]), note);
  };
  return <section className="screen checkin-screen">
    <TopBar title="오늘의 나" onBack={step > 0 ? () => setStep((old) => old - 1) : onBack}/>
    <div className="progress-head"><span>{Math.min(step + 1, 4)} / 4</span><div className="progress-track"><i style={{ width: `${Math.min(((step + 1) / 4) * 100, 100)}%` }}/></div><small>약 30초</small></div>
    {!isNote ? <div className="question-panel" key={step}>
      <div className="question-mark">{['☾','◐','○','♡'][step]}</div><p className="question-kicker">오늘의 나를 가볍게 살펴봐요</p><h2>{question.title.split('\n').map((line) => <span key={line}>{line}</span>)}</h2><p className="question-helper">{question.helper}</p>
      <div className="choice-list">{question.options.map((option, index) => <button key={option} className={answers[step] === option ? 'selected' : ''} onClick={() => choose(option)}><span className="choice-dot">{index + 1}</span><strong>{option}</strong>{answers[step] === option && <Icon name="check" size={18}/>}</button>)}</div>
    </div> : <div className="question-panel note-panel">
      <div className="question-mark">✎</div><p className="question-kicker">마지막으로, 선택 사항이에요</p><h2>오늘을 한마디로<br/>남겨볼까요?</h2><p className="question-helper">잘 정리된 문장이 아니어도 괜찮아요.</p>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="마음에 남은 순간을 적어보세요."/><span className="text-count">{note.length} / 120</span><button className="primary-button" onClick={finish}>오늘의 나를 살펴봤어요</button><button className="text-button" onClick={finish}>건너뛰어도 괜찮아요</button>
    </div>}
  </section>;
}

function CareScreen({ state, completed, completedIds, onComplete, goHome }: { state: PlantState; completed: string | null; completedIds: string[]; onComplete: (id: string) => void; goHome: () => void }) {
  const [started, setStarted] = useState<string | null>(null);
  if (completed) return <section className="screen completion-screen">
    <div className="completion-scene"><span className="droplet d1"/><span className="droplet d2"/><span className="spark s1">✦</span><span className="spark s2">✦</span><Plant state={state} celebrate className="plant-art lifted"/></div>
    <div className="completion-copy"><span className="completion-check"><Icon name="check" size={22}/></span><p className="eyebrow">작은 변화가 도착했어요</p><h1>오늘의 나를 위해<br/>하나를 해냈어요.</h1><p>아주 작은 돌봄도 충분해요.<br/>식물의 잎이 살짝 고개를 들었어요.</p></div>
    <div className="completion-actions"><button className="primary-button" onClick={goHome}>정원에서 변화 보기</button><p>내일도, 생각날 때 다시 만나요.</p></div>
  </section>;
  return <section className="screen care-screen">
    <TopBar title="오늘의 작은 돌봄" onBack={goHome}/>
    <div className="care-intro"><span className="eyebrow">오늘의 마음을 바라봤어요</span><h2>{state === 'low' ? <>오늘은 조금<br/>지친 날이네요.</> : <>오늘의 나를<br/>살펴봤어요.</>}</h2><p>그래서 오늘은 이것만 해볼까요?</p></div>
    <div className="care-list">{CARES.map((care) => <article className="care-card" key={care.id}><div className={`care-icon ${care.id}`}><Icon name={care.icon}/></div><div className="care-copy"><h3>{care.title}</h3><p>{care.copy}</p><span>{care.meta}</span></div><button disabled={completedIds.includes(care.id)} onClick={() => started === care.id ? onComplete(care.id) : setStarted(care.id)}>{completedIds.includes(care.id) ? '돌봄 완료' : started === care.id ? '완료했어요' : '해볼게요'}</button></article>)}</div>
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
  const [view, setView] = useState<View>('home');
  const [daily, setDaily] = useState<DailyCheckin | null>(null);
  const dailyRef = useRef<DailyCheckin | null>(null);
  const viewRef = useRef<View>('home');
  const [saveError, setSaveError] = useState(false);
  const [completedCare, setCompletedCare] = useState<string | null>(null);

  const readToday = () => {
    try { return parseDaily(localStorage.getItem(DAILY_KEY)); }
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
      // Fresh entries start at home; unauthorized care links go to check-in.
      const next = resolveView(initial && !(requested === 'care' && !record) ? 'home' : requested, record);
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
    const record: DailyCheckin = {
      version: 1, date: localDay(), answers, note, plantState: state, completedCareIds: existing?.completedCareIds ?? [],
    };
    if (save(record)) show('care', true, record);
  };
  const completeCare = (id: string) => {
    const record = readToday();
    if (!record) { show('checkin', true, null); return; }
    if (record.completedCareIds.includes(id)) return;
    if (save({ ...record, completedCareIds: [...record.completedCareIds, id] })) setCompletedCare(id);
  };
  const go = (target: View) => show(target);
  const goHome = () => show('home', viewRef.current === 'onboarding' || viewRef.current === 'checkin');
  const plantState = daily?.plantState ?? 'normal';

  return <main className="app-shell"><div className="phone-frame">
    <>
      {saveError && <p role="status" style={{ padding: 16 }}>이 브라우저에 기록을 저장하지 못했어요. 이 화면을 닫으면 기록이 사라질 수 있어요.</p>}
      {view === 'onboarding' && <Onboarding start={goHome}/>}
      {view === 'home' && <HomeScreen state={plantState} go={go} recorded={!!daily}/>}
      {view === 'checkin' && <CheckinScreen key={localDay()} onBack={goHome} onDone={startCare} initialRecord={daily}/>}
      {view === 'care' && daily && <CareScreen state={plantState} completed={completedCare} completedIds={daily.completedCareIds} onComplete={completeCare} goHome={goHome}/>}
      {view === 'garden' && <GardenScreen state={plantState} go={go}/>}
    </>
  </div></main>;
}
