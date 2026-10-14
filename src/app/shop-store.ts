import { localOwner, readRecords, recordStorageWarning } from './record-store';
import { sunshineBalance } from './sunshine';
import { activeDayCount, growthMilestone, missingGrowthGrants, validGrowthGrants, type GrowthGrant, type GrowthRewardId } from './growth-rewards';
import { SHOP_CATALOG, shopItem } from './shop-catalog';
import { GARDEN_SLOTS, assignGardenSlot, clearGardenSlot, emptyGardenLayout, layoutItemIds, migrateGardenLayout, validateGardenLayout, compatibleSlot, type GardenLayout } from './garden-layout';

export const SHOP_KEY = 'little-garden.shop.v1';
export type Purchase = { itemId: string; cost: number; purchasedAt: string };
export type ShopState = { version: 3; rewards: GrowthGrant[]; owner: string; purchases: Purchase[]; placed: string[]; layout: GardenLayout; revision: number };
export const ownedQuantities = (state: ShopState): Record<string, number> => Object.fromEntries(ownedItemIds(state).map(id => [id, 1]));
const damaged = '상점 저장 정보를 읽지 못했어요. 기존 데이터를 보호하기 위해 구매와 배치를 멈췄어요. 브라우저 데이터를 지우지 말고 다시 열어 주세요.';
export const ownedItemIds = (state: Pick<ShopState, 'purchases' | 'rewards'>) => [...SHOP_CATALOG.filter(item => item.defaultOwned).map(item => item.id), ...state.purchases.map(p => p.itemId), ...state.rewards.flatMap(grant => growthMilestone(grant.id)!.itemIds)];
export const spentSunshine = (state: ShopState) => state.purchases.reduce((total, p) => total + p.cost, 0);
export function readShop(): ShopState {
  const owner = localOwner();
  const raw = localStorage.getItem(SHOP_KEY);
  if (raw === null) return { version: 3, rewards: [], owner, purchases: [], placed: ['default-sky'], layout: emptyGardenLayout(), revision: 0 };
  try {
    const state = JSON.parse(raw) as Omit<ShopState, 'version'> & { version: 1 | 2 | 3 };
    if (!state || ![1, 2, 3].includes(state.version) || state.owner !== owner || !Array.isArray(state.purchases) || !Array.isArray(state.placed)) throw new Error();
    const seen = new Set<string>();
    for (const p of state.purchases) {
      const item = p && shopItem(p.itemId);
      // Keep the actual purchase price; later catalog price changes must not alter balances.
      if (!item || item.defaultOwned || item.rewardDays || seen.has(p.itemId) || !Number.isSafeInteger(p.cost) || p.cost <= 0 || typeof p.purchasedAt !== 'string' || !Number.isFinite(Date.parse(p.purchasedAt))) throw new Error();
      seen.add(p.itemId);
    }
    if (state.version !== 3) state.rewards = [];
    if (!validGrowthGrants(state.rewards)) throw new Error();
    const owned = ownedItemIds(state);
    if (state.placed.some(id => typeof id !== 'string' || !owned.includes(id)) || new Set(state.placed).size !== state.placed.length) throw new Error();
    const normalized: ShopState = { ...state, version: 3, layout: state.version === 1 ? migrateGardenLayout(state.placed) : state.layout, revision: state.version === 1 ? 0 : state.revision };
    if (!Number.isSafeInteger(normalized.revision) || normalized.revision < 0) throw new Error();
    validateGardenLayout(normalized.layout, ownedQuantities(normalized));
    const ids = layoutItemIds(normalized.layout);
    if (ids.length !== state.placed.length || ids.some(id => !state.placed.includes(id))) throw new Error();
    if (!Number.isSafeInteger(spentSunshine(normalized))) throw new Error();
    return normalized;
  } catch { throw new Error(damaged); }
}
export function shopSnapshot() {
  const state = readShop();
  const records = readRecords();
  const warning = recordStorageWarning();
  if (warning) throw new Error(warning);
  const balance = sunshineBalance(records) - spentSunshine(state);
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('햇살 적립 기록과 구매 내역이 맞지 않아요. 데이터를 보호하기 위해 구매를 멈췄어요.');
  return { state, balance, activeDays: activeDayCount(records) };
}
function commit(state: ShopState) {
  // One synchronous setItem commits the debit receipt AND item ownership together.
  // The existing document-wide record-session lock serializes writers across tabs.
  try { localStorage.setItem(SHOP_KEY, JSON.stringify(state)); }
  catch { throw new Error('저장 공간이 부족하거나 저장이 차단됐어요. 변경 사항은 저장되지 않았어요. 공간을 확인한 뒤 다시 시도해 주세요.'); }
}
export function buyItem(id: string) {
  const item = shopItem(id);
  if (!item) throw new Error('찾을 수 없는 상품이에요.');
  if (item.rewardDays) throw new Error('누적 활동일을 달성하면 자동으로 받는 기념 선물이에요.');
  const snapshot = shopSnapshot();
  // Item ID is a stable idempotency key: a retry never creates a second debit.
  if (ownedItemIds(snapshot.state).includes(id)) return snapshot;
  if (snapshot.balance < item.price) throw new Error('햇살이 ' + (item.price - snapshot.balance) + '개 더 필요해요. 작은 돌봄으로 천천히 모아 보아요.');
  const state: ShopState = { ...snapshot.state, purchases: [...snapshot.state.purchases, { itemId: id, cost: item.price, purchasedAt: new Date().toISOString() }] };
  state.revision++;
  commit(state);
  return { ...snapshot, state, balance: snapshot.balance - item.price };
}
export function saveGardenLayout(layout: GardenLayout, expectedRevision: number) {
  const snapshot = shopSnapshot();
  if (snapshot.state.revision !== expectedRevision) throw new Error('정원 정보가 바뀌었어요. 최신 배치를 다시 불러온 뒤 저장해 주세요.');
  validateGardenLayout(layout, ownedQuantities(snapshot.state));
  const state: ShopState = { ...snapshot.state, layout: { ...layout }, placed: layoutItemIds(layout), revision: snapshot.state.revision + 1 };
  commit(state);
  return { ...snapshot, state };
}
// Compatibility helper for existing callers; editor saves an explicit complete layout.
export function placeItem(id: string, place: boolean) {
  const snapshot = shopSnapshot();
  if (!ownedItemIds(snapshot.state).includes(id)) throw new Error('보관함에 있는 아이템만 배치할 수 있어요.');
  let layout = snapshot.state.layout;
  if (place) {
    const slot = GARDEN_SLOTS.find(entry => compatibleSlot(id, entry.id) && (!layout[entry.id] || layout[entry.id] === id || entry.id === 'background'));
    if (!slot) throw new Error('빈 자리가 없어요. 정원 꾸미기에서 교체할 자리를 골라 주세요.');
    layout = assignGardenSlot(layout, id, slot.id);
  } else {
    for (const slot of GARDEN_SLOTS) if (layout[slot.id] === id) layout = clearGardenSlot(layout, slot.id);
  }
  return saveGardenLayout(layout, snapshot.state.revision);
}

// Sync only after record commits or session acquisition. Existing users receive all
// reached milestones, once, without changing their earned sunshine or placement.
export function syncGrowthRewards() {
  const snapshot = shopSnapshot();
  const grants = missingGrowthGrants(snapshot.activeDays, snapshot.state.rewards);
  if (!grants.length) return snapshot;
  const state: ShopState = { ...snapshot.state, rewards: [...snapshot.state.rewards, ...grants], revision: snapshot.state.revision + 1 };
  commit(state); // Grant receipt is ownership: one atomic write for the whole bundle.
  return { ...snapshot, state };
}
export function acknowledgeGrowthReward(id: GrowthRewardId) {
  const snapshot = shopSnapshot();
  const grant = snapshot.state.rewards.find(entry => entry.id === id);
  if (!grant || grant.seenAt) return snapshot;
  const state = { ...snapshot.state, revision: snapshot.state.revision + 1, rewards: snapshot.state.rewards.map(entry => entry.id === id ? { ...entry, seenAt: new Date().toISOString() } : entry) };
  commit(state);
  return { ...snapshot, state };
}
