'use client';

/* eslint-disable @next/next/no-img-element -- Private blob URLs stay on device and cannot use the server image optimizer. */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { localDay, type DailyCheckin } from '../daily-checkin';
import { QUESTIONS, normalizeAnswers } from '../questions';
import { displayCareRecommendation } from '../daily-cares';
import { cleanupPhotos, localOwner, newLocalId, photoOperation, preparePhoto, schedulePhotoDeletion } from '../record-store';

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
    <div className="editor-actions"><button className="secondary-button" disabled={busy || commentFailed} onClick={() => input.current?.click()}>{record.photoId || pending ? '사진 변경' : '사진 선택'}</button><button className="secondary-button camera-button" disabled={busy || commentFailed} onClick={() => camera.current?.click()}>사진 촬영</button></div>
    {pending && <div className="editor-actions"><button className="primary-button" disabled={busy} onClick={() => void store()}>{busy ? '저장하고 있어요…' : '이 사진 저장하기'}</button><button className="text-button" disabled={busy} onClick={() => { changePhotoDraft(key, null); onPending?.(false); }}>선택 취소</button></div>}
    {record.photoId && !pending && <><label className="field-label" htmlFor="photo-comment">사진에 남기는 짧은 말</label><SavedTextField id="photo-comment" draftScope={key + ':comment'} value={record.photoComment ?? ''} maxLength={100} placeholder="이 순간을 한마디로 남긴다면?" className="comment-input" onSave={value => onSave({ ...record, photoComment: value })} onPending={value => { setCommentFailed(value); onPending?.(value || !!pending || busy); }}/><button className="text-button" disabled={busy} onClick={() => void remove()}>사진과 코멘트 삭제</button></>}
    {busy && <p role="status">사진을 처리하고 있어요.</p>}{error && <p role="alert" className="record-error">{error}</p>}
    {cleanupError && <p role="alert" className="record-error">기록 변경은 저장됐지만 사진 파일 정리가 아직 끝나지 않았어요.<button className="text-button" onClick={() => void cleanDetachedPhotos()}>사진 정리 다시 시도</button></p>}
    <p className="privacy-note">사진은 이 기기의 브라우저에만 저장돼요. 서버로 전송하거나 AI 분석에 사용하지 않아요. 계정별 접근 제어는 없어서 같은 브라우저를 사용하는 사람은 기록을 볼 수 있어요. 저장할 때 위치 등 원본 메타데이터를 제거해요. 사진 삭제 시 코멘트도 함께 지워져요. 브라우저 데이터를 지우면 기록도 사라져요.</p>
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
  return <><textarea id={id} className={'record-input ' + className} maxLength={maxLength} value={draft.text} placeholder={placeholder} aria-describedby={id + '-status'} onChange={e => write(e.target.value)}/><span id={id + '-status'} className="text-count">{draft.text.length} / {maxLength}</span>{draft.failed && <p role="alert" className="record-error">아직 저장하지 못했어요. 작성한 글은 이 화면에 남겨뒀어요.<button className="text-button" onClick={() => write(draft.text)}>다시 저장</button></p>}{suggestions.length > 0 && <><p className="suggestion-label">말이 떠오르지 않을 때, 이렇게 시작해도 좋아요.</p><div className="note-suggestions">{suggestions.map(text => <button key={text} onClick={() => write(text)}>{text}</button>)}</div></>}{allowDelete && draft.text && <button className="text-button" onClick={() => write('')}>한마디 삭제</button>}</>;
}
export function NoteEditor({ record, onSave, onPending, allowDelete = false }: { record: DailyCheckin; onSave: (record: DailyCheckin) => boolean; onPending?: (pending: boolean) => void; allowDelete?: boolean }) {
  return <><label className="field-label" htmlFor="daily-note">오늘의 나에게 남기는 말</label><SavedTextField id="daily-note" draftScope={draftKey(record) + ':note'} value={record.note} maxLength={300} placeholder="오늘의 나에게 하고 싶은 말을 적어보세요." onSave={value => onSave({ ...record, note: value })} onPending={onPending} suggestions={SUGGESTIONS} allowDelete={allowDelete}/></>;
}
export function ReflectionExtras({ kind, record, onSave, onBack, onNext }: { kind: 'photo' | 'growth'; record: DailyCheckin; onSave: (record: DailyCheckin) => boolean; onBack: () => void; onNext: () => void }) {
  const photo = kind === 'photo';
  const cachedPhoto = useSyncExternalStore(subscribeDrafts, () => photo && photoDrafts.has(draftKey(record)), () => false);
  const [pendingPhoto, setPendingPhoto] = useState(() => failedTextDrafts.has(draftKey(record) + (photo ? ':comment' : ':note')));
  return <section className="screen checkin-screen"><header className="top-bar"><button className="icon-button" aria-label="뒤로 가기" disabled={pendingPhoto && !cachedPhoto} onClick={onBack}>‹</button><h1>오늘의 나</h1></header><StepHeader step={photo ? 2 : 3}/><div className="question-panel note-panel"><div className="question-mark">{photo ? '▧' : '✎'}</div><h2>{photo ? '오늘의 순간을 남겨볼까요?' : '오늘의 나에게 한마디'}</h2><p className="question-helper">{photo ? <>특별한 순간이 아니어도 괜찮아요.<br/>오늘 기억하고 싶은 장면을 남겨보세요.</> : '오늘 하루를 보낸 나에게 어떤 말을 해주고 싶나요?'}</p>{photo ? <><p className="mood-chip">♡ {QUESTIONS[3].options.find(o => o.value === normalizeAnswers(record.answers)[3])?.label}</p><PhotoEditor record={record} onSave={onSave} onPending={setPendingPhoto}/></> : <NoteEditor record={record} onSave={onSave} onPending={setPendingPhoto}/>}<div className="step-actions"><button className="primary-button" disabled={pendingPhoto || cachedPhoto} onClick={onNext}>{photo ? '성장하기로 이어가기' : '오늘의 추천 행동 만나보기'}</button>{!photo && !!record.note && <button className="text-button" onClick={() => { if (onSave({ ...record, note: '' })) onNext(); }}>글 없이 넘어가기</button>}<p className="optional-hint">{photo ? pendingPhoto || cachedPhoto ? '사진을 저장하거나 선택을 취소하면 이어갈 수 있어요.' : '사진 없이도 이어갈 수 있어요.' : pendingPhoto ? '작성한 글을 다시 저장하면 이어갈 수 있어요.' : '글 없이도 이어갈 수 있어요.'}</p></div></div></section>;
}
export function RecordsCalendar({ records, onSave }: { records: DailyCheckin[]; onSave: (record: DailyCheckin) => boolean }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(localDay());
  const [editing, setEditing] = useState(false);
  const record = records.find(r => r.date === selected);
  const offset = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i >= offset && i < offset + days ? i - offset + 1 : null);
  const recommendation = record?.careRecommendations?.find(r => r.date === selected);
  function move(delta: number) { const next = new Date(month.getFullYear(), month.getMonth() + delta, 1); setMonth(next); setSelected(localDay(next)); setEditing(false); }
  return <><div className="calendar-card"><div className="calendar-head"><div><span className="eyebrow">나의 하루 모음</span><h2>{month.getFullYear()}년 {month.getMonth() + 1}월</h2></div><div className="calendar-controls"><button aria-label="이전 달" onClick={() => move(-1)}>‹</button><button aria-label="다음 달" onClick={() => move(1)}>›</button></div></div><div className="week-row">{['월','화','수','목','금','토','일'].map(d => <span key={d}>{d}</span>)}</div><div className="calendar-grid record-calendar">{cells.map((day, i) => { const date = day ? localDay(new Date(month.getFullYear(), month.getMonth(), day)) : ''; return day ? <button key={i} aria-label={date + (records.some(r => r.date === date) ? ' 기록 있음' : '')} aria-pressed={selected === date} className={selected === date ? 'today' : ''} onClick={() => { setSelected(date); setEditing(false); }}><span>{day}</span>{records.some(r => r.date === date) && <i/>}</button> : <div key={i}/>; })}</div><p className="calendar-note">기록하지 않은 날도 정원은 조용히 기다려요.</p></div><div className="record-details"><div className="record-detail-head"><h2>{Number(selected.slice(5,7))}월 {Number(selected.slice(8))}일의 나</h2>{record && <button className="text-button" onClick={() => setEditing(!editing)}>{editing ? '수정 마치기' : '기록 수정'}</button>}</div>{!record ? <div className="record-card empty-record">아직 남긴 기록이 없어요.<br/>기억하고 싶은 날에 천천히 남겨주세요.</div> : <><article className="record-card"><h3>돌아보기</h3><dl className="answer-summary">{QUESTIONS.map((q,i) => <div key={q.id}><dt>{['잠','에너지','식사','마음'][i]}</dt><dd>{q.options.find(o => o.value === normalizeAnswers(record.answers)[i])?.label ?? '아직 돌아보지 않았어요'}</dd></div>)}</dl><p className="privacy-note">돌아보기 응답은 이 날의 추천 행동과 함께 보관돼요.</p></article><article className="record-card"><h3>오늘 기록하기</h3>{editing ? <PhotoEditor key={selected} record={record} onSave={onSave}/> : record.photoId ? <><PhotoPreview key={record.photoId} id={record.photoId}/>{record.photoComment && <p className="saved-text">{record.photoComment}</p>}</> : <p className="empty-copy">사진 없이 남긴 하루예요.</p>}</article><article className="record-card"><h3>성장하기</h3>{editing ? <><NoteEditor record={record} onSave={onSave}/>{record.note && <button className="text-button" onClick={() => onSave({ ...record, note: '' })}>한마디 삭제</button>}</> : <p className="saved-text">{record.note || '말없이 쉬어간 날도 괜찮아요.'}</p>}</article>{recommendation && <article className="record-card"><h3>추천 행동</h3><ul className="record-care-list">{displayCareRecommendation(recommendation).cares.map(care => <li key={care.id}><span>{care.title}</span><strong>{record.completedCareIds.includes(care.id) ? '✓ 완료했어요' : '남겨둔 돌봄'}</strong></li>)}</ul></article>}</>}</div></>;
}
