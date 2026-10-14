import { shopItem } from './shop-catalog';

// Percent coordinates refer to the unchanged garden scene, never the viewport.
// Visual bounds stay separate; the original sprout remains above this layer.
export const GARDEN_SLOTS = [
  { id: 'friend-left', label: '좌측 친구', kind: 'character', x: 12, y: 79, width: 14, height: 12 },
  { id: 'friend-right', label: '우측 친구', kind: 'character', x: 88, y: 79, width: 14, height: 12 },
  { id: 'friend-front', label: '앞쪽 친구', kind: 'character', x: 50, y: 93, width: 14, height: 12 },
  { id: 'flower-left', label: '왼쪽 꽃자리', kind: 'flower', x: 28, y: 93, width: 12, height: 10 },
  { id: 'flower-right', label: '오른쪽 꽃자리', kind: 'flower', x: 72, y: 93, width: 12, height: 10 },
  { id: 'path', label: '조약돌 길자리', kind: 'path', x: 50, y: 84, width: 16, height: 4 },
  { id: 'bench-left', label: '왼쪽 벤치자리', kind: 'bench', x: 12, y: 94, width: 14, height: 8 },
  { id: 'bench-right', label: '오른쪽 벤치자리', kind: 'bench', x: 88, y: 94, width: 14, height: 8 },
  { id: 'background', label: '정원 배경', kind: 'background', x: 0, y: 0, width: 100, height: 100 },
] as const;
export type GardenSlotId = typeof GARDEN_SLOTS[number]['id'];
export type GardenLayout = Partial<Record<GardenSlotId, string>> & { background: string };
export const emptyGardenLayout = (): GardenLayout => ({ background: 'default-sky' });
export function compatibleSlot(itemId: string, slotId: string) {
  const item = shopItem(itemId);
  const slot = GARDEN_SLOTS.find(entry => entry.id === slotId);
  if (!item || !slot) return false;
  const kind = item.category === 'decoration' ? { 'yellow-flower': 'flower', 'anniversary-flower': 'flower', 'pebble-path': 'path', 'small-bench': 'bench' }[item.id] : item.category;
  return kind === slot.kind;
}
export function validateGardenLayout(value: unknown, quantities: Readonly<Record<string, number>>): asserts value is GardenLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('정원 배치 정보를 확인해 주세요.');
  const layout = value as Record<string, unknown>;
  if (typeof layout.background !== 'string') throw new Error('배경은 하나를 선택해 주세요.');
  const used = new Map<string, number>();
  for (const [slot, id] of Object.entries(layout)) {
    if (typeof id !== 'string' || !compatibleSlot(id, slot)) throw new Error('아이템 종류에 맞는 자리를 골라 주세요.');
    const available = quantities[id] ?? 0;
    const count = (used.get(id) ?? 0) + 1;
    // All current catalog items are single-owned; never invent inventory copies.
    if (!Number.isSafeInteger(available) || available < count || count > 1) throw new Error('보유한 수량보다 많이 배치할 수 없어요. 이미 놓인 아이템은 이동해 주세요.');
    used.set(id, count);
  }
}
export function assignGardenSlot(layout: GardenLayout, itemId: string, slot: GardenSlotId): GardenLayout {
  if (!compatibleSlot(itemId, slot)) throw new Error('이 아이템을 놓을 수 없는 자리예요.');
  const next = { ...layout };
  // Moving one unique item frees its old slot. A replaced item stays owned.
  for (const key of Object.keys(next) as GardenSlotId[]) if (next[key] === itemId) delete next[key];
  next[slot] = itemId;
  return next;
}
export function clearGardenSlot(layout: GardenLayout, slot: GardenSlotId): GardenLayout {
  const next = { ...layout };
  if (slot === 'background') next.background = 'default-sky';
  else delete next[slot];
  return next;
}
export function migrateGardenLayout(placed: string[]): GardenLayout {
  let layout = emptyGardenLayout();
  for (const id of placed) {
    const slot = GARDEN_SLOTS.find(entry => compatibleSlot(id, entry.id) && (entry.id === 'background' || !layout[entry.id]));
    if (!slot) throw new Error('이전 배치 정보를 옮기지 못했어요.');
    layout = assignGardenSlot(layout, id, slot.id);
  }
  return layout;
}
export const layoutItemIds = (layout: GardenLayout) => Object.values(layout);
