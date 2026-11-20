import { appStorage } from './app-storage';
import { isRecoveryId, MISSION_PACES, type MissionPace, type RecoveryId } from './mission-policy';

const KEY = 'little-garden.preferences.v2';
export type GardenPreferences = { ai: boolean; pace: MissionPace; skipped: { date: string; ids: RecoveryId[] } | null };
const defaults: GardenPreferences = { ai: false, pace: 'any', skipped: null };

export function gardenPreferences(): GardenPreferences {
  try {
    const value = JSON.parse(appStorage.getItem(KEY) ?? 'null');
    if (!value) return defaults;
    return {
      ai: value.ai === true,
      pace: MISSION_PACES.includes(value.pace) ? value.pace : 'any',
      skipped: value.skipped && typeof value.skipped.date === 'string' && Array.isArray(value.skipped.ids)
        ? { date: value.skipped.date, ids: value.skipped.ids.filter(isRecoveryId) } : null,
    };
  } catch { return defaults; }
}

export function setGardenPreferences(change: Partial<GardenPreferences>) {
  const next = { ...gardenPreferences(), ...change };
  appStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
