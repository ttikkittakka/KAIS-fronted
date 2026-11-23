'use client';
import GardenLoading from './GardenLoading';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { createAccountReflectionStore } from '../../lib/account-reflection/store';
import type { createAccountCommitStore } from '../../lib/account-reflection/commit-store';
import { CheckinScreen } from './OneStepScreens';

type Store = ReturnType<typeof createAccountReflectionStore>;
export function reflectionErrorMessage(code: string | null) {
  if (code === 'reflection-not-ready') return '지금은 답변을 저장할 수 없어요. 선택한 답변은 그대로 남아 있어요.';
  if (code === 'day-changed' || code === 'day-or-input-conflict') return '날짜가 바뀌었거나 기록 상태가 달라졌어요. 입력한 답변은 화면에 보관했어요.';
  if (code === 'revision-conflict') return '다른 화면에서 기록이 변경됐어요. 내 답변을 보관했고 기존 내용을 덮어쓰지 않았어요.';
  if (code === 'reflection-forbidden' || code === 'unauthorized') return '로그인을 확인해 주세요. 입력한 답변은 아직 저장되지 않았어요.';
  return '저장 여부를 확인하지 못했어요. 답변은 이 화면에 남아 있어요. 다시 시도해 주세요.';
}

/** Persistence and completion remain server-owned; no separate confirmation screen. */
export default function AccountReflection({ store, onBack, commitStore, onFinish, onResume, reviewOnly = false, commitEnabled = false }: {
  store: Store; onBack: () => void; commitStore?: ReturnType<typeof createAccountCommitStore>; onFinish?: () => Promise<void>; onResume?: () => Promise<void>; reviewOnly?: boolean; commitEnabled?: boolean;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const completion = useSyncExternalStore(commitStore?.subscribe ?? (() => () => {}), commitStore?.getSnapshot ?? (() => null), commitStore?.getSnapshot ?? (() => null));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [reviewAnswers, setReviewAnswers] = useState(reviewOnly || !onResume);
  const resumed = useRef<string | null>(null);
  const hasSavedAnswers = state.question === 4 && !state.pending && state.answers.every(Boolean);
  const finished = state.phase === 'committed';
  useEffect(() => { if (store.getSnapshot().phase === 'idle') void store.load(); }, [store]);
  useEffect(() => {
    if (!onResume || reviewAnswers || state.pending || !['draft-complete', 'committed'].includes(state.phase)) return;
    // Restored drafts require the existing continue button; only a new save auto-completes.
    if (state.phase === 'draft-complete' && state.completionSource !== 'saved') return;
    const key = `${state.date}:${state.revision}:${commitEnabled}`;
    if (resumed.current === key) return;
    resumed.current = key;
    // The parent commits only with the current server capability; otherwise this is read-only.
    void onResume();
  }, [onResume, reviewAnswers, state.date, state.revision, state.pending, state.phase, state.completionSource, commitEnabled]);
  const controls = state.phase === 'ready' ? null : <div className="step-actions" aria-live="polite" data-reflection-date={state.date ?? undefined} data-reflection-phase={state.phase} data-reflection-revision={state.revision ?? undefined} data-continuation-phase={completion?.phase} data-snapshot-date={completion?.day?.date} data-snapshot-stage={completion?.day?.record?.stage}>
    {(state.phase === 'idle' || state.phase === 'loading') && <GardenLoading compact message="오늘의 기록을 확인하고 있어요"/>}
    {state.phase === 'needs-start' && <button className="primary-button" onClick={() => void store.start()}>오늘의 상태 기록하기</button>}
    {state.phase === 'saving' && <p role="status">답변을 저장하고 있어요. 잠시 기다려 주세요.</p>}
    {state.pending && <p className="privacy-note">현재 선택한 답변은 저장 확인 전이에요. 새로고침·로그아웃하면 저장되지 않은 답변은 사라질 수 있어요.</p>}
    {(state.phase === 'error' || state.phase === 'conflict') && <p role="alert" className="record-error">{reflectionErrorMessage(state.error)}</p>}
    {state.phase === 'error' && <button className="secondary-button" onClick={() => void (state.pending ? store.retry() : store.load())}>다시 시도</button>}
    {state.phase === 'conflict' && <>
      <button className="secondary-button" onClick={() => setConfirmDiscard(true)}>최신 기록 불러오기</button>
      {confirmDiscard && <div role="alert"><p>화면에 보관한 미저장 답변을 버리고 저장된 기록을 불러올까요?</p><button className="secondary-button" onClick={() => { setConfirmDiscard(false); void store.load({ discardPending: true }); }}>내 미저장 답변 버리고 불러오기</button><button className="text-button" onClick={() => setConfirmDiscard(false)}>답변 계속 보관하기</button></div>}
    </>}
    {hasSavedAnswers && <>
      <p className="privacy-note">{finished || (completion?.phase === 'committed' && completion.day?.date === state.date) ? '답변과 맞춤 돌봄이 함께 저장됐어요.' : '답변을 저장했어요. 이어서 오늘의 기록을 마쳐 볼까요?'}</p>
      {onFinish && <button className="primary-button" disabled={state.phase === 'loading' || state.phase === 'error' || state.phase === 'conflict' || completion?.phase === 'loading' || completion?.phase === 'committing'} onClick={() => void (finished && onResume ? onResume() : onFinish())}>기록 이어가기</button>}
      {completion?.phase === 'recover' && <p role="alert">기록을 마쳤는지 확인하지 못했어요. 답변은 보관되어 있어요. 기록 이어가기를 눌러 저장된 내용을 확인해 주세요.</p>}
      {completion?.phase === 'conflict' && <p role="alert">날짜가 바뀌었어요. 정원으로 돌아가 오늘의 기록을 확인해 주세요.</p>}
      {(!reviewAnswers || !onResume) && <button className="secondary-button" disabled={state.phase === 'loading' || completion?.phase === 'committing' || completion?.phase === 'loading'} onClick={() => { setReviewAnswers(true); void store.load(); }}>저장된 답변 다시 확인</button>}
      <button className="text-button" onClick={onBack}>정원으로 돌아가기</button>
    </>}
  </div>;
  return <CheckinScreen initialRecord={null} onBack={onBack} onDone={() => {}} onDraft={() => false}
    account={{ state, reviewAnswers, onAnswer: (question, value) => { void store.saveAnswer(question, value); }, controls }}/>;
}
