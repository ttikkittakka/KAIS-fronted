import { localOwner, readRecords, recordStorageWarning } from './record-store';
import { sunshineBalance } from './sunshine';
import { SHOP_CATALOG, shopItem } from './shop-catalog';

export const SHOP_KEY = 'little-garden.shop.v1';
export type Purchase = { itemId: string; cost: number; purchasedAt: string };
export type ShopState = { version: 1; owner: string; purchases: Purchase[]; placed: string[] };
const damaged = '상점 저장 정보를 읽지 못했어요. 기존 데이터를 보호하기 위해 구매와 배치를 멈췄어요. 브라우저 데이터를 지우지 말고 다시 열어 주세요.';
export const ownedItemIds = (state: ShopState) => [...SHOP_CATALOG.filter(item => item.defaultOwned).map(item => item.id), ...state.purchases.map(p => p.itemId)];
export const spentSunshine = (state: ShopState) => state.purchases.reduce((total, p) => total + p.cost, 0);
export function readShop(): ShopState {
  const owner = localOwner();
  const raw = localStorage.getItem(SHOP_KEY);
  if (raw === null) return { version: 1, owner, purchases: [], placed: ['default-sky'] };
  try {
    const state = JSON.parse(raw) as ShopState;
    if (!state || state.version !== 1 || state.owner !== owner || !Array.isArray(state.purchases) || !Array.isArray(state.placed)) throw new Error();
    const seen = new Set<string>();
    for (const p of state.purchases) {
      const item = p && shopItem(p.itemId);
      // Keep the actual purchase price; later catalog price changes must not alter balances.
      if (!item || item.defaultOwned || seen.has(p.itemId) || !Number.isSafeInteger(p.cost) || p.cost <= 0 || typeof p.purchasedAt !== 'string' || !Number.isFinite(Date.parse(p.purchasedAt))) throw new Error();
      seen.add(p.itemId);
    }
    const owned = ownedItemIds(state);
    if (state.placed.some(id => typeof id !== 'string' || !owned.includes(id)) || new Set(state.placed).size !== state.placed.length) throw new Error();
    for (const category of ['character', 'background']) {
      const count = state.placed.filter(id => shopItem(id)?.category === category).length;
      if (category === 'background' ? count !== 1 : count > 1) throw new Error();
    }
    if (!Number.isSafeInteger(spentSunshine(state))) throw new Error();
    return state;
  } catch { throw new Error(damaged); }
}
export function shopSnapshot() {
  const state = readShop();
  const records = readRecords();
  const warning = recordStorageWarning();
  if (warning) throw new Error(warning);
  const balance = sunshineBalance(records) - spentSunshine(state);
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('햇살 적립 기록과 구매 내역이 맞지 않아요. 데이터를 보호하기 위해 구매를 멈췄어요.');
  return { state, balance };
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
  const snapshot = shopSnapshot();
  // Item ID is a stable idempotency key: a retry never creates a second debit.
  if (ownedItemIds(snapshot.state).includes(id)) return snapshot;
  if (snapshot.balance < item.price) throw new Error('햇살이 ' + (item.price - snapshot.balance) + '개 더 필요해요. 작은 돌봄으로 천천히 모아 보아요.');
  const state: ShopState = { ...snapshot.state, purchases: [...snapshot.state.purchases, { itemId: id, cost: item.price, purchasedAt: new Date().toISOString() }] };
  commit(state);
  return { state, balance: snapshot.balance - item.price };
}
export function placeItem(id: string, place: boolean) {
  const snapshot = shopSnapshot();
  if (!ownedItemIds(snapshot.state).includes(id)) throw new Error('보관함에 있는 아이템만 배치할 수 있어요.');
  const item = shopItem(id)!;
  let placed = snapshot.state.placed.filter(value => value !== id && !(place && item.category !== 'decoration' && shopItem(value)?.category === item.category));
  if (place) placed.push(id);
  if (!placed.some(value => shopItem(value)?.category === 'background')) placed = [...placed, 'default-sky'];
  const state = { ...snapshot.state, placed };
  commit(state);
  return { ...snapshot, state };
}
