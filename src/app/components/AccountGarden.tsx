'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getAuthClient } from '../../lib/supabase/auth-client';
import { createAccountGardenStore } from '../../lib/account-garden/store';
import { createCommerceClient } from '../../lib/account-commerce/client';
import type { CommerceSnapshot, CommerceInput } from '../../lib/account-commerce/model';
import RecordSunshine from './RecordSunshine';
import sunshineStyles from './SunshineFeedback.module.css';
import AccountReflection from './AccountReflection';
import GardenLoading from './GardenLoading';
import { createAccountCommitStore } from '../../lib/account-reflection/commit-store';
import { committedDaySchema } from '../../lib/account-reflection/commit-model';
import { createAccountReflectionStore } from '../../lib/account-reflection/store';
import { createAccountRecordsStore } from '../../lib/account-records/store';
import { createAccountMonthStore } from '../../lib/account-records/month';
import { createAccountWritingStore } from '../../lib/account-writing/store';
import { AccountSettingsScreen } from './DeveloperSettings';
import RecoveryMissions from './RecoveryMissions';
import MedicationManagement from './MedicationManagement';
import { GardenProfileForm, PotNameForm } from './GardenProfile';
import { usePersonalGarden } from './PersonalGarden';
import { CompanionArt } from './Companions';
import { SUNSHINE_NOTICE_MS } from '../sunshine-notifications';
import { uploadAccountPhoto, saveAccountPhotoComment } from '../../lib/account-photos/client';
import { accountRecordView, accountShopView } from '../../lib/account-records/presentation';
import { allowedDate, type AccountRecords } from '../../lib/account-records/model';
import { HomeScreen, CareScreen, TopBar, BottomNav } from './OneStepScreens';
import { RecordsCalendar, ReflectionExtras } from './RecordScreens';
import GardenShop from './GardenShop';
import { GrowthRewardsScreen, OptionalCareScreen } from './GrowthRewards';
import { displayCareRecommendation } from '../daily-cares';
import type { GardenView } from '../daily-checkin';
import { rememberAccountView } from '../../lib/account-activity/navigation';

import { createAccountActivityStore } from '../../lib/account-activity/store';
import { activityStatus, type ActivityInput } from '../../lib/account-activity/model';

// Separate UI readiness switch; server route is independently sealed with no executor.
const ACTIVITY_UI_ENABLED = false;
// Separate approval required; merely completing answers must not open DB writes.
const REFLECTION_COMMIT_UI_ENABLED = false;
const noSave = () => false;
/** Reuses the real screens, with server-owned read models and no local store mount. */
export default function AccountGarden({ userId, onLogout, onDeveloper, developerEntry }: { userId: string; onLogout: () => void; onDeveloper?: () => void; developerEntry?: ReactNode }) {
  const personal = usePersonalGarden();
  const [store] = useState(() => createAccountGardenStore(userId, async () => {
    const client = getAuthClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    return !error && data.session ? { userId: data.session.user.id, token: data.session.access_token } : null;
  }, fetch, false));
  const [records] = useState(createAccountRecordsStore);
  const [commerceClient] = useState(() => createCommerceClient(userId));
  const [commerceData, setCommerceData] = useState<CommerceSnapshot | null>(null);
  const [commerceError, setCommerceError] = useState('');
  useEffect(() => () => commerceClient.dispose(), [commerceClient]);
  const [todayStore] = useState(createAccountRecordsStore);
  const [reflection] = useState(createAccountReflectionStore);
  const [commitStore] = useState(createAccountCommitStore);
  const [activity] = useState(createAccountActivityStore);
  const [months] = useState(createAccountMonthStore);
  const [writing] = useState(createAccountWritingStore);
  const monthState = useSyncExternalStore(months.subscribe, months.getSnapshot, months.getSnapshot);
  const writingState = useSyncExternalStore(writing.subscribe, writing.getSnapshot, writing.getSnapshot);
  const [photoComments, setPhotoComments] = useState<Record<string, string>>({});
  const [writingDate, setWritingDate] = useState<string | null>(null);
  const [sunshine, setSunshine] = useState<{ id: string; amount: number } | null>(null);
  const seenRewards = useRef(new Set<string>());
  const [completedCare, setCompletedCare] = useState<string | null>(null);
  const activityBusy = useRef(false);
  const [activityPending, setActivityPending] = useState(false);
  const [activityDate, setActivityDate] = useState<string | null>(null);
  const [commitDate, setCommitDate] = useState<string | null>(null);
  const [activityVerificationFailed, setActivityVerificationFailed] = useState(false);
  const activityState = useSyncExternalStore(activity.subscribe, activity.getSnapshot, activity.getSnapshot);
  const navigation = useRef(0);
  const reflectionState = useSyncExternalStore(reflection.subscribe, reflection.getSnapshot, reflection.getSnapshot);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const history = useSyncExternalStore(records.subscribe, records.getSnapshot, records.getSnapshot);
  const todayState = useSyncExternalStore(todayStore.subscribe, todayStore.getSnapshot, todayStore.getSnapshot);
  const activityEnabled = ACTIVITY_UI_ENABLED || (activityDate !== null && activityDate === todayState.data?.today);
  const commitEnabled = REFLECTION_COMMIT_UI_ENABLED || (commitDate !== null && commitDate === todayState.data?.today);
  const [view, setView] = useState<GardenView>('home');
  useEffect(() => {
    const openReminder = () => { if (window.location.hash === '#medications') setView('medications'); };
    openReminder();
    window.addEventListener('hashchange', openReminder);
    return () => window.removeEventListener('hashchange', openReminder);
  }, []);
  const [selectedDate, setSelectedDate] = useState<string>();
  const [reviewAnswersOnly, setReviewAnswersOnly] = useState(false);
  const [continuedDay, setContinuedDay] = useState<AccountRecords | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true; let authEvent = 0;
    const client = getAuthClient();
    const apply = (session: { user: { id: string }; access_token: string } | null) => {
      if (!active) return;
      const next = session?.user.id === userId ? { userId, token: session.access_token } : null;
      records.setSession(next); todayStore.setSession(next); reflection.setSession(next); commitStore.setSession(next); activity.setSession(next);
      months.setSession(next); writing.setSession(next);
      setActivityDate(null);
      setCommitDate(null);
      setWritingDate(null);
      if (!next) { setPhotoComments({}); store.dispose(); return; }
      const event = authEvent;
      void fetch('/api/account/writing', { headers: { Authorization: `Bearer ${next.token}` }, cache: 'no-store' })
        .then(async response => response.ok ? response.json() : null)
        .then(status => { if (active && event === authEvent) setWritingDate(status?.enabled === true ? status.today : null); })
        .catch(() => { if (active && event === authEvent) setWritingDate(null); });
      void fetch('/api/account/reflection/commit', { headers: { Authorization: `Bearer ${next.token}` }, cache: 'no-store' })
        .then(async response => response.ok ? response.json() : null)
        .then(status => { if (active && event === authEvent) setCommitDate(status?.enabled === true && typeof status.today === 'string' ? status.today : null); })
        .catch(() => { if (active && event === authEvent) setCommitDate(null); });
      void fetch('/api/account/activity', { headers: { Authorization: `Bearer ${next.token}` }, cache: 'no-store' })
        .then(async response => response.ok ? response.json() : null)
        .then(status => { if (active && event === authEvent) setActivityDate(status?.enabled === true && typeof status.today === 'string' ? status.today : null); })
        .catch(() => { if (active && event === authEvent) setActivityDate(null); });
      if (todayStore.getSnapshot().phase === 'idle') {
        void store.load(); void records.load(); void todayStore.load();
      }
    };
    void client?.auth.getSession().then(({ data }) => { if (authEvent === 0) apply(data.session); });
    const subscription = client?.auth.onAuthStateChange((_event, session) => { authEvent++; apply(session); });
    return () => { active = false; subscription?.data.subscription.unsubscribe(); store.dispose(); records.dispose(); todayStore.dispose(); reflection.dispose(); commitStore.dispose(); activity.dispose(); months.dispose(); writing.dispose(); };
  }, [store, records, todayStore, reflection, commitStore, activity, months, writing, userId]);
  useEffect(() => {
    if (view === 'growth' && todayState.data?.today === writingDate && todayState.data.record?.stage === 'growth') void writing.selectDate(writingDate);
  }, [view, writingDate, writing, todayState.data?.today, todayState.data?.record?.stage]);
  useEffect(() => {
    if (!sunshine) return;
    const timer = setTimeout(() => setSunshine(null), SUNSHINE_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [sunshine]);
  useEffect(() => { frame.current?.querySelector('.screen')?.scrollTo({ top: 0 }); }, [view]);
  useEffect(() => {
    if (!reflectionState.pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [reflectionState.pending]);
  const reload = () => { void store.load(); void todayStore.load(); void records.load(selectedDate); };
  const logout = () => { store.dispose(); records.dispose(); todayStore.dispose(); reflection.dispose(); commitStore.dispose(); activity.dispose(); months.dispose(); writing.dispose(); setSunshine(null); onLogout(); };
  const data = state.data;
  const shopData = commerceData?.garden ?? data;
  const commerce = data ? accountShopView(['shop','decorate'].includes(view) && shopData ? shopData : data) : null;
  if (commerce && todayState.data && !['shop','decorate'].includes(view)) commerce.balance = todayState.data.sunshineBalance;
  const loadCommerce = async () => {
    const visit = navigation.current;
    try { const next = await commerceClient.read(); if (visit !== navigation.current) throw Error('화면이 변경됐어요.'); setCommerceData(next); setCommerceError(''); return accountShopView(next.garden); }
    catch (error) { if (visit === navigation.current) setCommerceError('상점 정보를 확인하지 못했어요. 다시 확인해 주세요.'); throw error; }
  };
  const saveCommerce = async (input: CommerceInput) => {
    const visit = navigation.current;
    const next = await commerceClient.save(input);
    if (visit !== navigation.current) throw Error('화면이 변경됐어요. 서버 기록을 다시 확인해 주세요.');
    setCommerceData(next); setCommerceError(''); void store.load(); void todayStore.load();
    return accountShopView(next.garden);
  };
  let daily = null, historical = null, invalid = false;
  try {
    daily = todayState.data ? accountRecordView(todayState.data) : null;
    historical = history.data ? accountRecordView(history.data) : null;
  } catch { invalid = true; }
  const dateMismatch = !!(data && todayState.data && (data.today !== todayState.data.today || todayState.data.date !== todayState.data.today));
  const ready = !dateMismatch && state.phase !== 'error' && ['ready', 'loading'].includes(todayState.phase) && !!todayState.data && !!commerce && !invalid;
  const refreshing = ready && (state.phase === 'loading' || todayState.phase === 'loading');
  const failed = dateMismatch || state.phase === 'error' || todayState.phase === 'error' || invalid;
  const go = (next: GardenView) => {
    const visit = ++navigation.current;
    if (next !== 'medications' && typeof window !== 'undefined' && window.location.hash === '#medications')
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    if (next === 'garden') { setSelectedDate(undefined); void records.load(); if (todayState.data) void months.load(todayState.data.today.slice(0, 7)); }
    if (next === 'checkin') {
      setReviewAnswersOnly(false);
      // The explicit home action opens/resumes the original question flow.
      // Merely mounting the account garden never creates a day.
      void Promise.resolve(reflection.load()).then(() => {
        if (visit === navigation.current && reflection.getSnapshot().phase === 'needs-start') return reflection.start();
      });
    }
    setView(next);
    if (next === 'shop' || next === 'decorate') { setCommerceData(null); void loadCommerce().catch(() => {}); }
  };
  const home = () => { setContinuedDay(null); setCompletedCare(null); go('home'); };
  const enterFromHome = (next: GardenView) => {
    if (['checkin', 'photo', 'growth', 'care'].includes(next)) {
      const today = todayStore.getSnapshot();
      if (today.phase !== 'ready' || today.data?.userId !== userId || today.data.date !== today.data.today) return;
      // Home resumes persisted progress, never a preview bookmark or historical day.
      setContinuedDay(null); setCompletedCare(null);
      go(today.data.record?.stage ?? 'checkin');
      return;
    }
    go(next);
  };
  const completeActivity = async (action: ActivityInput['action'], careId?: string) => {
    if (!activityEnabled || activityBusy.current || activityVerificationFailed || ['recover', 'conflict'].includes(activity.getSnapshot().phase) || (continuedDay && continuedDay.date !== continuedDay.today)) return;
    activityBusy.current = true; setActivityPending(true); setCompletedCare(null);
    const visit = navigation.current;
    try {
      if (action === 'growth_done' && writingDate) {
        await writing.flush();
        const text = writing.getSnapshot();
        if (text.phase !== 'ready' || !text.saved || text.saved.note !== text.draft.note) return;
      }
      await activity.load();
      if (visit !== navigation.current) return;
      const loaded = activity.getSnapshot();
      const displayed = continuedDay ?? todayStore.getSnapshot().data;
      if (loaded.phase !== 'ready' || !loaded.day || loaded.day.userId !== userId || loaded.day.date !== displayed?.date || loaded.day.date !== loaded.day.today) return;
      await activity.submit(action, careId);
      const result = activity.getSnapshot();
      if (visit !== navigation.current || result.phase !== 'ready' || result.day?.userId !== userId || !result.day.record ||
          activityStatus(result.day, {date:result.day.date,revision:result.day.record.revision,action,careId}) !== 'done') return;
      await todayStore.load();
      const fresh = todayStore.getSnapshot();
      if (visit !== navigation.current || fresh.phase !== 'ready' || JSON.stringify(fresh.data) !== JSON.stringify(result.day)) { activity.takeEffect(); setActivityVerificationFailed(true); return; }
      setContinuedDay(fresh.data);
      const effect = activity.takeEffect();
      if (effect && effect.reward > 0 && !seenRewards.current.has(effect.id)) { seenRewards.current.add(effect.id); setSunshine({ id: effect.id, amount: effect.reward }); }
      void store.load(); void records.load(selectedDate);
      if (action === 'care_done') { if (effect?.celebrate && effect.careId === careId) setCompletedCare(careId!); }
      else go(result.day.record.stage);
    } finally { activityBusy.current = false; setActivityPending(false); }
  };
  const recommendation = daily?.careRecommendations?.[0];
  const continueReflection = async () => {
    const visit = navigation.current;
    const date = reflection.getSnapshot().date;
    if (!date || reflection.getSnapshot().pending) return;
    const before = todayStore.getSnapshot().data;
    // Both paths use the displayed date. finish reads first and never commits a past day.
    if (commitEnabled) await commitStore.finish(date);
    else await commitStore.load(date);
    const result = commitStore.getSnapshot();
    if (visit !== navigation.current || result.phase !== 'committed') return;
    const parsed = committedDaySchema.safeParse(result.day);
    if (!parsed.success || parsed.data.userId !== userId || parsed.data.date !== date) return;
    setContinuedDay(parsed.data);
    if (before?.date === date && before.record?.stage === 'checkin' && parsed.data.sunshineBalance === before.sunshineBalance + 10) {
      const id = `${userId}:${date}:reflection`;
      if (!seenRewards.current.has(id)) { seenRewards.current.add(id); setSunshine({ id, amount: 10 }); }
    }
    if (parsed.data.date === parsed.data.today) { await todayStore.load(); await store.load(); }
    if (visit !== navigation.current) return;
    go(parsed.data.record!.stage);
  };
  const journey = continuedDay?.userId === userId ? accountRecordView(continuedDay) : daily;
  const journeyRecommendation = journey?.careRecommendations?.[0];
  const outsideRange = !!(selectedDate && data && !allowedDate(selectedDate, data.today));
  return <main className="app-shell" data-account-view={view} data-record-date={continuedDay?.date ?? reflectionState.date ?? undefined}><div className="phone-frame" ref={frame} aria-busy={refreshing || (!ready && !failed)} inert={refreshing || undefined}>
    {!ready ? failed ? <section className="screen"><TopBar title="오늘의 정원"/><div className="step-actions"><p role="alert">계정 정보를 불러오지 못했어요. 빈 기록으로 대체하지 않았어요.</p><button className="primary-button" onClick={reload}>다시 시도</button></div><button className="auth-secondary" onClick={logout}>로그아웃</button></section> : <GardenLoading/> : <>
      {view === 'home' && <HomeScreen today={todayState.data!.today} potName={personal?.names.bonsai} growthSnapshot={commerce} shop={commerce.state} balance={todayState.data!.sunshineBalance} state={daily?.plantState ?? 'normal'} go={enterFromHome} recorded={!!recommendation} completedCount={daily?.completedCareIds.length ?? 0} resume={daily?.stage}/>}
      {view === 'checkin' && <AccountReflection commitEnabled={commitEnabled} reviewOnly={reviewAnswersOnly} store={reflection} commitStore={commitStore} onResume={() => continueReflection()} onFinish={() => continueReflection()} onBack={() => {
        home();
        // Refresh the home read model after acknowledged drafts, without replacing pending input.
        if (!reflection.getSnapshot().pending) { void todayStore.load(); void records.load(selectedDate); }
      }}/>}
      {(view === 'photo' || view === 'growth') && journey && <ReflectionExtras key={`${journey.userId}:${journey.date}:${view}`} readOnly photoComment={writingDate === journey.date && journey.stage !== 'checkin' ? { text: photoComments[journey.date] ?? journey.photoComment ?? '', saved: journey.photoComment ?? '', onEdit: text => setPhotoComments(values => ({ ...values, [journey.date]: text })), onSave: async (text, signal) => { const visit = navigation.current; const fresh = await saveAccountPhotoComment(userId, journey.date, text, journey.photoComment ?? '', AbortSignal.any([signal, AbortSignal.timeout(20000)])); if (visit !== navigation.current) return false; setContinuedDay(fresh); void records.load(selectedDate); return true; } } : undefined} onPhotoSave={activityEnabled && writingDate === journey.date && journey.date === todayState.data?.today && journey.stage === 'photo' ? async (blob, requestId, signal, comment) => { const visit = navigation.current; await uploadAccountPhoto(userId, journey.date, blob, requestId, AbortSignal.any([signal, AbortSignal.timeout(60000)])); if (visit !== navigation.current) return false; const fresh = await saveAccountPhotoComment(userId, journey.date, comment, journey.photoComment ?? '', AbortSignal.any([signal, AbortSignal.timeout(20000)])); if (visit !== navigation.current) return false; setContinuedDay(fresh); void records.load(selectedDate); return true; } : undefined} writing={view === 'growth' && writingDate === journey.date ? { text: writingState.draft.note, disabled: writingState.phase === 'idle' || writingState.phase === 'loading' || writingState.phase === 'error' || writingState.phase === 'conflict', pending: writingState.phase === 'saving' || writingState.phase === 'loading', error: writingState.phase === 'error' || writingState.phase === 'conflict', onEdit: text => { writing.edit({ note: text }); }, onRecover: () => { void writing.recover(); }, onUseSaved: writingState.remote ? () => { writing.resolveConflict({}); } : undefined, onKeepDraft: writingState.remote ? () => { if (writing.resolveConflict({ note: writingState.draft.note })) void writing.flush(); } : undefined } : undefined} progression={{ enabled: activityEnabled && (continuedDay ?? todayState.data)?.date === todayState.data?.today, blocked: activityPending || activityVerificationFailed || (activityEnabled && ['recover', 'conflict'].includes(activityState.phase)) }} kind={view} record={journey} onSave={noSave} onBack={() => { go(view === 'photo' ? 'checkin' : 'photo'); if (view === 'photo') setReviewAnswersOnly(true); }} onNext={() => {
        const next = view === 'photo' ? 'growth' : 'care';
        if (activityEnabled) { void completeActivity(view === 'photo' ? 'photo_done' : 'growth_done'); return; }
        rememberAccountView(continuedDay ?? todayState.data!, next); go(next);
      }}/>} 
      {view === 'care' && (journey && journeyRecommendation ? <CareScreen readOnly={!activityEnabled || activityPending || activityVerificationFailed || journey.stage !== 'care' || (continuedDay ?? todayState.data)?.date !== todayState.data?.today || ['loading', 'saving', 'recover', 'conflict'].includes(activityState.phase)} state={journey.plantState} recommendation={displayCareRecommendation(journeyRecommendation)} completed={completedCare} completedIds={journey.completedCareIds} onComplete={id => { void completeActivity('care_done', id); }} onShowList={() => setCompletedCare(null)} goHome={home} onMore={() => go('missions')}/> : <section className="screen"><TopBar title="오늘의 작은 돌봄" onBack={home}/><p className="privacy-note">아직 서버에 확정된 추천이 없어요.</p><button className="secondary-button" onClick={() => go('checkin')}>돌아보기 질문 보기</button></section>)}
      {activityEnabled && (activityVerificationFailed || ['recover', 'conflict'].includes(activityState.phase)) && <p role="alert" className="privacy-note">{'\uC800\uC7A5 \uACB0\uACFC\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.'}<button className="text-button" onClick={async () => { setCompletedCare(null); await activity.recover(); const recovered = activity.getSnapshot(); if (recovered.phase === 'ready' && recovered.day?.userId === userId) { setContinuedDay(recovered.day); setActivityVerificationFailed(false); if (recovered.day.record) go(recovered.day.record.stage); reload(); } }}>{'\uC11C\uBC84 \uAE30\uB85D \uD655\uC778'}</button></p>}
      {view === 'garden' && <section className="screen garden-history-screen"><TopBar title="나의 기록"/><RecordsCalendar rewardSummary={history.phase === 'ready' && history.data?.record ? <RecordSunshine day={history.data}/> : undefined} readOnly accountPhotos initialDate={selectedDate} today={data!.today} records={historical ? [historical] : []} recordedDates={monthState.data?.dates ?? []} onSave={noSave}
        onToday={() => enterFromHome('checkin')} onMissions={() => daily?.stage === 'care' && recommendation ? enterFromHome('care') : go('missions')} onMedications={() => go('medications')}
        onDate={date => { setSelectedDate(date); if (monthState.data?.month !== date.slice(0, 7)) void months.load(date.slice(0, 7)); if (allowedDate(date, data!.today)) void records.load(date); }} status={outsideRange ? <p role="status">오늘부터 지난 365일의 기록만 조회할 수 있어요.</p> : history.phase === 'error' || monthState.phase === 'error' ? <div role="alert">기록을 불러오지 못했어요.<button onClick={() => { void records.load(selectedDate); void months.load((selectedDate ?? data!.today).slice(0, 7)); }}>다시 시도</button></div> : history.phase !== 'ready' ? <GardenLoading compact/> : undefined}/>
      </section>}
      {view === 'missions' && <section className="screen work-screen"><TopBar title="오늘의 돌봄" onBack={() => go(daily?.stage === 'care' && recommendation ? 'care' : 'garden')}/>
        <div className="work-area personal-area"><RecoveryMissions deviceOnly key={data!.today}/></div></section>}
      {view === 'medications' && <section className="screen work-screen"><TopBar title="복약 관리" onBack={() => go('garden')}/>
        <div className="work-area personal-area"><MedicationManagement/></div></section>}
      {view === 'profile' && <section className="screen work-screen"><TopBar title="내 프로필" onBack={() => go('settings')}/>
        <div className="work-area personal-area"><GardenProfileForm onDone={() => go('settings')}/></div></section>}
      {view === 'pot-name' && <section className="screen work-screen"><TopBar title="화분 이름 바꾸기" onBack={() => go('settings')}/>
        <div className="work-area personal-area"><PotNameForm plant="bonsai" onDone={home}/></div></section>}
      {(view === 'shop' || view === 'decorate') && <section className="screen shop-screen"><TopBar title={view === 'shop' ? '작은 정원 상점' : '정원 꾸미기'} onBack={home}/><GardenShop key={view} gardenPreview={<CompanionArt id="bonsai" low={daily?.plantState === 'low'} className="plant-art" interactive={false}/> } readOnly={!commerceData?.enabled || !!commerceError} accountOwned={shopData!.inventory.map(i => i.item_id)} accountPrices={commerceData ? Object.fromEntries(commerceData.catalog.map(i => [i.id, i.price])) : undefined} accountActions={{ purchase: item => saveCommerce({action:'purchase',item,price:commerceData?.catalog.find(entry => entry.id === item)?.price ?? -1,balance:commerce!.balance,revision:commerce!.state.revision}), saveLayout: (layout, revision) => saveCommerce({action:'layout',layout,revision,balance:commerce!.balance}), reload: loadCommerce }} inventory={view === 'decorate'} snapshot={commerce} storageError={commerceError} onChange={() => {}} onRetry={() => { void loadCommerce().catch(() => {}); }} onHome={home} onSwitch={() => go(view === 'shop' ? 'decorate' : 'shop')}/></section>}
      {view === 'rewards' && <section className="screen"><TopBar title="함께한 날의 선물" onBack={home}/><GrowthRewardsScreen readOnly snapshot={commerce} error="" onRetry={reload} onChange={() => {}} onPlace={() => go('decorate')} onExtra={() => go('extra-care')}/></section>}
      {view === 'extra-care' && <section className="screen"><TopBar title="선택형 돌봄" onBack={() => go('rewards')}/><OptionalCareScreen snapshot={commerce} onHome={home}/></section>}
      {view === 'settings' && <section className="screen"><TopBar title="설정" onBack={home}/>
        <div className="personal-toolbar journal-shortcuts"><button className="secondary-button" type="button" onClick={() => go('profile')}>내 프로필</button>
          <button className="secondary-button" type="button" onClick={() => go('pot-name')}>화분 이름 바꾸기</button></div>
        <AccountSettingsScreen account onRefresh={reload} onLogout={logout} onDeveloper={onDeveloper} developerEntry={developerEntry}/></section>}
      {['home', 'garden', 'shop', 'decorate', 'rewards', 'extra-care'].includes(view) && <BottomNav active={view === 'garden' ? 'garden' : 'home'} go={go}/>}
    </>}
    <div className="sunshine-notifications" role="status" aria-live="polite" aria-atomic="true">{sunshine && <div key={sunshine.id} className={'sunshine-feedback ' + sunshineStyles.notice}><span className="sunshine-feedback-icon" aria-hidden="true">☀️</span><strong>햇살 +{sunshine.amount}</strong><span className={sunshineStyles.message}>오늘도 나를 돌봐 주었어요.</span></div>}</div>
  </div></main>;
}
