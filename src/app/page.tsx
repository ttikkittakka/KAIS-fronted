'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dataScope, developerToolsAvailable, setDeveloperMode, DEVELOPER_MODE_KEY, TEST_DATA_KEY, PREVIEW_DATA_KEY } from './app-storage';
import { SettingsScreen, DeveloperSettings } from './components/DeveloperSettings';
import { HomeScreen, CheckinScreen, CareScreen, GardenScreen, TopBar, BottomNav, Onboarding } from './components/OneStepScreens';


import { DAILY_KEY, localDay, resolveView, type DailyCheckin, type GardenView } from './daily-checkin';
import { plantStateForAnswers } from './questions';
import { displayCareRecommendation, ensureCareHistory } from './daily-cares';
import { cleanupPhotos, emptyRecord, readRecords, recordStorageWarning, RECORDS_KEY, saveRecord } from './record-store';
import { ReflectionExtras, hasUnsavedDrafts } from './components/RecordScreens';

import { type SunshineReason } from './sunshine';
import GardenShop from './components/GardenShop';

import { GrowthRewardsScreen, OptionalCareScreen } from './components/GrowthRewards';
import { SHOP_KEY, shopSnapshot, syncGrowthRewards } from './shop-store';
import { newSunshineNotices, enqueueSunshineNotices, SUNSHINE_NOTICE_MS, type SunshineNotice } from './sunshine-notifications';
type View = GardenView;




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
  const [completedCare, setCompletedCare] = useState<string | null>(null);
  const [sunshineQueue, setSunshineQueue] = useState<SunshineNotice[]>([]);
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
    const next = resolveView(target, record);
    const url = new URL(window.location.href);
    url.hash = next;
    if (replace || window.location.hash !== '#' + next) {
      window.history[replace ? 'replaceState' : 'pushState'](
        { ...window.history.state, gardenView: next }, '', url);
    }
    viewRef.current = next;
    setCompletedCare(null);
    setDecorationItem(null);
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
      if (event.key !== DAILY_KEY && event.key !== RECORDS_KEY && event.key !== SHOP_KEY && event.key !== DEVELOPER_MODE_KEY && event.key !== TEST_DATA_KEY && event.key !== PREVIEW_DATA_KEY && event.key !== null) return;
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
  const goHome = () => show('home', viewRef.current === 'onboarding' || viewRef.current === 'checkin');
  const plantState = daily?.plantState ?? 'normal';
  const todayCares = daily?.careRecommendations?.find(entry => entry.date === daily.date);
  const completedCount = todayCares?.ids.filter(id => daily?.completedCareIds.includes(id)).length ?? 0;

  return <main className="app-shell"><div className="phone-frame">
    <>
      {saveError && <p role="status" className="storage-status">{saveError}</p>}
      <div className="sunshine-notifications" role="status" aria-live="polite" aria-atomic="true">
        {sunshineFeedback && <div key={sunshineFeedback.id} className="sunshine-feedback">
          <span className="sunshine-feedback-icon" aria-hidden="true">☀️</span>
          <strong>햇살 +{sunshineFeedback.amount}</strong>
        </div>}
      </div>
      {view === 'onboarding' && <Onboarding start={goHome}/>}
      {view === 'home' && <HomeScreen growthSnapshot={commerce} balance={commerce?.balance ?? 0} shop={commerce?.state ?? null} state={plantState} go={go} recorded={!!daily?.answers.every(Boolean)} completedCount={completedCount} resume={daily?.stage}/>}
      {view === 'checkin' && <CheckinScreen key={localDay()} onBack={goHome} onDone={startCare} initialRecord={daily} onDraft={saveDraft}/>}
      {(view === 'photo' || view === 'growth') && daily && <ReflectionExtras key={daily.date + view} kind={view} record={daily} onSave={save} onBack={() => go(view === 'photo' ? 'checkin' : 'photo')} onNext={() => advance(view === 'photo' ? 'growth' : 'care')}/>}
      {view === 'care' && daily && todayCares && <CareScreen state={plantState} recommendation={displayCareRecommendation(todayCares)} completed={completedCare} completedIds={daily.completedCareIds} onComplete={completeCare} onShowList={() => setCompletedCare(null)} goHome={goHome}/>}
      {view === 'garden' && <GardenScreen records={records} onSave={save}/>}
      {(view === 'shop' || view === 'decorate') && <section className="screen shop-screen"><TopBar title={view === 'shop' ? '작은 정원 상점' : '정원 꾸미기'} onBack={goHome}/><GardenShop key={datasetEpoch + ':' + view + ':' + (decorationItem ?? '')} initialItem={decorationItem} plantState={plantState} inventory={view === 'decorate'} snapshot={commerce} storageError={shopError} onChange={setCommerce} onRetry={() => { readToday(); }} onHome={goHome} onSwitch={() => go(view === 'shop' ? 'decorate' : 'shop')}/></section>}
      {view === 'rewards' && <section className="screen"><TopBar title="함께한 날의 선물" onBack={goHome}/><GrowthRewardsScreen snapshot={commerce} error={shopError || rewardError} onRetry={refreshCommerce} onChange={setCommerce} onPlace={id => { show('decorate'); setDecorationItem(id); }} onExtra={() => go('extra-care')}/></section>}
      {view === 'extra-care' && <section className="screen"><TopBar title="선택형 돌봄" onBack={() => go('rewards')}/><OptionalCareScreen snapshot={commerce} onHome={goHome}/></section>}
      {view === 'settings' && <section className="screen"><TopBar title="설정" onBack={goHome}/><SettingsScreen onDeveloper={() => go('developer')}/></section>}
      {view === 'developer' && developerToolsAvailable() && <section className="screen"><TopBar title="개발자 테스트" onBack={() => go('settings')}/><DeveloperSettings enabled={testEnabled} snapshot={commerce} dataError={shopError || rewardError} onToggle={toggleTestMode} onRefresh={refreshDataset} onOpen={go} canReset={assertNoDrafts}/></section>}
      {(view === 'home' || view === 'garden' || view === 'shop' || view === 'decorate' || view === 'rewards' || view === 'extra-care') && <BottomNav active={view === 'garden' ? 'garden' : 'home'} go={go}/>}
    </>
  </div></main>;
}
