'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { adoptCompanion, chooseCompanion, companion as companionInfo, markLevelSeen, readCompanions, type CompanionId, type CompanionState } from './companions';
import { CompanionArt, CompanionCollection, CompanionPicker, CompanionStatus } from './components/Companions';
import { dataScope, developerToolsAvailable, hasConsent, saveConsent, setDeveloperMode, DEVELOPER_MODE_KEY, TEST_DATA_KEY, PREVIEW_DATA_KEY } from './app-storage';
import SafetyCenter, { HelpLink } from './components/SafetyCenter';
import CareReason from './components/CareReason';
import CompanionMissions from './components/Missions';
import RecoveryMissions from './components/RecoveryMissions';
import CareTimer from './components/CareTimer';
import { presentTodayCare } from './cares';
import MedicationManagement from './components/MedicationManagement';
import { GardenProfileForm, PotNameForm } from './components/GardenProfile';
import { usePersonalGarden } from './components/PersonalGarden';
import Places from './components/Places';
import { ConnectionNudge, ConnectionsScreen } from './components/Connections';
import { GuardianSettings } from './components/Guardian';
import { guardianAvailable, syncGuardianShare } from './guardian-share';
import { moodSnapshot } from './wellbeing';
import type { RecoveryId } from './mission-policy';
import TalkToFriend from './components/TalkToFriend';
import SupportPrograms, { PrivacyPolicy } from './components/SupportPrograms';
import { SettingsScreen, DeveloperSettings } from './components/DeveloperSettings';
import { GardenTools } from './components/GardenFeatures';
import { DressUp, Inventory } from './components/Wardrobe';
import { petGrowth, type Growth } from './pet-growth';
import { readOutfit, wear } from './wardrobe';
import { shopItem, type OutfitSlot, type ShopItem } from './shop-catalog';

import { DAILY_KEY, localDay, resolveView, type DailyCheckin, type GardenView } from './daily-checkin';
import { QUESTIONS, normalizeAnswers, plantStateForAnswers } from './questions';
import type { CareRecommendation } from './recommend-cares';
import { displayCareRecommendation, ensureCareHistory } from './daily-cares';
import { cleanupPhotos, emptyRecord, readRecords, recordStorageWarning, RECORDS_KEY, saveRecord } from './record-store';
import { ReflectionExtras, RecordsCalendar, StepHeader, hasUnsavedDrafts } from './components/RecordScreens';

import { type SunshineReason } from './sunshine';
import { GREETING } from './chat';
import GardenShop from './components/GardenShop';
import GardenPlacement from './components/GardenPlacement';
import { GrowthProgress, GrowthRewardsScreen, OptionalCareScreen } from './components/GrowthRewards';
import { SHOP_KEY, ownedItemIds, shopSnapshot, syncGrowthRewards, type ShopState } from './shop-store';
import { newSunshineNotices, enqueueSunshineNotices, SUNSHINE_NOTICE_MS, type SunshineNotice } from './sunshine-notifications';
type View = GardenView;
type PlantState = DailyCheckin['plantState'];
type IconName = 'leaf' | 'note' | 'settings' | 'back' | 'drop' | 'cloud' | 'walk' | 'check' | 'arrow' | 'diary' | 'heart' | 'home' | 'sun' | 'brush' | 'map';
// Night follows the device clock; the default sky turns into a night sky.
const isNight = (now = new Date()) => now.getHours() < 6 || now.getHours() >= 19;


function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (name === 'home') return <svg {...p}><path d="M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15V15h-6v5.5H5.5A1.5 1.5 0 0 1 4 19v-7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
  if (name === 'map') return <svg {...p}><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Zm6-2v14m6-12v14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
  if (name === 'sun') return <svg {...p}><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (name === 'brush') return <svg {...p}><path d="m4 20 4-1 11-11-3-3L5 16l-1 4Zm10-13 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 3v4M3 5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (name === 'diary') return <svg {...p}><path d="M6 4.5h10.5A1.5 1.5 0 0 1 18 6v13.5H7.5A1.5 1.5 0 0 1 6 18V4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M6 18a1.5 1.5 0 0 1 1.5-1.5H18M10 4.5V10l1.75-1.2L13.5 10V4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (name === 'heart') return <svg {...p}><path d="M12 19.5s-7-4.2-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.3c0 5-7 9.2-7 9.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
  if (name === 'leaf') return <svg {...p}><path d="M12 21v-9m0 2c-1-5-6-6-8-5 0 4 3 7 8 5Zm0-3c1-5 6-6 8-5 0 4-3 7-8 5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === 'note') return <svg {...p}><path d="M6 4.5h12v15H6zM9 9h6m-6 4h6m-6 4h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === 'settings') return <svg {...p}><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M10.3 3.5h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.9l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9 1.8-1.6v-1.9L4.2 8.9 5.9 6l2.3.8 1.6-.9.5-2.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
  if (name === 'back') return <svg {...p}><path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === 'drop') return <svg {...p}><path d="M12 3s6 6.2 6 11a6 6 0 1 1-12 0c0-4.8 6-11 6-11Z" stroke="currentColor" strokeWidth="1.6"/><path d="M9.5 15.5c.6 1.2 1.5 1.8 2.8 1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
  if (name === 'cloud') return <svg {...p}><path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.3A3.4 3.4 0 0 0 7 18Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (name === 'walk') return <svg {...p}><circle cx="13" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.6"/><path d="m10 21 2-6-2-3 2-4 3 3 3 1M7 14l3-2m5 9-3-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (name === 'check') return <svg {...p}><path d="m5 12 4.2 4.2L19 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  return <svg {...p}><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

type ActiveCompanion = { id: CompanionId; stage: Growth['tree']['stage']['level'] } | null;
function Plant({ state = 'normal', className = '', celebrate = false, active = null, outfit }: { state?: PlantState; className?: string; celebrate?: boolean; active?: ActiveCompanion; outfit?: ReturnType<typeof readOutfit> }) {
  return <CompanionArt id={active?.id ?? 'bonsai'} stage={active?.stage} low={state === 'low'} celebrate={celebrate} className={className} outfit={outfit} interactive={false}/>;
}

// The help link takes whichever side slot is free, so every top bar can open the safety center.
function TopBar({ title, onBack, action, help = true }: { title: string; onBack?: () => void; action?: React.ReactNode; help?: boolean }) {
  return <header className="top-bar"><div>{onBack ? <button className="icon-button" onClick={onBack} aria-label="뒤로 가기"><Icon name="back" /></button> : help && action && <HelpLink/>}</div><h1>{title}</h1><div>{action ?? (help && <HelpLink/>)}</div></header>;
}

const NAV_TABS = [['home', 'home', '홈'], ['garden', 'diary', '일기'], ['map', 'map', '지도'], ['decorate', 'brush', '꾸미기'], ['settings', 'settings', '설정']] as const;
type Tab = typeof NAV_TABS[number][0];
const STYLE_VIEWS: View[] = ['decorate', 'dress', 'items', 'shop', 'rewards', 'extra-care'];
// The tab a screen belongs to; null = a focused flow (check-in, completion, sub pages) without the bar.
const tabOf = (view: View, caring: boolean): Tab | null => view === 'home' || view === 'map' || view === 'garden' || view === 'settings' ? view
  : view === 'care' ? (caring ? 'garden' : null) : STYLE_VIEWS.includes(view) ? 'decorate' : ['companions', 'guardian', 'connections'].includes(view) ? 'settings' : null;
const journalView = (target: string) => target === 'today' || target === 'diary' ? 'garden' : target;
const SWIPE_MIN = 70; // px; shorter or mostly vertical drags stay scrolls
const SWIPE_IGNORE = '.companion-art, .pet-menu, .pet-menu-backdrop, .insights-chart, .missions-carousel, .period-rail, .places-rail, .places-map, .garden-mood-strip, .camera-sheet, .chat-sheet, .help-sheet, input, textarea, select'; // these own their sideways gestures
function BottomNav({ active, go }: { active: Tab; go: (v: View) => void }) {
  return <nav className="bottom-nav" aria-label="주요 메뉴">
    {NAV_TABS.map(([target, icon, label]) => <button key={target} className={active === target ? 'active' : ''} aria-current={active === target ? 'page' : undefined} onClick={() => go(target)}><span className="nav-symbol" aria-hidden="true"><Icon name={icon} size={22}/>{target === 'garden' && active === 'home' && <i className="diary-reminder"/>}</span><span>{label}</span></button>)}
  </nav>;
}

const CONSENT_ITEMS = ['만 19세 이상이에요.', '진단이나 치료를 하는 의료 서비스가 아니라는 걸 알고 있어요.', '응급 상황을 대신 대응하지 않아요. 위급하면 109·112·119에 연락할게요.', '개인정보 처리방침을 읽고 확인했어요.'];

function Onboarding({ start }: { start: (firstTime: boolean) => void }) {
  const [asking, setAsking] = useState(false);
  const [checked, setChecked] = useState(() => CONSENT_ITEMS.map(() => false));
  const [error, setError] = useState('');
  const agree = () => {
    try { saveConsent(); start(true); }
    catch { setError('확인 내용을 저장하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.'); }
  };
  return <section className="screen onboarding-screen">

    <div className="onboarding-visual"><Plant className="plant-art"/></div>
    <div className="onboarding-copy"><h1>오늘의 나를<br/>만나러 가볼까요?</h1><p>작은 정원에서<br/>천천히 나를 돌봐요.</p></div>
    <div className="onboarding-action">
      {asking ? <fieldset className="consent-box"><legend>시작하기 전에 확인해 주세요</legend>
        {CONSENT_ITEMS.map((text, i) => <label key={text} className="consent-item"><input type="checkbox" checked={checked[i]} onChange={event => setChecked(values => values.map((value, j) => j === i ? event.target.checked : value))}/><span>{text}</span></label>)}
        <a className="text-button consent-policy" href="#privacy">개인정보 처리방침 보기</a>
        <button className="primary-button" disabled={!checked.every(Boolean)} onClick={agree}>확인하고 시작하기 <Icon name="arrow" size={18}/></button>
        {error && <p role="alert" className="record-error">{error}</p>}
      </fieldset> : <><button className="primary-button" onClick={() => hasConsent() ? start(false) : setAsking(true)}>시작하기 <Icon name="arrow" size={18}/></button><p>천천히 시작해도 괜찮아요.</p></>}
      <a className="text-button onboarding-help" href="#safety">지금 많이 힘들다면, 도움 받을 수 있는 곳</a>
    </div>
  </section>;
}

// The friend fills the screen. Help, level and the diary shortcut float above the talk bar.
function HomeScreen({ state, go, shop, companion, growth, outfit, night, news, onWriteDiary }: { state: PlantState; go: (v: View) => void; shop: ShopState | null; companion: ActiveCompanion; growth: Growth | null; outfit?: ReturnType<typeof readOutfit>; night: boolean; news?: React.ReactNode; onWriteDiary: () => void }) {
  const garden = usePersonalGarden();
  const background = shop?.layout.background ?? 'default-sky';
  const sceneClass = 'garden-scene pet-scene garden-scene--' + background + (night && background === 'default-sky' ? ' garden-scene--night' : '');
  const ground = <><div className="scene-weather"><span className="cloud-shape one"/><span className="cloud-shape two"/></div><div className="soil-floor"/><GardenPlacement layout={shop?.layout ?? null}/></>;
  return <section className="screen pet-home">
    <h1 className="sr-only">오늘의 정원</h1>
    <ConnectionNudge onOpen={() => go('connections')}/>
    {companion && growth ? <TalkToFriend id={companion.id} name={garden?.names[companion.id] ?? companionInfo(companion.id).name} low={state === 'low'} sceneClass={sceneClass}
      intro={garden?.profile ? garden.profile.displayName + '님, 오늘 하루는 어땠어요?' : GREETING}
      growth={growth} outfit={outfit} news={news} onOpen={go} onWriteDiary={onWriteDiary}>{ground}</TalkToFriend>
      : <div className={sceneClass}><div className="pet-ground" aria-hidden="true"/><div className="pet-stage">{ground}<div className="hero-plant"><Plant state={state} className="plant-art"/></div></div>
        <div className="pet-bottom"><button type="button" className="primary-button" onClick={() => go('companion')}>함께할 친구를 골라 보세요</button></div></div>}
  </section>;
}

const STYLE_TABS = [['decorate', '집 꾸미기'], ['dress', '옷 입히기'], ['items', '아이템 창']] as const;
// 꾸미기 tab: the house (garden) and the friend's clothes are separate, and the item window shows everything collected.
function StyleHub({ view, go, giftPending, children }: { view: View; go: (v: View) => void; giftPending: boolean; children: React.ReactNode }) {
  return <section className="screen style-screen">
    <TopBar title="꾸미기"/>
    <nav className="style-tabs" aria-label="꾸미기 종류">{STYLE_TABS.map(([target, label]) => <button key={target} type="button" aria-current={view === target ? 'page' : undefined} onClick={() => go(target)}>{label}</button>)}</nav>
    <GardenTools onOpen={go} giftPending={giftPending}/>
    {children}
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
      <div className={'question-mark' + (step === 0 ? ' question-mark--sleep' : '')} aria-hidden="true"/><p className={'question-kicker' + (step === 0 ? ' question-kicker--sleep' : '')}>오늘의 나를 가볍게 살펴봐요</p><h2>{question.title.split('\n').map(line => <span key={line}>{line}</span>)}</h2><p className="question-helper">{question.helper}</p>
      <div className="choice-list">{question.options.map((option, index) => <button key={option.value} className={answers[step] === option.value ? 'selected' : ''} disabled={!!initialRecord?.answers.every(Boolean) && initialRecord?.stage !== 'checkin'} onClick={() => choose(option.value)}><span className="choice-dot">{index + 1}</span><strong>{option.label}</strong>{answers[step] === option.value && <Icon name="check" size={18}/>}</button>)}</div>
      {initialRecord?.answers.every(Boolean) && initialRecord?.stage !== 'checkin' && <div className="step-actions"><p className="privacy-note">추천 행동과 연결된 돌아보기 응답은 그대로 보관해요.</p><button className="primary-button" onClick={() => onDone(plantStateForAnswers(initialRecord.answers), initialRecord.answers, initialRecord.note)}>기록 이어가기</button></div>}
    </div>
  </section>;
}

function CareScreen({ state, companion, answers, recommendation, completed, completedIds, onComplete, onShowList, goHome, onMore }: { state: PlantState; companion: ActiveCompanion; answers: string[]; recommendation: CareRecommendation; completed: string | null; completedIds: string[]; onComplete: (id: string) => void; onShowList: () => void; goHome: () => void; onMore?: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const cards = recommendation.cares.map(presentTodayCare);
  const completedCount = cards.filter(care => completedIds.includes(care.id)).length;
  const allCaredFor = completedCount === cards.length;
  const selectedCare = cards.find(care => care.id === selected);
  const returnToList = () => { setSelected(null); setStarted(null); onShowList(); };
  if (completed) return <section className="screen completion-screen">
    <div className="completion-scene"><span className="droplet d1"/><span className="droplet d2"/><span className="spark s1">✦</span><span className="spark s2">✦</span><Plant state={state} celebrate className="plant-art lifted" active={companion}/></div>
    <div className="completion-copy"><span className="completion-check"><Icon name="check" size={22}/></span><p className="eyebrow">작은 변화가 도착했어요</p><h1>{allCaredFor ? '오늘의 작은 돌봄을 모두 완료했어요! 🌼' : '작은 돌봄을 완료했어요! 🌷'}</h1><p>{allCaredFor ? '오늘도 나를 돌보는 시간을 만들어 주었네요.' : '오늘도 나를 위해 소중한 시간을 내주었네요.'}</p><p className="kind-message">오늘의 작은 쉼도 소중한 돌봄이에요.</p><p className="completion-status">오늘 {completedCount}/3 완료</p></div>
    <div className="completion-actions"><button className="primary-button" onClick={allCaredFor ? goHome : returnToList}>{allCaredFor ? '정원에서 변화 보기' : '다른 작은 돌봄 이어하기'}</button><button className="secondary-button" onClick={allCaredFor ? returnToList : goHome}>{allCaredFor ? '오늘의 돌봄 다시보기' : '정원에서 변화 보기'}</button></div>
  </section>;
  if (selectedCare) {
    const alreadyCompleted = completedIds.includes(selectedCare.id);
    return <section className="screen care-screen care-detail-screen">
      <TopBar title="오늘의 돌봄" onBack={returnToList}/>
      <div className="care-detail-content">
        <div className={`care-icon ${selectedCare.tone}`}><Icon name={selectedCare.icon} size={30}/></div>
        <span className="eyebrow">오늘 나를 위한 작은 시간</span>
        <h2>{selectedCare.title}</h2><p>{selectedCare.instruction ?? selectedCare.copy}</p>{selectedCare.example && <p>예: {selectedCare.example}</p>}{selectedCare.helper && <p>{selectedCare.helper}</p>}<span className="care-detail-meta">{selectedCare.meta}</span>
        {alreadyCompleted && <span className="care-detail-done"><Icon name="check" size={16}/> 완료했어요</span>}
      </div>
      <div className="care-detail-actions">{alreadyCompleted ? <button className="primary-button care-action" onClick={returnToList}>목록으로 돌아가기</button>
        : started === selectedCare.id ? <CareTimer key={selectedCare.id} minutes={selectedCare.minutes} disabled={false} onComplete={() => onComplete(selectedCare.id)}/>
        : <button className="primary-button care-action" onClick={() => setStarted(selectedCare.id)}><Icon name="arrow" size={16}/>시작하기</button>}</div>
    </section>;
  }
  return <section className="screen care-screen">
    <TopBar title="오늘의 돌봄" onBack={goHome}/>
    <div className="care-intro"><span className="eyebrow">오늘의 마음을 바라봤어요</span><h2>{recommendation.title.split('\n').map((line, index) => <span key={line}>{index > 0 && <br/>}{line}</span>)}</h2><p>이 중 하나만 해도 괜찮아요.</p><CareReason answers={answers} careIds={recommendation.cares.map(care => care.id)}/><span className="care-progress">오늘의 작은 돌봄 {completedCount}/3 완료</span></div>
    <div className="care-list">{cards.map((care) => { const done = completedIds.includes(care.id); return <article className={`care-card${done ? ' care-card-done' : ''}`} key={care.id}><div className={`care-icon ${care.tone}`}><Icon name={care.icon}/></div><div className="care-copy"><h3>{care.title}</h3><p>{care.copy}</p><span>{done ? '✓ 완료했어요' : care.meta}</span></div><button type="button" className="care-action" onClick={() => { setSelected(care.id); setStarted(null); }}>{done ? '다시 보기' : '선택하기'}</button></article>; })}</div>
    {onMore && <button type="button" className="text-button care-more" onClick={onMore}>다른 돌봄 보기 <Icon name="arrow" size={16}/></button>}
    <a className="text-button support-link" href="#support">받을 수 있는 지원 제도 살펴보기</a>
    <button className="rest-choice" onClick={goHome}>오늘은 아무것도 하지 않아도 괜찮아요.</button><div className="care-plant"><Plant state={state} className="plant-art" active={companion}/></div>
  </section>;
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
  const [testEnabled, setTestEnabled] = useState(false);
  const [datasetEpoch, setDatasetEpoch] = useState(0);
  const [daily, setDaily] = useState<DailyCheckin | null>(null);
  const dailyRef = useRef<DailyCheckin | null>(null);
  const viewRef = useRef<View>('onboarding');
  const [records, setRecords] = useState<DailyCheckin[]>([]);
  const [saveError, setSaveError] = useState('');
  const [commerce, setCommerce] = useState<ReturnType<typeof shopSnapshot> | null>(null);
  const [shopError, setShopError] = useState('');
  const [rewardError, setRewardError] = useState('');
  const [decorationItem, setDecorationItem] = useState<string | null>(null);
  const [shopSelect, setShopSelect] = useState<string | null>(null);
  const [dressSlot, setDressSlot] = useState<OutfitSlot>('head');
  const [dressFriend, setDressFriend] = useState<CompanionId | null>(null);
  const [outfitTick, setOutfitTick] = useState(0);
  const [completedCare, setCompletedCare] = useState<string | null>(null);
  const [sunshineQueue, setSunshineQueue] = useState<SunshineNotice[]>([]);
  const [companions, setCompanions] = useState<CompanionState | null>(null);
  const [night, setNight] = useState(false);
  const [slide, setSlide] = useState<'' | 'left' | 'right'>('');
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const seenSunshineNotices = useRef(new Set<string>());
  const sunshineFeedback = sunshineQueue[0];

  const refreshCommerce = useCallback(() => {
    try {
      setCommerce(shopSnapshot()); setShopError('');
      try { setCommerce(syncGrowthRewards()); setRewardError(''); }
      catch (error) { setRewardError(error instanceof Error ? error.message : '성장 보상을 저장하지 못했어요. 다시 시도해 주세요.'); }
    } catch (error) { setCommerce(null); setShopError(error instanceof Error ? error.message : '상점 저장소를 열지 못했어요.'); }
  }, []);
  const readToday = useCallback(() => {
    try { if (developerToolsAvailable()) setTestEnabled(dataScope() === 'test'); }
    catch { setShopError('브라우저 저장소에 접근하지 못했어요. 저장 권한을 확인해 주세요.'); setCommerce(null); return null; }
    refreshCommerce();
    setCompanions(readCompanions());
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
  }, [refreshCommerce]);
  const updateDaily = (value: DailyCheckin | null) => {
    dailyRef.current = value;
    setDaily(value);
  };
  const show = (target: View, replace = false, record = readToday()) => {
    updateDaily(record);
    const next = resolveView(journalView(target), record);
    const url = new URL(window.location.href);
    url.hash = next;
    if (replace || window.location.hash !== '#' + next) {
      window.history[replace ? 'replaceState' : 'pushState'](
        // No spread of history.state: its __NA flag makes Next skip syncing its router URL, and Next later
        // rewrites the entry back to the stale URL, so Back lands on the wrong screen. Next copies its own keys.
        { gardenView: next }, '', url);
    }
    viewRef.current = next;
    setCompletedCare(null);
    setDecorationItem(null);
    setShopSelect(null);
    setView(next);
  };
  const save = (record: DailyCheckin, reward?: SunshineReason) => {
    try {
      const beforeRecords = readRecords();
      const saved = saveRecord(record, reward);
      const updatedRecords = readRecords();
      setRecords(updatedRecords);
      refreshCommerce();
      const notices = newSunshineNotices(beforeRecords, updatedRecords);
      if (notices.length) {
        const fresh = enqueueSunshineNotices([], notices, seenSunshineNotices.current);
        if (fresh.length) setSunshineQueue(queue => [...queue, ...fresh]);
      }
      if (saved.date === localDay()) updateDaily(saved);
      setSaveError('');
      return true;
    } catch (error) { setSaveError(storageMessage(error)); return false; }
  };

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const reposition = () => {
      document.documentElement.style.setProperty('--app-viewport-top', viewport.offsetTop + 'px');
    };
    const resize = () => {
      reposition();
      document.documentElement.style.setProperty('--app-viewport-height', viewport.height + 'px');
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (document.activeElement instanceof HTMLTextAreaElement) document.activeElement.scrollIntoView({ block: 'nearest' });
      });
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', reposition);
    document.addEventListener('focusin', resize);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', reposition);
      document.removeEventListener('focusin', resize);
      document.documentElement.style.removeProperty('--app-viewport-height');
      document.documentElement.style.removeProperty('--app-viewport-top');
    };
  }, []);

  useEffect(() => {
    let active = true;
    const sync = () => {
      if (!active) return;
      setNight(isNight());
      const record = readToday();
      const requested = window.location.hash.slice(1);
      // A URL cannot skip the consent screen. Help and the privacy policy remain reachable.
      const gated = !hasConsent() && requested !== 'safety' && requested !== 'privacy';
      const next = resolveView(gated ? 'onboarding' : journalView(requested), record);
      updateDaily(record);
      const url = new URL(window.location.href);
      url.hash = next;
      window.history.replaceState({ gardenView: next }, '', url);
      viewRef.current = next;
      setView(next);
      setCompletedCare(null);
    };
    queueMicrotask(() => { sync(); void cleanupPhotos().catch(error => { if (active) setSaveError(storageMessage(error)); }); });
    const onBack = () => sync();
    const onResume = () => { if (document.visibilityState === 'visible') sync(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DAILY_KEY && event.key !== RECORDS_KEY && event.key !== SHOP_KEY && event.key !== DEVELOPER_MODE_KEY && event.key !== TEST_DATA_KEY && event.key !== PREVIEW_DATA_KEY && event.key !== null) return;
      dailyRef.current = null;
      sync();
    };
    let observedDay = localDay();
    const timer = window.setInterval(() => {
      const day = localDay();
      setNight(isNight());
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

  // Share only the consented projection. Editing prose or replacing a photo does not change it.
  const guardianEntries = JSON.stringify(moodSnapshot(records));
  useEffect(() => {
    if (!guardianAvailable() || guardianEntries === '[]') return;
    const timer = window.setTimeout(() => { void syncGuardianShare(JSON.parse(guardianEntries)).catch(() => {}); }, 1200);
    return () => window.clearTimeout(timer);
  }, [guardianEntries]);

  useEffect(() => {
    const id = sunshineFeedback?.id;
    if (!id) return;
    const timer = window.setTimeout(() => {
      setSunshineQueue(queue => queue[0]?.id === id ? queue.slice(1) : queue);
    }, SUNSHINE_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [sunshineFeedback?.id]);

  const startCare = (state: 'low' | 'normal', answers: string[], note: string) => {
    const existing = readToday();
    if (existing?.stage === 'care') { show('care', true, existing); return; }
    const history = records.flatMap(r => r.careRecommendations ?? []);
    const record: DailyCheckin = { ...(existing ?? emptyRecord()), answers, note, plantState: state, stage: 'photo' };
    record.careRecommendations = ensureCareHistory(record.date, answers, history);
    if (save(record, 'reflection')) show('photo', false, record);
  };
  const saveDraft = (answers: string[]) => {
    const existing = readToday() ?? emptyRecord();
    if (existing.stage === 'care') return true;
    return save({ ...existing, answers, plantState: plantStateForAnswers(answers), stage: answers.every(Boolean) ? 'photo' : 'checkin', careRecommendations: answers.every(Boolean) ? ensureCareHistory(existing.date, answers, records.flatMap(r => r.careRecommendations ?? [])) : existing.careRecommendations }, 'reflection');
  };
  const advance = (stage: 'growth' | 'care') => {
    const record = readToday();
    if (!record) { show('checkin'); return; }
    const next = { ...record, stage };
    if (save(next, stage === 'care' ? 'participation' : undefined)) show(stage, false, next);
  };
  const completeCare = (id: string) => {
    const record = readToday();
    if (!record) { show('checkin', true, null); return; }
    if (!record.careRecommendations?.find(entry => entry.date === record.date)?.ids.some(careId => careId === id)) return;
    if (record.completedCareIds.includes(id)) return;
    if (save({ ...record, completedCareIds: [...record.completedCareIds, id] }, 'firstCare')) setCompletedCare(id);
  };
  const completeMission = (id: RecoveryId) => {
    const record = readToday() ?? emptyRecord();
    if (record.completedMissionIds?.includes(id)) return true;
    return save({ ...record, completedMissionIds: [...(record.completedMissionIds ?? []), id] }, 'firstCare');
  };
  const assertNoDrafts = () => {
    if (hasUnsavedDrafts()) throw new Error('아직 저장하지 않은 사진이나 글이 있어요. 저장하거나 선택을 취소한 뒤 모드를 바꿔 주세요.');
  };
  const refreshDataset = () => {
    dailyRef.current = null;
    setDaily(null); setRecords([]); setCommerce(null);
    setSunshineQueue([]); seenSunshineNotices.current.clear();
    setCompletedCare(null); setDecorationItem(null); setSaveError(''); setShopError(''); setRewardError('');
    setDatasetEpoch(value => value + 1);
    updateDaily(readToday());
  };
  const toggleTestMode = async (enabled: boolean, password?: string, signal?: AbortSignal) => {
    assertNoDrafts(); await setDeveloperMode(enabled, password, signal); setTestEnabled(enabled); refreshDataset();
  };
  const go = (target: View) => show(target);
  const openTodayDiary = () => {
    const record = readToday();
    if (record?.stage === 'care' && normalizeAnswers(record.answers).every(Boolean)) {
      show('garden', false, record);
      return;
    }
    const stage = record?.stage;
    show(stage === 'photo' || stage === 'growth' ? stage : 'checkin', false, record);
  };
  const goHome = () => show('home', viewRef.current === 'onboarding' || viewRef.current === 'checkin');
  const companionAction = (action: () => unknown, next?: View) => {
    try { action(); setCompanions(readCompanions()); if (next) show(next); }
    catch (error) { setSaveError(error instanceof Error ? error.message : '친구 정보를 저장하지 못했어요. 다시 시도해 주세요.'); }
  };
  const tab = tabOf(view, !completedCare);
  const tabIndex = tab ? NAV_TABS.findIndex(([target]) => target === tab) : -1;
  // Swipe left/right on a tab screen moves to the neighbouring tab (touch and pen only, so mouse text selection still works).
  const swipeStart = (event: React.PointerEvent) => {
    swipe.current = tabIndex < 0 || event.pointerType === 'mouse' || (event.target as Element).closest(SWIPE_IGNORE) ? null : { x: event.clientX, y: event.clientY };
  };
  const swipeEnd = (event: React.PointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || tabIndex < 0) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const next = NAV_TABS[tabIndex + (dx < 0 ? 1 : -1)];
    if (!next) return;
    setSlide(dx < 0 ? 'left' : 'right');
    go(next[0]);
  };
  useEffect(() => { if (!slide) return; const t = setTimeout(() => setSlide(''), 400); return () => clearTimeout(t); }, [slide]);
  const growth = companions ? petGrowth(companions, records) : null;
  const activeCompanion: ActiveCompanion = companions && growth ? { id: companions.active, stage: growth.tree.stage.level } : null;
  const owned = commerce ? ownedItemIds(commerce.state) : [];
  void outfitTick; // a new tick re-reads the outfits after a change in 옷 입히기
  const outfit = activeCompanion ? readOutfit(activeCompanion.id, owned) : undefined;
  const worn = companions?.adopted.flatMap(a => Object.values(readOutfit(a.id, owned))) ?? [];
  const giftPending = !!commerce?.state.rewards.some(grant => !grant.seenAt);
  // "입혀 보기" puts an owned outfit on the friend right away, then opens 옷 입히기 on that slot.
  const dressItem = (id: string) => {
    const slot = shopItem(id)?.wear ?? 'head';
    // The friend picked in 옷 입히기 before shopping, if still adopted; otherwise the garden's friend.
    const target = dressFriend && companions?.adopted.some(a => a.id === dressFriend) ? dressFriend : activeCompanion?.id;
    if (target && owned.includes(id)) { try { wear(target, slot, id, owned); setOutfitTick(tick => tick + 1); } catch { /* 옷 입히기 still lets them put it on by hand */ } }
    show('dress'); setDressSlot(slot); setDressFriend(target ?? null);
  };
  const shopFor = (id: string, friend: CompanionId | null = null) => { show('shop'); setShopSelect(id); setDressFriend(friend); };
  const openItem = (item: ShopItem, has: boolean) => {
    if (!has) { if (item.rewardDays) go('rewards'); else shopFor(item.id); }
    else if (item.category === 'outfit') dressItem(item.id);
    else { show('decorate'); setDecorationItem(item.id); }
  };
  const bondNews = companions ? <CompanionStatus state={companions} records={records} onSeen={level => companionAction(() => markLevelSeen(companions.active, level))} onOpen={go}/> : null;
  const plantState = daily?.plantState ?? 'normal';
  const gardenPreview = <Plant state={plantState} active={activeCompanion} outfit={outfit} className="plant-art"/>;
  const todayCares = daily?.careRecommendations?.find(entry => entry.date === daily.date);

  return <main className="app-shell"><div className="phone-frame" data-slide={slide || undefined} onPointerDown={swipeStart} onPointerUp={swipeEnd} onPointerCancel={() => { swipe.current = null; }}>
    <>
      {saveError && <p role="status" className="storage-status">{saveError}</p>}
      <div className="sunshine-notifications" role="status" aria-live="polite" aria-atomic="true">
        {sunshineFeedback && <div key={sunshineFeedback.id} className="sunshine-feedback">
          <span className="sunshine-feedback-icon" aria-hidden="true">☀️</span>
          <strong>햇살 +{sunshineFeedback.amount}</strong>
        </div>}
      </div>
      {view === 'onboarding' && <Onboarding start={firstTime => firstTime && !readCompanions() ? show('companion', true) : goHome()}/>}
      {view === 'home' && <HomeScreen shop={commerce?.state ?? null} state={plantState} go={go} companion={activeCompanion} growth={growth} outfit={outfit} night={night} news={bondNews} onWriteDiary={openTodayDiary}/>}
      {view === 'checkin' && <CheckinScreen key={localDay()} onBack={() => go('garden')} onDone={startCare} initialRecord={daily} onDraft={saveDraft}/>}
      {(view === 'photo' || view === 'growth') && daily && <ReflectionExtras key={daily.date + view} kind={view} record={daily} onSave={save} onBack={() => go(view === 'photo' ? 'checkin' : 'photo')} onNext={() => advance(view === 'photo' ? 'growth' : 'care')}/>}
      {view === 'care' && daily && todayCares && <CareScreen state={plantState} companion={activeCompanion} answers={daily.answers} recommendation={displayCareRecommendation(todayCares)} completed={completedCare} completedIds={daily.completedCareIds} onComplete={completeCare} onShowList={() => setCompletedCare(null)} goHome={goHome} onMore={() => go('missions')}/>}
      {view === 'garden' && <section className="screen garden-history-screen work-screen"><TopBar title="일기"/>
        <div className="work-area journal-area"><RecordsCalendar records={records} onSave={save}
          onToday={openTodayDiary}
          onMissions={() => go(daily?.stage === 'care' && todayCares ? 'care' : 'missions')} onMedications={() => go('medications')}/>
          {giftPending && <GrowthProgress snapshot={commerce} onOpen={() => go('rewards')}/>}
          {testEnabled && <details className="quiet-card"><summary>개발용 돌봄 확인</summary>
            {daily?.answers.every(Boolean) && <button className="text-button" type="button" onClick={() => go('care')}>기존 추천 행동 열기</button>}<CompanionMissions/>
          </details>}
        </div>
      </section>}
      {view === 'missions' && <section className="screen work-screen"><TopBar title="오늘의 돌봄" onBack={() => go(daily?.stage === 'care' && todayCares ? 'care' : 'garden')}/>
        <div className="work-area personal-area"><RecoveryMissions key={datasetEpoch + ':' + localDay()} record={daily} records={records} onComplete={completeMission}
          onMap={() => go('map')} onConnections={() => go('connections')}/></div></section>}
      {view === 'medications' && <section className="screen work-screen"><TopBar title="복약 관리" onBack={() => go('garden')}/>
        <div className="work-area personal-area"><MedicationManagement/></div></section>}
      {view === 'profile' && <section className="screen work-screen"><TopBar title="내 프로필" onBack={() => go('settings')}/>
        <div className="work-area personal-area"><GardenProfileForm onDone={() => go('settings')}/></div></section>}
      {view === 'pot-name' && <section className="screen work-screen"><TopBar title="화분 이름 바꾸기" onBack={() => go('settings')}/>
        <div className="work-area personal-area"><PotNameForm plant={activeCompanion?.id ?? 'bonsai'} onDone={() => go('home')}/></div></section>}
      {view === 'map' && <section className="screen work-screen places-screen"><TopBar title="지도"/><Places energy={normalizeAnswers(daily?.answers)[1]}/></section>}
      {view === 'connections' && <section className="screen work-screen"><TopBar title="연락처" onBack={() => go('settings')}/><ConnectionsScreen/></section>}
      {view === 'guardian' && <section className="screen work-screen"><TopBar title="보호자 공유" onBack={() => go('settings')}/><GuardianSettings records={records}/></section>}
      {view === 'decorate' && <StyleHub view={view} go={go} giftPending={giftPending}><GardenShop key={datasetEpoch + ':decorate:' + (decorationItem ?? '')} initialItem={decorationItem} gardenPreview={gardenPreview} inventory snapshot={commerce} storageError={shopError} onChange={setCommerce} onRetry={() => { readToday(); }} onHome={goHome} onSwitch={() => go('shop')} onDress={dressItem}/></StyleHub>}
      {view === 'dress' && <StyleHub view={view} go={go} giftPending={giftPending}><DressUp key={datasetEpoch + ':' + dressSlot + ':' + (commerce ? 'ready' : 'loading') + ':' + companions?.active + ':' + dressFriend} snapshot={commerce} companions={companions} records={records} slot={dressSlot} friend={dressFriend} onWear={() => setOutfitTick(tick => tick + 1)} onShop={shopFor} onChoose={() => go('companion')}/></StyleHub>}
      {view === 'items' && <StyleHub view={view} go={go} giftPending={giftPending}><Inventory snapshot={commerce} worn={worn} onUse={openItem}/></StyleHub>}
      {view === 'shop' && <section className="screen shop-screen"><TopBar title="작은 정원 상점" onBack={() => go('decorate')}/><GardenShop key={datasetEpoch + ':shop:' + (shopSelect ?? '')} initialSelect={shopSelect} gardenPreview={gardenPreview} inventory={false} snapshot={commerce} storageError={shopError} onChange={setCommerce} onRetry={() => { readToday(); }} onHome={goHome} onSwitch={() => go('decorate')} onDress={dressItem}/></section>}
      {view === 'rewards' && <section className="screen"><TopBar title="함께한 날의 선물" onBack={() => go('decorate')}/><GrowthRewardsScreen snapshot={commerce} error={shopError || rewardError} onRetry={refreshCommerce} onChange={setCommerce} onPlace={id => { show('decorate'); setDecorationItem(id); }} onExtra={() => go('extra-care')}/></section>}
      {view === 'extra-care' && <section className="screen"><TopBar title="선택형 돌봄" onBack={() => go('rewards')}/><OptionalCareScreen snapshot={commerce} onHome={goHome}/></section>}
      {view === 'settings' && <section className="screen settings-screen"><TopBar title="설정"/><SettingsScreen onDeveloper={() => go('developer')} records={records} snapshot={commerce} canDelete={assertNoDrafts}/></section>}
      {view === 'support' && <section className="screen"><TopBar title="지원 제도 신청 도우미" onBack={() => window.history.back()}/><SupportPrograms friend={activeCompanion ? { ...activeCompanion, name: companionInfo(activeCompanion.id).name } : null}/></section>}
      {view === 'privacy' && <section className="screen"><TopBar title="개인정보 처리방침" help={false} onBack={() => window.history.back()}/><PrivacyPolicy/></section>}
      {view === 'safety' && <section className="screen"><TopBar title="도움 받을 수 있는 곳" help={false} onBack={() => window.history.back()}/><SafetyCenter/></section>}
      {view === 'developer' && developerToolsAvailable() && <section className="screen"><TopBar title="개발자 테스트" onBack={() => go('settings')}/><DeveloperSettings enabled={testEnabled} snapshot={commerce} dataError={shopError || rewardError} onToggle={toggleTestMode} onRefresh={refreshDataset} onOpen={go} canReset={assertNoDrafts}/></section>}
      {view === 'companion' && <section className="screen"><TopBar title="함께할 친구" onBack={companions ? () => go('companions') : undefined}/><CompanionPicker state={companions} onAdopt={id => companionAction(() => adoptCompanion(id, records), 'home')}/></section>}
      {view === 'companions' && <section className="screen"><TopBar title="함께하는 친구들" onBack={() => window.history.back()}/><CompanionCollection state={companions} records={records} onChoose={id => companionAction(() => chooseCompanion(id))} onAdopt={() => go('companion')}/></section>}
      {tab && <BottomNav active={tab} go={go}/>}
    </>
  </div></main>;
}
