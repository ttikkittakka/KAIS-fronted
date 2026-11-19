'use client';

import { useState } from 'react';
import { CompanionArt } from './Companions';
import { ItemArt } from './GardenPlacement';
import { companion, type CompanionId, type CompanionState } from '../companions';
import { ALL_GARDEN_ITEMS, OUTFIT_SLOTS, SHOP_CATALOG, type OutfitSlot, type ShopCategory, type ShopItem } from '../shop-catalog';
import { ownedItemIds, type shopSnapshot } from '../shop-store';
import { readOutfit, wear, type Outfit } from '../wardrobe';
type Snapshot = ReturnType<typeof shopSnapshot>;
const priceLabel = (item: ShopItem) => item.rewardDays ? `${item.rewardDays}일 기념 선물` : `햇살 ${item.price}`;

/** 옷 입히기: the friend in the middle, slot tabs, and every outfit (owned ones put on with one tap). */
export function DressUp({ snapshot, companions, slot: initialSlot = 'head', friend: initialFriend = null, onWear, onShop, onChoose }: {
  snapshot: Snapshot | null; companions: CompanionState | null; slot?: OutfitSlot; friend?: CompanionId | null;
  onWear: () => void; onShop: (itemId: string, friend: CompanionId) => void; onChoose: () => void;
}) {
  const owned = snapshot ? ownedItemIds(snapshot.state) : [];
  const [friend, setFriend] = useState<CompanionId | null>(companions?.adopted.some(a => a.id === initialFriend) ? initialFriend : companions?.active ?? null);
  const [slot, setSlot] = useState<OutfitSlot>(initialSlot);
  const [outfit, setOutfit] = useState<Outfit>(() => friend ? readOutfit(friend, owned) : {});
  const [error, setError] = useState('');
  if (!companions || !friend) return <div className="settings-content"><p className="shop-caption">옷을 입힐 친구를 먼저 골라 주세요.</p>
    <button type="button" className="primary-button" onClick={onChoose}>함께할 친구 고르기</button></div>;
  const put = (id: string | null) => {
    if (!snapshot) { setError('보관함을 아직 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'); return; } // unknown ownership must not change outfits
    try { setOutfit(wear(friend, slot, id, owned)); setError(''); onWear(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '옷을 저장하지 못했어요. 다시 시도해 주세요.'); }
  };
  const worn = outfit[slot];
  return <div className="dress">
    <div className="dress-stage"><CompanionArt id={friend} outfit={outfit} interactive={false} className="dress-art"
      label={`${companion(friend).name}${Object.keys(outfit).length ? ' · ' + Object.values(outfit).map(id => ALL_GARDEN_ITEMS.find(i => i.id === id)?.name).join(', ') + ' 착용' : ''}`}/></div>
    {companions.adopted.length > 1 && <div className="dress-friends" role="group" aria-label="옷을 입힐 친구">
      {companions.adopted.map(a => <button key={a.id} type="button" aria-pressed={a.id === friend} onClick={() => { setFriend(a.id); setOutfit(readOutfit(a.id, owned)); setError(''); }}>{companion(a.id).name}</button>)}
    </div>}
    <div className="dress-slots" role="group" aria-label="입힐 자리">
      {OUTFIT_SLOTS.map(s => <button key={s.id} type="button" aria-pressed={slot === s.id} onClick={() => setSlot(s.id)}>{s.label}</button>)}
    </div>
    <ul className="dress-grid" aria-label={OUTFIT_SLOTS.find(s => s.id === slot)!.label + '에 입힐 옷'}>
      <li><button type="button" className="dress-item" aria-pressed={!worn} onClick={() => put(null)}><span className="dress-none" aria-hidden="true"/><strong>안 입기</strong></button></li>
      {SHOP_CATALOG.filter(item => item.wear === slot).map(item => {
        const has = owned.includes(item.id);
        return <li key={item.id}><button type="button" className={'dress-item' + (has ? '' : ' dress-item--missing')} aria-pressed={has ? worn === item.id : undefined}
          aria-label={`${item.name}, ${has ? (worn === item.id ? '입는 중. 누르면 벗어요' : '보유 중. 누르면 입혀요') : priceLabel(item) + '. 상점에서 보기'}`}
          onClick={() => has ? put(worn === item.id ? null : item.id) : onShop(item.id, friend)}>
          <ItemArt item={item}/><strong>{item.name}</strong><small>{has ? (worn === item.id ? '입는 중' : '보유') : priceLabel(item)}</small></button></li>;
      })}
    </ul>
    {error && <p role="alert" className="shop-error">{error}</p>}
    <p className="shop-caption">친구마다 따로 입혀요. 입힌 옷은 홈에서도 그대로 보여요. 없는 옷을 누르면 상점으로 가요.</p>
  </div>;
}

const GROUPS: [ShopCategory, string][] = [['outfit', '옷'], ['background', '배경'], ['decoration', '꾸미기'], ['character', '정원 친구']];

/** 아이템 창: every collectible, owned ones in full colour and the rest as silhouettes to look forward to. */
export function Inventory({ snapshot, worn, onUse }: { snapshot: Snapshot | null; worn: readonly string[]; onUse: (item: ShopItem, owned: boolean) => void }) {
  const [group, setGroup] = useState<ShopCategory>('outfit');
  const owned = snapshot ? ownedItemIds(snapshot.state) : [];
  const count = (items: readonly ShopItem[]) => items.filter(item => owned.includes(item.id)).length;
  const status = (item: ShopItem) => !owned.includes(item.id) ? priceLabel(item)
    : item.category === 'outfit' ? (worn.includes(item.id) ? '입는 중' : '보관 중') : snapshot?.state.placed.includes(item.id) ? '배치 중' : '보관 중';
  return <div className="items">
    <p className="items-count"><strong>{count(ALL_GARDEN_ITEMS)}</strong> / {ALL_GARDEN_ITEMS.length}개 모았어요</p>
    <div className="shop-categories" role="group" aria-label="아이템 종류">{GROUPS.map(([id, label]) => {
      const list = ALL_GARDEN_ITEMS.filter(item => item.category === id);
      return <button type="button" key={id} aria-pressed={group === id} onClick={() => setGroup(id)}>{label} {count(list)}/{list.length}</button>;
    })}</div>
    <ul className="items-grid">{ALL_GARDEN_ITEMS.filter(item => item.category === group).map(item => {
      const has = owned.includes(item.id);
      return <li key={item.id}><button type="button" className={'items-slot' + (has ? '' : ' items-slot--missing')} onClick={() => onUse(item, has)}
        aria-label={`${item.name}, ${status(item)}. ${has ? (item.category === 'outfit' ? '옷 입히기로 가요' : '집 꾸미기로 가요') : item.rewardDays ? '함께한 날의 선물에서 확인해요' : '상점에서 보기'}`}>
        <ItemArt item={item}/><strong>{item.name}</strong><small>{status(item)}</small></button></li>;
    })}</ul>
    <p className="shop-caption">모은 옷과 배경, 소품을 한눈에 볼 수 있어요. 흐린 칸은 아직 만나지 못한 아이템이에요.</p>
  </div>;
}
