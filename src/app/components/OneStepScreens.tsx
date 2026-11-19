'use client';
import './HomeLayout.css';
import './CareLayout.css';
import './CareCompletion.css';
import CareTimer from './CareTimer';
import timerStyles from './CareTimer.module.css';
import { useEffect, useRef, useState } from 'react';
import RivePlant, { type RivePlantState } from './RivePlant';
import { SunshineBalance, GardenTools } from './GardenFeatures';
import GardenPlacement from './GardenPlacement';
import { GrowthProgress } from './GrowthRewards';
import { StepHeader, RecordsCalendar } from './RecordScreens';
import { QUESTIONS, normalizeAnswers, plantStateForAnswers } from '../questions';
import type { DailyCheckin, GardenView } from '../daily-checkin';
import type { CareRecommendation } from '../recommend-cares';
import type { ShopState, shopSnapshot } from '../shop-store';
import type { ReflectionState } from '../../lib/account-reflection/store';
type View = GardenView;
type PlantState = RivePlantState;
type IconName = 'leaf' | 'note' | 'settings' | 'back' | 'drop' | 'cloud' | 'walk' | 'check' | 'arrow';
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
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

export function Plant({ state = 'normal', className = '', celebrate = false }: { state?: PlantState; className?: string; celebrate?: boolean }) {
  return <RivePlant state={state} className={className} celebrate={celebrate} />;
}

export function TopBar({ title, onBack, action }: { title: string; onBack?: () => void; action?: React.ReactNode }) {
  return <header className="top-bar"><div>{onBack && <button className="icon-button" onClick={onBack} aria-label="뒤로 가기"><Icon name="back" /></button>}</div><h1>{title}</h1><div>{action}</div></header>;
}

export function BottomNav({ active, go }: { active: 'home' | 'garden'; go: (v: View) => void }) {
  return <nav className="bottom-nav" aria-label="주요 메뉴">
    <button className={active === 'home' ? 'active' : ''} onClick={() => go('home')}><span className="nav-symbol" aria-hidden="true">♧</span><span>정원</span></button>
    <button className={active === 'garden' ? 'active' : ''} onClick={() => go('garden')}><span className="nav-symbol" aria-hidden="true">▤</span><span>기록</span></button>
  </nav>;
}

export function Onboarding({ start }: { start: () => void }) {
  return <section className="screen onboarding-screen">

    <div className="onboarding-visual"><RivePlant idleOnly className="plant-art" label="작은 정원에서 기다리는 식물" /></div>
    <div className="onboarding-copy"><h1>오늘의 나를<br/>만나러 가볼까요?</h1><p>작은 정원에서<br/>천천히 나를 돌봐요.</p></div>
    <div className="onboarding-action"><button className="primary-button" onClick={start}>시작하기 <Icon name="arrow" size={18}/></button><p>천천히 시작해도 괜찮아요.</p></div>
  </section>;
}

export function HomeScreen({ state, go, recorded, completedCount, resume, balance, shop, growthSnapshot, today }: { state: PlantState; go: (v: View) => void; recorded: boolean; completedCount: number; resume?: View; balance: number; shop: ShopState | null; growthSnapshot: ReturnType<typeof shopSnapshot> | null; today?: string }) {
  return <section className="screen home-screen">
    <div className="home-scroll-content">
    <TopBar title="오늘의 정원" action={<button className="icon-button" aria-label="설정" onClick={() => go('settings')}><span aria-hidden="true">⚙</span></button>}/>
    <div className={"garden-scene garden-scene--" + (shop?.layout.background ?? "default-sky")}><div className="scene-weather"><span className="cloud-shape one"/><span className="cloud-shape two"/></div><span className="scene-date">{(today ? new Date(today + 'T12:00:00+09:00') : new Date()).toLocaleDateString('ko-KR', { ...(today ? { timeZone: 'Asia/Seoul' } : {}), month: 'long', day: 'numeric', weekday: 'long' })}</span><SunshineBalance balance={balance}/><div className="hero-plant"><Plant state={state} className="plant-art" /></div><div className="soil-floor"/><GardenPlacement layout={shop?.layout ?? null}/></div>
    <GardenTools onOpen={go}/>
    <GrowthProgress snapshot={growthSnapshot} onOpen={() => go('rewards')}/>
    <div className="today-copy"><span className="eyebrow">오늘의 모습</span><h2>{state === 'low' ? '조금 지쳐 보여요.' : '편안하게 기다리고 있어요.'}</h2><p>{state === 'low' ? '오늘은 천천히 가도 괜찮아요.' : '오늘의 나를 가볍게 살펴볼까요?'}</p></div>
    {recorded && <p className="home-care-status">오늘의 작은 돌봄 {completedCount}/3 완료</p>}
    <div className="gentle-note"><span>✦</span><p><strong>다시 찾아와줘서 반가워요.</strong><br/>쉬어간 시간도 이 정원에 포근히 남아 있어요.</p></div>
    <div className="daily-value"><span>오늘의 가치</span><strong>자기 존중</strong></div>
    </div>
    <div className="home-progress-actions">
    <button className="primary-button home-cta" onClick={() => go(resume ?? (recorded ? 'care' : 'checkin'))}><span className="soft-icon"><Icon name="note" size={18}/></span>{resume && resume !== 'care' ? '오늘의 나 기록 이어하기' : !recorded ? '오늘의 나 기록하기' : completedCount === 0 ? '오늘의 작은 돌봄 시작하기' : completedCount === 3 ? '오늘의 돌봄 돌아보기' : '남은 작은 돌봄 이어하기'}</button>
    </div>
  </section>;
}

export function CheckinScreen({ onBack, onDone, onDraft, initialRecord, readOnly = false, account }: { onBack: () => void; onDone: (state: PlantState, answers: string[], note: string) => void; onDraft: (answers: string[]) => boolean; initialRecord: DailyCheckin | null; readOnly?: boolean; account?: { state: ReflectionState; reviewAnswers?: boolean; onAnswer: (question: number, value: string) => void; controls: React.ReactNode } }) {
  const [localStep, setStep] = useState(() => { const i = normalizeAnswers(initialRecord?.answers).findIndex(a => !a); return i < 0 ? 0 : i; });
  const [localAnswers, setAnswers] = useState<Record<number, string | undefined>>(() => Object.fromEntries(normalizeAnswers(initialRecord?.answers).map((answer, index) => [index, answer])));
  const reviewing = !!account && account.state.question === QUESTIONS.length && !account.state.pending;
  const step = account ? reviewing ? localStep : Math.min(account.state.question, 3) : localStep;
  const answers = account?.state.answers ?? localAnswers;
  const question = QUESTIONS[step];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const choose = (option: string) => {
    if (account) { if (account.state.phase === 'ready') account.onAnswer(step, option); return; }
    if (readOnly || timer.current) return;
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
  const back = () => { if (account) { if (reviewing && step > 0) setStep(step - 1); else onBack(); return; } if (timer.current) { clearTimeout(timer.current); timer.current = null; } if (step > 0) setStep(step - 1); else onBack(); };
  // Keep the original question layout for saved answers; review never writes.
  if (account && !reviewing && ['idle', 'loading', 'needs-start'].includes(account.state.phase)) {
    return <section className="screen checkin-screen"><TopBar title="오늘의 나" onBack={back}/><StepHeader step={1}/><div className="question-panel">{account.controls}</div></section>;
  }
  return <section className="screen checkin-screen">
    <TopBar title="오늘의 나" onBack={back}/><StepHeader step={1}/>
    <div className="progress-head"><span>{step + 1} / 4</span><div className="progress-track"><i style={{ width: ((step + 1) / 4) * 100 + '%' }}/></div><small>질문 진행</small></div>
    {readOnly && <div className="step-actions"><p role="status">답변 저장은 아직 준비 중이에요. 질문과 저장된 답변만 확인할 수 있어요.</p><button className="secondary-button" onClick={() => setStep((step + 1) % QUESTIONS.length)}>다음 질문 보기</button></div>}<div className="question-panel" key={step}>
      <div className={'question-mark' + (step === 0 ? ' question-mark--sleep' : '')}>{['☾','◐','○','♡'][step]}</div><p className={'question-kicker' + (step === 0 ? ' question-kicker--sleep' : '')}>오늘의 나를 가볍게 살펴봐요</p><h2>{question.title.split('\n').map(line => <span key={line}>{line}</span>)}</h2><p className="question-helper">{question.helper}</p>
      <div className="choice-list">{question.options.map((option, index) => <button key={option.value} className={answers[step] === option.value ? 'selected' : ''} disabled={readOnly || (account ? account.state.phase !== 'ready' : !!initialRecord?.answers.every(Boolean) && initialRecord?.stage !== 'checkin')} onClick={() => choose(option.value)}><span className="choice-dot">{index + 1}</span><strong>{option.label}</strong>{answers[step] === option.value && <Icon name="check" size={18}/>}</button>)}</div>
      {reviewing && account?.reviewAnswers !== false && <div className="step-actions"><p className="privacy-note">저장된 답변을 확인하고 있어요.</p><button className="secondary-button" onClick={() => setStep((step + 1) % QUESTIONS.length)}>{step === 3 ? '첫 질문 다시 보기' : '다음 질문 보기'}</button></div>}
      {account?.controls}
      {initialRecord?.answers.every(Boolean) && initialRecord?.stage !== 'checkin' && <div className="step-actions"><p className="privacy-note">추천 행동과 연결된 돌아보기 응답은 그대로 보관해요.</p><button className="primary-button" onClick={() => onDone(plantStateForAnswers(initialRecord.answers), initialRecord.answers, initialRecord.note)}>기록 이어가기</button></div>}
    </div>
  </section>;
}

export function CareScreen({ state, recommendation, completed, completedIds, onComplete, onShowList, goHome, readOnly = false }: { state: PlantState; recommendation: CareRecommendation; completed: string | null; completedIds: string[]; onComplete: (id: string) => void; onShowList: () => void; goHome: () => void; readOnly?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [started, setStarted] = useState<string[]>([]);
  const completedCount = recommendation.cares.filter(care => completedIds.includes(care.id)).length;
  const allCaredFor = completedCount === recommendation.cares.length;
  const returnToList = () => { setSelected(null); setStarted([]); onShowList(); };
  if (completed) return <section className="screen completion-screen">
    <div className="completion-center">
      <div className="completion-scene"><span className="spark s1" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg></span><span className="spark s2" aria-hidden="true"><Icon name="leaf" size={18}/></span><Plant state={state} celebrate className="plant-art"/></div>
      <div className="completion-copy"><span className="completion-check" aria-hidden="true"><Icon name="check" size={20}/></span><p className="eyebrow">작은 돌봄 완료</p><h1>{allCaredFor ? '오늘의 돌봄을 모두 마쳤어요!' : '작은 돌봄을 완료했어요!'}</h1><p className="completion-description">나를 위해 내어 준 작은 시간,<br/>오늘의 정원에 따뜻하게 남았어요.</p><div className="completion-progress"><span className="completion-status">오늘 {completedCount}/{recommendation.cares.length} 완료</span><span className="completion-dots" aria-hidden="true">{recommendation.cares.map((care) => <i key={care.id} className={completedIds.includes(care.id) ? 'is-complete' : ''}/>)}</span></div></div>
    </div>
    <div className="completion-actions"><button className="primary-button" onClick={allCaredFor ? goHome : returnToList}>{allCaredFor ? '정원에서 변화 보기' : '다른 돌봄 해보기'}</button><button className="secondary-button" onClick={allCaredFor ? returnToList : goHome}>{allCaredFor ? '오늘의 돌봄 다시보기' : '정원에서 변화 보기'}</button></div>
  </section>;
  return <section className="screen care-screen">
    <TopBar title="오늘의 작은 돌봄" onBack={goHome}/>
    <div className="care-intro"><span className="eyebrow">오늘의 마음을 바라봤어요</span><h2>{recommendation.title.split('\n').map((line, index) => <span key={line}>{index > 0 && <br/>}{line}</span>)}</h2><p>이 중 하나만 해도 괜찮아요.</p><span className="care-progress">오늘의 작은 돌봄 {completedCount}/{recommendation.cares.length} 완료</span></div>
    <div className="care-list">{recommendation.cares.map((care) => {
      const done = completedIds.includes(care.id), expanded = selected === care.id && !done;
      return <article className={`care-card${done ? ' care-card-done' : ''}${expanded ? ' ' + timerStyles.active : ''}`} key={care.id}>
        <div className={`care-icon ${care.tone}`}><Icon name={care.icon}/></div>
        <div className="care-copy"><h3>{care.title}</h3></div>
        <p className="care-summary">{care.copy}</p>
        <span className="care-meta">{done ? '✓ 완료했어요' : care.meta}</span>
        {done ? <span className={timerStyles.done} role="img" aria-label="완료한 돌봄"><Icon name="check" size={18}/></span> : !expanded && <button onClick={() => setSelected(care.id)} aria-expanded={false}>{started.includes(care.id) ? '이어보기' : '선택하기'}</button>}
        {!done && <div className={`${timerStyles.expansion}${expanded ? ' ' + timerStyles.open : ''}`} data-care-expansion data-open={expanded} aria-hidden={!expanded} inert={!expanded}>
          <div className={timerStyles.clip}><div className={timerStyles.details}>
            <div className={timerStyles.detailHeader}><span>실천 안내</span><button className={timerStyles.collapse} title={started.includes(care.id) ? '접어도 타이머 상태는 유지돼요' : undefined} onClick={() => setSelected(null)}>접기</button></div>
            {care.instruction && care.instruction !== care.copy && <p>{care.instruction}</p>}{care.example && <p>예: {care.example}</p>}{care.helper && care.helper !== care.copy && care.helper !== care.instruction && <p>{care.helper}</p>}
            {started.includes(care.id) ? <CareTimer key={care.id} minutes={care.minutes} disabled={readOnly} onComplete={() => onComplete(care.id)}/> : <button className="primary-button" disabled={readOnly} onClick={() => setStarted(ids => [...ids, care.id])}>{readOnly ? '지금은 완료할 수 없어요' : '해볼게요'}</button>}
          </div></div>
        </div>}
      </article>;
    })}</div>
    <button className="rest-choice" onClick={goHome}>오늘은 아무것도 하지 않아도 괜찮아요.</button><div className="care-plant"><Plant state={state} className="plant-art"/></div>
  </section>;
}

export function GardenScreen({ records, onSave }: { records: DailyCheckin[]; onSave: (record: DailyCheckin) => boolean }) {
  return <section className="screen garden-history-screen"><TopBar title="나의 기록"/><RecordsCalendar records={records} onSave={onSave}/></section>;
}

