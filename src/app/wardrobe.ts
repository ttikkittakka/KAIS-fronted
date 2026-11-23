import { appStorage } from './app-storage';
import { COMPANIONS, restoreCompanionId, type CompanionId } from './companions';
import { shopItem, type OutfitSlot } from './shop-catalog';

// What each friend is wearing. Ownership lives in the shop purchases; this only remembers the choice.
export const WARDROBE_KEY = 'little-garden.wardrobe.v1';
export type Outfit = Partial<Record<OutfitSlot, string>>;
type Wardrobe = { version: 1; worn: Partial<Record<CompanionId, Outfit>> };

const fits = (id: unknown, slot: OutfitSlot) => typeof id === 'string' && shopItem(id)?.wear === slot;
function readWardrobe(): Wardrobe {
  const worn: Wardrobe['worn'] = {};
  try {
    const state = JSON.parse(appStorage.getItem(WARDROBE_KEY) ?? 'null') as Wardrobe | null;
    if (state?.version === 1 && state.worn) {
      for (const [savedId, outfit] of Object.entries(state.worn)) {
        const id = restoreCompanionId(savedId);
        if (id && outfit && (savedId === id || !Object.hasOwn(state.worn, id))) worn[id] = outfit;
      }
    }
  } catch { /* damaged wardrobe: use an empty outfit */ }
  return { version: 1, worn };
}

/** The friend's outfit, keeping only owned items that still belong to their slot. */
export function readOutfit(friend: CompanionId, owned: readonly string[]): Outfit {
  const worn = readWardrobe().worn[friend] ?? {};
  return Object.fromEntries(Object.entries(worn).filter(([slot, id]) => fits(id, slot as OutfitSlot) && owned.includes(id as string)));
}

/** Puts an owned item on (or null takes the slot off). Returns the friend's new outfit. */
export function wear(friend: CompanionId, slot: OutfitSlot, id: string | null, owned: readonly string[]): Outfit {
  if (!COMPANIONS.some(c => c.id === friend)) throw new Error('함께하는 친구를 찾지 못했어요.');
  if (id !== null && (!fits(id, slot) || !owned.includes(id))) throw new Error('보관함에 있는 옷만 입힐 수 있어요.');
  const state = readWardrobe();
  // Other slots keep what was saved (even if ownership cannot be read right now); readOutfit filters on display.
  const outfit: Outfit = Object.fromEntries(Object.entries(state.worn[friend] ?? {}).filter(([key, item]) => fits(item, key as OutfitSlot)));
  if (id) outfit[slot] = id; else delete outfit[slot];
  try { appStorage.setItem(WARDROBE_KEY, JSON.stringify({ version: 1, worn: { ...state.worn, [friend]: outfit } })); }
  catch { throw new Error('저장 공간이 부족해 옷을 저장하지 못했어요. 다시 시도해 주세요.'); }
  return readOutfit(friend, owned);
}

// The face and collar sit on the pot. The hat follows the growing crown.
export const FIT: { items: Record<string, { sink: number; scale: number }>; anchors: Record<OutfitSlot, { y: number; w: number }> } = {
  items: {
    'straw-hat': { sink: 0.19, scale: 1 }, 'flower-crown': { sink: 0.37, scale: 1.03 }, 'knit-beanie': { sink: 0.24, scale: 0.55 }, 'party-hat': { sink: 0.29, scale: 0.365 }, 'round-glasses': { sink: 0, scale: 0.778 }, 'heart-sunglasses': { sink: 0, scale: 1 }, 'mint-scarf': { sink: 0.2, scale: 1 }, 'red-bowtie': { sink: 0.07, scale: 0.65 }, 'bell-collar': { sink: 0.17, scale: 0.94 },
  },
  anchors: {
    head: { y: 0, w: 27 },
    face: { y: 80.5, w: 28 },
    neck: { y: 90, w: 24 },
  },
};
