import { appStorage } from './app-storage';
import { COMPANIONS, type CompanionId } from './companions';
import { shopItem, type OutfitSlot } from './shop-catalog';

// What each friend is wearing. Ownership lives in the shop purchases; this only remembers the choice.
export const WARDROBE_KEY = 'little-garden.wardrobe.v1';
export type Outfit = Partial<Record<OutfitSlot, string>>;
type Wardrobe = { version: 1; worn: Partial<Record<CompanionId, Outfit>> };

const fits = (id: unknown, slot: OutfitSlot) => typeof id === 'string' && shopItem(id)?.wear === slot;

/** The friend's outfit, keeping only owned items that still belong to their slot. */
export function readOutfit(friend: CompanionId, owned: readonly string[]): Outfit {
  let worn: Outfit = {};
  try { worn = (JSON.parse(appStorage.getItem(WARDROBE_KEY) ?? 'null') as Wardrobe | null)?.worn?.[friend] ?? {}; } catch { /* damaged: dressed in nothing */ }
  return Object.fromEntries(Object.entries(worn).filter(([slot, id]) => fits(id, slot as OutfitSlot) && owned.includes(id as string)));
}

/** Puts an owned item on (or null takes the slot off). Returns the friend's new outfit. */
export function wear(friend: CompanionId, slot: OutfitSlot, id: string | null, owned: readonly string[]): Outfit {
  if (!COMPANIONS.some(c => c.id === friend)) throw new Error('함께하는 친구를 찾지 못했어요.');
  if (id !== null && (!fits(id, slot) || !owned.includes(id))) throw new Error('보관함에 있는 옷만 입힐 수 있어요.');
  let state: Wardrobe = { version: 1, worn: {} };
  try { const saved = JSON.parse(appStorage.getItem(WARDROBE_KEY) ?? 'null') as Wardrobe | null; if (saved?.version === 1 && saved.worn) state = saved; } catch { /* rewrite a damaged file */ }
  // Other slots keep what was saved (even if ownership cannot be read right now); readOutfit filters on display.
  const outfit: Outfit = Object.fromEntries(Object.entries(state.worn[friend] ?? {}).filter(([key, item]) => fits(item, key as OutfitSlot)));
  if (id) outfit[slot] = id; else delete outfit[slot];
  try { appStorage.setItem(WARDROBE_KEY, JSON.stringify({ version: 1, worn: { ...state.worn, [friend]: outfit } })); }
  catch { throw new Error('저장 공간이 부족해 옷을 저장하지 못했어요. 다시 시도해 주세요.'); }
  return readOutfit(friend, owned);
}

// Fitted by Codex on composites (design-output/wardrobe/fit.json, fit-sheet.png). Where each slot sits on each 512px companion picture, in % of the picture (x, y, width; r = degrees).
// head: (x, y) is where the hat's bottom centre sits; face: centre of the glasses; neck: top centre of the collar.
// sink pulls a hat down onto the head (or a collar up under the chin) by that share of its own height.
type Anchor = { x: number; y: number; w: number; r: number };
export const FIT: { items: Record<string, { sink: number; scale: number }>; anchors: Record<CompanionId, Record<OutfitSlot, Anchor>> } = {
  items: {
    'straw-hat': { sink: 0.19, scale: 1 }, 'flower-crown': { sink: 0.37, scale: 1.03 }, 'knit-beanie': { sink: 0.24, scale: 0.55 }, 'party-hat': { sink: 0.29, scale: 0.365 }, 'round-glasses': { sink: 0, scale: 0.778 }, 'heart-sunglasses': { sink: 0, scale: 1 }, 'mint-scarf': { sink: 0.2, scale: 1 }, 'red-bowtie': { sink: 0.07, scale: 0.65 }, 'bell-collar': { sink: 0.17, scale: 0.94 },
  },
  anchors: {
    plant: { head: { x: 34.2, y: 40.1, w: 29.8, r: -12 }, face: { x: 50, y: 59.4, w: 37.5, r: 0.4 }, neck: { x: 49.8, y: 73.4, w: 26, r: 0 } },
    cat: { head: { x: 46.4, y: 25.2, w: 44.5, r: 1 }, face: { x: 45.3, y: 47.3, w: 42.1, r: 3.8 }, neck: { x: 45.1, y: 65.1, w: 33.8, r: 2 } },
    dog: { head: { x: 48.9, y: 19.4, w: 43, r: 0 }, face: { x: 47.2, y: 45.6, w: 45.3, r: 0.9 }, neck: { x: 48, y: 65.3, w: 33.6, r: 0 } },
    pegasus: { head: { x: 46.2, y: 20.4, w: 34, r: 8 }, face: { x: 44.7, y: 49.5, w: 40.4, r: 3.3 }, neck: { x: 44.5, y: 66.6, w: 29.8, r: 2 } },
  },
};
