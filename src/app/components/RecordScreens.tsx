'use client';

/* eslint-disable @next/next/no-img-element -- Private blob URLs stay on device and cannot use the server image optimizer. */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { localDay, type DailyCheckin } from '../daily-checkin';
import { QUESTIONS, normalizeAnswers } from '../questions';
import { Button } from '@astryxdesign/core/Button';
import { diaryTags, MOOD_LABELS, OUTING_LABELS, OUTINGS } from '../wellbeing';
import { CARES } from '../cares';
import { RECOVERY_MISSIONS } from '../mission-policy';
import { cleanupPhotos, localOwner, newLocalId, photoOperation, preparePhoto, schedulePhotoDeletion } from '../record-store';
import { needsSafetyRoute } from '../safety';
import { HelpLink } from './SafetyCenter';
import CameraCapture, { cameraSupported } from './CameraCapture';
import { nativeDevice, nativePhoto } from '../native-bridge';
import { Icon } from './PetIcon';

// Unconfirmed photos stay in memory across this page's step/history navigation.
// They are never written to disk before the user presses Save.
const photoDrafts = new Map<string, Blob>();
const failedTextDrafts = new Map<string, string>();
const draftListeners = new Set<() => void>();
const draftKey = (record: DailyCheckin) => (record.userId ?? 'local') + ':' + record.date;
function subscribeDrafts(listener: () => void) { draftListeners.add(listener); return () => { draftListeners.delete(listener); }; }
export function hasUnsavedDrafts() { return photoDrafts.size > 0 || failedTextDrafts.size > 0; }
function changePhotoDraft(key: string, blob: Blob | null) {
  if (blob && !photoDrafts.has(key) && photoDrafts.size >= 5) throw new Error('아직 저장하지 않은 사진이 있어요. 먼저 저장하거나 선택을 취소해 주세요.');
  if (blob) photoDrafts.set(key, blob); else photoDrafts.delete(key);
  for (const listener of draftListeners) listener();
}

export function StepHeader({ step }: { step: 1 | 2 | 3 }) {
  return <div className="step-header"><span>STEP {step} / 3</span><strong>{['돌아보기', '기록하기', '성장하기'][step - 1]}</strong><div aria-hidden="true">{[1,2,3].map(n => <i key={n} className={n <= step ? 'filled' : ''}/>)}</div></div>;
}
function PhotoPreview({ id }: { id: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; let objectUrl = '';
    photoOperation(id, 'read').then(blob => { if (!active) return; if (!blob) { setError(true); return; } objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, retry]);
  return url ? <img className="record-photo" src={url} alt="이 날 남긴 나의 사진"/> : <p role="status">{error ? <>사진을 불러오지 못했어요. <button className="text-button" onClick={() => { setError(false); setRetry(n => n + 1); }}>다시 불러오기</button></> : '사진을 불러오고 있어요.'}</p>;
}
export function PhotoEditor({ record, onSave, onPending }: { record: DailyCheckin; onSave: (record: DailyCheckin) => boolean; onPending?: (value: boolean) => void }) {
  const key = draftKey(record);
  const pending = useSyncExternalStore(subscribeDrafts, () => photoDrafts.get(key) ?? null, () => null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cleanupError, setCleanupError] = useState(false);
  const [commentFailed, setCommentFailed] = useState(() => failedTextDrafts.has(key + ':comment'));
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [shooting, setShooting] = useState(false);
  useEffect(() => {
    let active = true; let url = '';
    queueMicrotask(() => {
      if (!active) return;
      if (pending) { url = URL.createObjectURL(pending); setPreview(url); }
      else setPreview('');
      onPending?.(!!pending);
    });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [pending, onPending]);
  useEffect(() => {
    if (!pending && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending, busy]);
  async function select(file?: File) {
    if (!file) return;
    setBusy(true); setError(''); onPending?.(true);
    try {
      const blob = await preparePhoto(file);
      changePhotoDraft(key, blob);
      if (mounted.current) onPending?.(true);
    } catch (error) {
      if (mounted.current) { onPending?.(!!pending); setError(error instanceof Error ? error.message + ' JPG·PNG 등의 사진으로 다시 시도해 주세요.' : '사진을 준비하지 못했어요. 다시 골라주세요.'); }
    } finally { if (mounted.current) setBusy(false); }
  }
  async function cleanDetachedPhotos() {
    try { await cleanupPhotos(); if (mounted.current) setCleanupError(false); }
    catch { if (mounted.current) setCleanupError(true); }
  }
  async function capture() {
    if (!nativeDevice()) {
      if (cameraSupported()) setShooting(true);
      else camera.current?.click();
      return;
    }
    setBusy(true); setError(''); onPending?.(true);
    try {
      const file = await nativePhoto();
      if (mounted.current && file) await select(file);
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : '카메라를 열지 못했어요.'); }
    finally { if (mounted.current) { setBusy(false); onPending?.(photoDrafts.has(key) || commentFailed); } }
  }
  async function store() {
    if (!pending || busy) return;
    setBusy(true); setError('');
    try {
      const id = localOwner() + ':' + record.date + ':' + newLocalId();
      schedulePhotoDeletion(id);
      if (record.photoId) schedulePhotoDeletion(record.photoId);
      await photoOperation(id, 'write', pending);
      if (!onSave({ ...record, photoId: id })) { await cleanDetachedPhotos(); throw new Error('기록을 저장하지 못했어요. 사진 미리보기는 남겨뒀어요.'); }
      changePhotoDraft(key, null);
      if (mounted.current) onPending?.(false);
      await cleanDetachedPhotos();
    } catch (error) { if (mounted.current) setError(error && typeof error === 'object' && 'name' in error && error.name === 'QuotaExceededError' ? '브라우저 저장 공간이 부족해요. 기존 사진은 그대로 남아 있어요. 저장 공간을 확보한 뒤 미리보기의 저장 버튼으로 다시 시도해 주세요.' : '사진을 저장하지 못했어요. 미리보기의 저장 버튼으로 다시 시도해 주세요.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setError(''); onPending?.(true);
    let removed = false;
    try {
      if (record.photoId) schedulePhotoDeletion(record.photoId);
      if (!onSave({ ...record, photoId: undefined, photoComment: '' })) throw new Error();
      removed = true;
      failedTextDrafts.delete(key + ':comment');
      if (mounted.current) setCommentFailed(false);
      await cleanDetachedPhotos();
    } catch { if (mounted.current) setError('사진 삭제를 저장하지 못했어요. 사진과 코멘트는 남겨뒀어요.'); }
    finally { if (mounted.current) { setBusy(false); onPending?.(!removed && commentFailed); } }
  }
  return <div className="photo-editor">
    <input ref={input} type="file" accept="image/*" hidden onChange={e => { void select(e.target.files?.[0]); e.target.value = ''; }}/>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => { void select(e.target.files?.[0]); e.target.value = ''; }}/>
    {pending ? preview ? <img className="record-photo" src={preview} alt="저장 전 사진 미리보기"/> : <p role="status">미리보기를 준비하고 있어요.</p> : record.photoId ? <PhotoPreview key={record.photoId} id={record.photoId}/> : <div className="photo-empty"><span aria-hidden="true">▧</span><p>오늘 기억하고 싶은 장면 하나</p><small>하루에 사진 한 장을 남길 수 있어요.</small></div>}
    <div className="editor-actions"><button className="secondary-button" disabled={busy || commentFailed} onClick={() => input.current?.click()}>{record.photoId || pending ? '사진 변경' : '사진 선택'}</button><button className="secondary-button camera-button" disabled={busy || commentFailed} onClick={() => void capture()}><Icon name="camera" size={18}/> 사진 촬영</button></div>
    {shooting && <CameraCapture onShot={file => void select(file)} onClose={() => setShooting(false)}/>}
    {pending && <div className="editor-actions"><button className="primary-button" disabled={busy} onClick={() => void store()}>{busy ? '저장하고 있어요…' : '이 사진 저장하기'}</button><button className="text-button" disabled={busy} onClick={() => { changePhotoDraft(key, null); onPending?.(false); }}>선택 취소</button></div>}
    {record.photoId && !pending && <><label className="field-label" htmlFor="photo-comment">사진에 남기는 짧은 말</label><SavedTextField id="photo-comment" draftScope={key + ':comment'} value={record.photoComment ?? ''} maxLength={100} placeholder="이 순간을 한마디로 남긴다면?" className="comment-input" onSave={value => onSave({ ...record, photoComment: value })} onPending={value => { setCommentFailed(value); onPending?.(value || !!pending || busy); }}/><button className="text-button" disabled={busy} onClick={() => void remove()}>사진과 코멘트 삭제</button></>}
    {busy && <p role="status">사진을 처리하고 있어요.</p>}{error && <p role="alert" className="record-error">{error}</p>}
    {cleanupError && <p role="alert" className="record-error">기록 변경은 저장됐지만 사진 파일 정리가 아직 끝나지 않았어요.<button className="text-button" onClick={() => void cleanDetachedPhotos()}>사진 정리 다시 시도</button></p>}
    <p className="privacy-note">일기 사진은 이 기기에만 저장돼요. 저장할 때 위치 정보 등 사진 메타데이터를 제거해요.</p>
  </div>;
}
const SUGGESTIONS = ['오늘도 수고했어.', '쉬어도 괜찮아.', '내일 다시 해보자.', '지금 느끼는 마음도 소중해.'];
export function SavedTextField({ id, draftScope = id, value, maxLength, placeholder, className = '', onSave, onPending, suggestions = [], allowDelete = false }: { id: string; draftScope?: string; value: string; maxLength: number; placeholder: string; className?: string; onSave: (value: string) => boolean; onPending?: (pending: boolean) => void; suggestions?: string[]; allowDelete?: boolean }) {
  const [draft, setDraft] = useState(() => ({ text: failedTextDrafts.get(draftScope) ?? value, saved: value, failed: failedTextDrafts.has(draftScope) }));
  // Accept external saved changes without discarding an unsaved local draft.
  if (value !== draft.saved && !draft.failed) setDraft({ text: value, saved: value, failed: false });
  useEffect(() => {
    onPending?.(draft.failed);
    if (!draft.failed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft.failed, onPending]);
  const write = (text: string) => {
    const next = text.slice(0, maxLength);
    const saved = onSave(next);
    if (saved) failedTextDrafts.delete(draftScope); else failedTextDrafts.set(draftScope, next);
    setDraft({ text: next, saved: saved ? next : value, failed: !saved });
    onPending?.(!saved);
  };
  return <><textarea id={id} className={'record-input ' + className} maxLength={maxLength} value={draft.text} placeholder={placeholder} aria-describedby={id + '-status'} onChange={e => write(e.target.value)}/><span id={id + '-status'} className="text-count">{draft.text.length} / {maxLength}</span>{needsSafetyRoute(draft.text) && <p role="status" className="safety-nudge">혼자 견디지 않아도 돼요. 지금 이야기할 사람이 필요하다면 <a href="#safety">도움 받을 수 있는 곳 보기</a></p>}{draft.failed && <p role="alert" className="record-error">아직 저장하지 못했어요. 작성한 글은 이 화면에 남겨뒀어요.<button className="text-button" onClick={() => write(draft.text)}>다시 저장</button></p>}{suggestions.length > 0 && <><p className="suggestion-label">말이 떠오르지 않을 때, 이렇게 시작해도 좋아요.</p><div className="note-suggestions">{suggestions.map(text => <button key={text} onClick={() => write(text)}>{text}</button>)}</div></>}{allowDelete && draft.text && <button className="text-button" onClick={() => write('')}>한마디 삭제</button>}</>;
}
export function NoteEditor({ record, onSave, onPending, allowDelete = false }: { record: DailyCheckin; onSave: (record: DailyCheckin) => boolean; onPending?: (pending: boolean) => void; allowDelete?: boolean }) {
  return <><label className="field-label" htmlFor="daily-note">오늘의 나에게 남기는 말</label><SavedTextField id="daily-note" draftScope={draftKey(record) + ':note'} value={record.note} maxLength={300} placeholder="오늘의 나에게 하고 싶은 말을 적어보세요." onSave={value => onSave({ ...record, note: value })} onPending={onPending} suggestions={SUGGESTIONS} allowDelete={allowDelete}/></>;
}
export function ReflectionExtras({ kind, record, onSave, onBack, onNext }: { kind: 'photo' | 'growth'; record: DailyCheckin; onSave: (record: DailyCheckin) => boolean; onBack: () => void; onNext: () => void }) {
  const photo = kind === 'photo';
  const cachedPhoto = useSyncExternalStore(subscribeDrafts, () => photo && photoDrafts.has(draftKey(record)), () => false);
  const [pendingPhoto, setPendingPhoto] = useState(() => failedTextDrafts.has(draftKey(record) + (photo ? ':comment' : ':note')));
  return <section className="screen checkin-screen"><header className="top-bar"><button className="icon-button" aria-label="뒤로 가기" disabled={pendingPhoto && !cachedPhoto} onClick={onBack}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button><h1>오늘의 나</h1><HelpLink/></header><StepHeader step={photo ? 2 : 3}/><div className="question-panel note-panel"><div className="question-mark">{photo ? '▧' : '✎'}</div><h2>{photo ? '오늘의 순간을 남겨볼까요?' : '오늘의 나에게 한마디'}</h2><p className="question-helper">{photo ? <>특별한 순간이 아니어도 괜찮아요.<br/>오늘 기억하고 싶은 장면을 남겨보세요.</> : '오늘 하루를 보낸 나에게 어떤 말을 해주고 싶나요?'}</p>{photo ? <><p className="mood-chip">♡ {QUESTIONS[3].options.find(o => o.value === normalizeAnswers(record.answers)[3])?.label}</p><PhotoEditor record={record} onSave={onSave} onPending={setPendingPhoto}/></> : <NoteEditor record={record} onSave={onSave} onPending={setPendingPhoto}/>}<div className="step-actions"><button className="primary-button" disabled={pendingPhoto || cachedPhoto} onClick={onNext}>{photo ? '성장하기로 이어가기' : '일기 닫기'}</button>{!photo && !!record.note && <button className="text-button" onClick={() => { if (onSave({ ...record, note: '' })) onNext(); }}>글 없이 넘어가기</button>}<p className="optional-hint">{photo ? pendingPhoto || cachedPhoto ? '사진을 저장하거나 선택을 취소하면 이어갈 수 있어요.' : '사진 없이도 이어갈 수 있어요.' : pendingPhoto ? '작성한 글을 다시 저장하면 이어갈 수 있어요.' : '글 없이도 이어갈 수 있어요.'}</p></div></div></section>;
}
const MONTH_LABEL = (year: number, month: number) => `${year}년 ${month + 1}월`;
const DAY_LABEL = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

function DiaryPeriods({ records, month, onMonth }: { records: DailyCheckin[]; month: Date; onMonth: (index: number) => void }) {
  const rail = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const year = month.getFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`;
    return records.filter(record => record.date.startsWith(key) && normalizeAnswers(record.answers).every(Boolean));
  });
  const entries = monthly[month.getMonth()];
  const annual = monthly.reduce((sum, items) => sum + items.length, 0);
  const move = (index: number) => rail.current?.scrollTo({ left: index * rail.current.clientWidth });
  return <section className="diary-period" aria-label="기간별 일기">
    <div className="quiet-section-head period-heading">
      <h2>{page === 0 ? '이달의 기록' : '올해의 기록'}</h2>
      <div className="quiet-actions">
        <Button icon={<Icon name="back" size={17}/>} isIconOnly label="이달의 기록" isDisabled={page === 0} onClick={() => move(0)}/>
        <Button icon={<Icon name="arrow" size={17}/>} isIconOnly label="올해의 기록" isDisabled={page === 1} onClick={() => move(1)}/>
      </div>
    </div>
    <div ref={rail} className="period-rail" data-period={page === 0 ? 'month' : 'year'} tabIndex={0} onScroll={event => {
      const element = event.currentTarget;
      setPage(Math.round(element.scrollLeft / element.clientWidth));
    }}>
      <div className="period-panel">
        <div className="period-metric"><strong>{entries.length}<small>일</small></strong><span>일기를 남겼어요</span></div>
        <div className="period-dots" aria-label="이달에 남긴 마음">{entries.slice().reverse().slice(0, 20).map(record =>
          <i data-mood={normalizeAnswers(record.answers)[3]} key={record.date} title={DAY_LABEL(record.date)}/>)}</div>
      </div>
      <div className="period-panel">
        <div className="period-metric"><strong>{annual}<small>일</small></strong><span>{year}년에 일기를 남겼어요</span></div>
        <div className="period-year">{monthly.map((items, index) => <button type="button" key={index} aria-label={`${index + 1}월 기록 ${items.length}일`} aria-pressed={index === month.getMonth()} onClick={() => onMonth(index)}>
          <i style={{ height: Math.max(4, items.length / 31 * 36) + 'px' }}/><small>{index + 1}</small>
        </button>)}</div>
      </div>
    </div>
  </section>;
}

export function RecordsCalendar({ records, onSave, onToday }: { records: DailyCheckin[]; onSave: (record: DailyCheckin) => boolean; onToday: () => void }) {
  const [month, setMonth] = useState(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const [selected, setSelected] = useState(localDay());
  const [editing, setEditing] = useState(false);
  const today = localDay();
  const byDate = new Map(records.map(record => [record.date, record]));
  const record = byDate.get(selected);
  const offset = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i >= offset && i < offset + days ? i - offset + 1 : null);
  const answers = normalizeAnswers(record?.answers);
  const tags = diaryTags(record?.note, record?.photoComment);
  const activities = [
    ...(record?.completedMissionIds ?? []).map(id => RECOVERY_MISSIONS.find(mission => mission.id === id)?.title),
    ...(record?.completedCareIds ?? []).map(id => CARES.find(care => care.id === id)?.title),
  ].filter((title): title is string => !!title);
  const dateLabel = MONTH_LABEL(month.getFullYear(), month.getMonth());
  const pick = (day: string) => { setSelected(day); setEditing(false); };
  function move(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next); pick(localDay(next));
  }
  return <>
    <section className="calendar-card garden-calendar" aria-label="일기 캘린더">
      <div className="calendar-head"><div><h2>{dateLabel}</h2><p>{new Date(today + 'T12:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</p></div>
        <div className="calendar-controls"><Button label="이전 달" isIconOnly icon={<Icon name="back" size={19}/>} onClick={() => move(-1)}/>
          <Button label="다음 달" isIconOnly icon={<Icon name="arrow" size={19}/>} onClick={() => move(1)}/></div></div>
      <div className="week-row">{['월','화','수','목','금','토','일'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid record-calendar">{cells.map((day, index) => {
        if (!day) return <div key={index}/>;
        const date = localDay(new Date(month.getFullYear(), month.getMonth(), day));
        const entry = byDate.get(date);
        const mood = normalizeAnswers(entry?.answers)[3];
        return <button key={index} type="button" aria-label={date + (mood ? ' ' + MOOD_LABELS[mood] : '')} aria-pressed={selected === date}
          aria-current={date === today ? 'date' : undefined} className={selected === date ? 'today' : ''} onClick={() => pick(date)}>
          <span>{day}</span>{entry && <i data-mood={mood ?? 'draft'}/>}</button>;
      })}</div>
    </section>
    <DiaryPeriods records={records} month={month} onMonth={index => move(index - month.getMonth())}/>
    <section className="record-details diary-details">
      <div className="record-detail-head"><h2>{DAY_LABEL(selected)}{selected === today ? ' 오늘의 나' : '의 나'}</h2>
        {record && <Button label={editing ? '수정 닫기' : '일기 수정'} isIconOnly icon={<Icon name={editing ? 'check' : 'edit'} size={19}/>} onClick={() => setEditing(!editing)}/>}</div>
      {selected === today && (!answers.every(Boolean) || record?.stage === 'photo' || record?.stage === 'growth') && <Button className="diary-write" label={record?.answers.some(Boolean) ? '일기 이어 쓰기' : '오늘 일기 쓰기'} variant="primary" icon={<Icon name="edit" size={18}/>} onClick={onToday}/>}
      {record ? <article className="quiet-card diary-entry">
        {!!answers.filter(Boolean).length && <dl className="diary-answers">{QUESTIONS.map((question, index) => answers[index] && <div key={question.id}>
          <dt>{['수면','에너지','식사','마음'][index]}</dt><dd>{question.options.find(option => option.value === answers[index])?.label}</dd>
        </div>)}</dl>}
        {editing ? <>
          <fieldset className="outing-field"><legend>오늘의 외출</legend>
            <div className="quiet-segmented">{OUTINGS.map(value => <button key={value} type="button" aria-pressed={record.outing === value} onClick={() => onSave({ ...record, outing: record.outing === value ? undefined : value })}>{OUTING_LABELS[value]}</button>)}</div>
          </fieldset>
          <NoteEditor key={selected} record={record} onSave={onSave} allowDelete/>
          <PhotoEditor key={selected + ':photo'} record={record} onSave={onSave}/>
        </> : <>
          {record.outing && <p className="quiet-note">{OUTING_LABELS[record.outing]}</p>}
          {record.note && <p className="saved-text">{record.note}</p>}
          {record.photoId && <PhotoPreview key={record.photoId} id={record.photoId}/>}
          {record.photoComment && <p className="saved-text">{record.photoComment}</p>}
          {tags.length > 0 && <div className="diary-word-row" aria-label="글에 나온 마음 단어">{tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
          {activities.length > 0 && <details className="quiet-disclosure diary-done"><summary>마친 활동 {activities.length}개</summary><ul>{activities.map(title => <li key={title}>{title}</li>)}</ul></details>}
          {!answers.every(Boolean) && !record.note && !record.photoId && <p>아직 작성 중인 하루예요.</p>}
        </>}
      </article> : <p className="quiet-note">{selected === today ? '마음과 컨디션을 짧게 남겨요.' : '이날에 남긴 일기가 없어요.'}</p>}
    </section>
  </>;
}
