import type { EDrugLabel } from '../lib/e-drug';
import type { LiveBenefit } from './support';

export const PLANT_CHAT_TEXT_LIMIT = 300;
export const PLANT_CHAT_HISTORY_LIMIT = 8;
export type PlantChatTurn = { role: 'user' | 'assistant'; text: string };
export type PlantChatSource =
  | { kind: 'medicine'; product: Omit<EDrugLabel, 'image'> }
  | { kind: 'medicine-options'; names: string[] }
  | { kind: 'policies'; items: LiveBenefit[] };
export type PlantChatReply = { text: string; source?: PlantChatSource; safety?: boolean; support?: boolean };
