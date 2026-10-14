'use client';

import { useRef, useState } from 'react';
import { GARDEN_SLOTS, assignGardenSlot, clearGardenSlot, compatibleSlot, type GardenLayout, type GardenSlotId } from '../garden-layout';
import { shopItem } from '../shop-catalog';
import { saveGardenLayout, shopSnapshot } from '../shop-store';
import GardenPlacement from './GardenPlacement';
import RivePlant from './RivePlant';

type Snapshot = ReturnType<typeof shopSnapshot>;
export default function GardenEditor({ snapshot, itemId, plantState, onChange, onClose, onHome }: {
  snapshot: Snapshot; itemId: string; plantState: 'normal' | 'low'; onChange: (snapshot: Snapshot) => void; onClose: () => void; onHome: () => void;
}) {
  const [draft, setDraft] = useState<GardenLayout>(() => ({ ...snapshot.state.layout }));
  const [revision, setRevision] = useState(snapshot.state.revision);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  const item = shopItem(itemId)!;
  const available = GARDEN_SLOTS.filter(slot => compatibleSlot(itemId, slot.id));
  const currentSlot = GARDEN_SLOTS.find(slot => draft[slot.id] === itemId);
  const chooseSlot = (slot: GardenSlotId) => { setDraft(assignGardenSlot(draft, itemId, slot)); setError(''); };
  const save = () => {
    if (saving.current || saved) return;
    saving.current = true;
    try { const next = saveGardenLayout(draft, revision); onChange(next); setRevision(next.state.revision); setSaved(true); setError(''); }
    catch (cause) { saving.current = false; setError(cause instanceof Error ? cause.message : '배치를 저장하지 못했어요. 이전 정원은 그대로예요.'); }
  };
  const reload = () => {
    try { const next = shopSnapshot(); onChange(next); setDraft({ ...next.state.layout }); setRevision(next.state.revision); setReviewing(false); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '배치를 읽지 못했어요.'); }
  };
  const changes = GARDEN_SLOTS.filter(slot => draft[slot.id] !== snapshot.state.layout[slot.id]);
  return <section className="garden-editor" aria-labelledby="editor-title">
    <h2 id="editor-title">{saved ? '정원에 저장했어요' : reviewing ? '이 모습으로 꾸밀까요?' : item.name + ' 자리 고르기'}</h2>
    <p className="shop-caption">{saved ? '정원으로 돌아가면 바로 만날 수 있어요.' : '보관함 → 슬롯 선택 → 미리보기 → 저장'}</p>
    <div className="garden-editor-preview home-screen" aria-label="정원 배치 미리보기">
      <div className={'garden-scene garden-scene--' + draft.background}>
        <div className="scene-weather"><span className="cloud-shape one"/><span className="cloud-shape two"/></div>
        <div className="hero-plant"><RivePlant state={plantState} className="plant-art" /></div>
        <div className="soil-floor"/><GardenPlacement layout={draft}/>
      </div>
    </div>
    <p className="shop-asset-note">새싹이는 중앙 고정 · 추가 친구 최대 3명 · 새 아이템은 임시 아이콘으로 표시돼요.</p>
    {error && <div className="shop-error" role="alert"><p>{error}</p><p>저장된 배치는 그대로 유지돼요.</p><button type="button" onClick={reload}>최신 배치 다시 불러오기</button></div>}
    {saved ? <div className="garden-editor-actions"><p role="status">배치 저장 완료</p><button type="button" className="primary-button" onClick={onHome}>정원으로 돌아가기</button><button type="button" className="shop-secondary" onClick={onClose}>다른 아이템 꾸미기</button></div> : reviewing ? <>
      <ul className="garden-change-list" aria-label="저장할 변경 사항">{changes.map(slot => <li key={slot.id}>{slot.label}: {shopItem(snapshot.state.layout[slot.id] ?? '')?.name ?? '빈자리'} → {shopItem(draft[slot.id] ?? '')?.name ?? '빈자리'}</li>)}</ul>
      <p className="shop-caption">교체하거나 해제한 아이템은 보관함에 남아요. 햇살은 사용하지 않아요.</p>
      <div className="garden-editor-actions"><button type="button" className="primary-button" onClick={save} disabled={!changes.length}>배치 저장</button><button type="button" className="shop-secondary" onClick={() => setReviewing(false)}>슬롯 다시 선택</button><button type="button" className="shop-secondary" onClick={onClose}>변경 취소</button></div>
    </> : <>
      <fieldset className="garden-slot-choices"><legend>{item.name}을 놓을 자리</legend>{available.map(slot => {
        const existing = draft[slot.id] ? shopItem(draft[slot.id]!) : undefined;
        return <button type="button" key={slot.id} aria-pressed={draft[slot.id] === itemId} onClick={() => chooseSlot(slot.id)}><strong>{slot.label}</strong><span>{existing ? existing.name + (existing.id === itemId ? ' · 선택됨' : ' · 선택하면 교체') : '빈자리'}</span></button>;
      })}</fieldset>
      {currentSlot && !(item.defaultOwned && currentSlot.id === 'background') && <button type="button" className="shop-secondary" onClick={() => { setDraft(clearGardenSlot(draft, currentSlot.id)); setError(''); }}>배치 해제 · 보관함으로</button>}
      <div className="garden-editor-actions"><button type="button" className="primary-button" disabled={!changes.length} onClick={() => setReviewing(true)}>미리보기 확인</button><button type="button" className="shop-secondary" onClick={onClose}>변경 취소</button></div>
    </>}
  </section>;
}
