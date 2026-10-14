'use client';

import { useRef, useState } from 'react';
import { SHOP_CATALOG, SHOP_CATEGORIES, shopItem, type ShopItem, type ShopCategory } from '../shop-catalog';
import { buyItem, ownedItemIds, placeItem, type shopSnapshot, type ShopState } from '../shop-store';
type Snapshot = ReturnType<typeof shopSnapshot>;
function Preview({ item }: { item: ShopItem }) {
  return <div className={'shop-preview shop-preview--' + item.category}><span aria-hidden="true">{item.icon}</span><small>임시 아이콘</small></div>;
}
export function GardenPlacement({ state }: { state: ShopState | null }) {
  if (!state) return null;
  const items = state.placed.map(shopItem).filter((item): item is ShopItem => !!item && item.category !== 'background');
  return <div className="garden-placements">{items.map(item => <span key={item.id} className={'garden-placed garden-placed--' + item.category} aria-label={item.name + ' (임시 아이콘)'}><span aria-hidden="true">{item.icon}</span><small>{item.name} · 임시</small></span>)}</div>;
}
export default function GardenShop({ inventory, snapshot, storageError, onChange, onRetry, onHome, onSwitch }: {
  inventory: boolean; snapshot: Snapshot | null; storageError: string; onChange: (value: Snapshot) => void;
  onRetry: () => void; onHome: () => void; onSwitch: () => void;
}) {
  const [category, setCategory] = useState<ShopCategory>('character');
  const [selected, setSelected] = useState<string | null>(null);
  const [purchased, setPurchased] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const owned = snapshot ? ownedItemIds(snapshot.state) : [];
  const item = selected ? shopItem(selected) : undefined;
  const bought = purchased ? shopItem(purchased) : undefined;
  const act = (operation: () => Snapshot, done?: () => void) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { onChange(operation()); done?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const choose = (id: string) => { setSelected(id); setPurchased(null); setError(''); };
  return <div className="shop-content">
    <div className="shop-summary"><span>모아 둔 햇살 <strong>☀️ {snapshot?.balance ?? '—'}</strong></span><button type="button" onClick={onSwitch}>{inventory ? '상점 구경하기' : '보관함 열기'}</button></div>
    {storageError && <div className="shop-error" role="alert"><p>{storageError}</p><button type="button" onClick={onRetry}>다시 확인하기</button></div>}
    {error && <p className="shop-error" role="alert">{error}</p>}
    {!storageError && snapshot && <>
      {bought ? <section className="shop-detail" aria-labelledby="purchase-title" role="status">
        <Preview item={bought}/><h2 id="purchase-title">{bought.name}, 보관함에 도착했어요</h2><p>남은 햇살 ☀️ {snapshot.balance}</p>
        <button type="button" className="primary-button" disabled={busy} onClick={() => act(() => placeItem(bought.id, true), onHome)}>정원에 배치하기</button>
        <button type="button" className="shop-secondary" onClick={() => { setPurchased(null); setSelected(null); if (!inventory) onSwitch(); }}>보관함에 두기</button>
      </section> : item ? <section className="shop-detail" aria-labelledby="item-title">
        <button type="button" className="shop-back" onClick={() => { setSelected(null); setError(''); }}>← 목록으로</button>
        <Preview item={item}/><h2 id="item-title">{item.name}</h2><p>{item.description}</p>
        <p className="shop-asset-note">전용 그림은 준비 중이에요. 정원에는 임시 아이콘으로 표시돼요. 캐릭터는 기존 식물 곁에 배치돼요.</p>
        {owned.includes(item.id) ? <><p className="shop-owned">{item.defaultOwned ? '기본 제공 · ' : ''}보유 중 · {snapshot.state.placed.includes(item.id) ? '배치 중' : '보관 중'}</p>
          <button type="button" className="primary-button" disabled={busy || (item.defaultOwned && snapshot.state.placed.includes(item.id))} onClick={() => act(() => placeItem(item.id, !snapshot.state.placed.includes(item.id)))}>{snapshot.state.placed.includes(item.id) ? (item.defaultOwned ? '기본 배경 사용 중' : '보관함으로 옮기기') : '정원에 배치하기'}</button><button type="button" className="shop-secondary" onClick={onHome}>정원에서 보기</button></> : <>
          <dl className="shop-price"><div><dt>가격</dt><dd>☀️ {item.price}</dd></div><div><dt>현재 잔액</dt><dd>☀️ {snapshot.balance}</dd></div><div><dt>구매 후 잔액</dt><dd>{snapshot.balance >= item.price ? '☀️ ' + (snapshot.balance - item.price) : '햇살이 ' + (item.price - snapshot.balance) + '개 부족해요'}</dd></div></dl>
          <p>{snapshot.balance < item.price ? '작은 돌봄으로 햇살을 천천히 모아 보아요.' : '아래 버튼을 누르면 햇살을 사용하고 보관함에 담아요.'}</p>
          <button type="button" className="primary-button" disabled={busy || snapshot.balance < item.price} onClick={() => act(() => buyItem(item.id), () => { setPurchased(item.id); setSelected(null); })}>{busy ? '저장 중…' : '☀️ ' + item.price + ' 사용 · 구매 확인'}</button>
        </>}
      </section> : <>
        <div className="shop-categories" role="group" aria-label="상품 카테고리">{SHOP_CATEGORIES.map(c => <button type="button" key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.label}</button>)}</div>
        <p className="shop-caption">{inventory ? '함께할 친구와 소품을 골라 정원에 놓아 보세요.' : '매일 모은 햇살로 정원을 조금씩 채워요.'}</p>
        <div className="shop-grid">{SHOP_CATALOG.filter(entry => entry.category === category && (!inventory || owned.includes(entry.id))).map(entry => <button type="button" className="shop-card" key={entry.id} onClick={() => choose(entry.id)}><Preview item={entry}/><strong>{entry.name}</strong><span>{owned.includes(entry.id) ? (inventory ? (snapshot.state.placed.includes(entry.id) ? '배치 중' : '보관 중') : '보유 중') : '☀️ ' + entry.price}</span>{entry.defaultOwned && <small>무료 기본 보유</small>}</button>)}</div>
        {inventory && !SHOP_CATALOG.some(entry => entry.category === category && owned.includes(entry.id)) && <div className="shop-empty"><p>아직 보관 중인 아이템이 없어요.</p><button type="button" className="shop-secondary" onClick={onSwitch}>상점 구경하기</button></div>}
      </>}
    </>}
    <p className="shop-storage-note">이 브라우저에 보관돼요. 브라우저 데이터를 지우거나 기기를 바꾸면 햇살과 아이템을 복구할 수 없어요.</p>
  </div>;
}
