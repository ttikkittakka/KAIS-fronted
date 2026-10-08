import { isCareId } from './cares';

export type GardenView = 'onboarding' | 'home' | 'checkin' | 'care' | 'garden';
export type DailyCheckin = {
  version: 1;
  date: string;
  answers: string[];
  note: string;
  plantState: 'low' | 'normal';
  completedCareIds: string[];
};

export const DAILY_KEY = 'little-garden.daily-checkin.v1';
export function localDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function parseDaily(raw: string | null, date = localDay()): DailyCheckin | null {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (!data || data.version !== 1 || data.date !== date ||
      !Array.isArray(data.answers) || data.answers.length !== 4 ||
      !data.answers.every((value: unknown) => typeof value === 'string' && value.length > 0) ||
      typeof data.note !== 'string' || !['low', 'normal'].includes(data.plantState) ||
      !Array.isArray(data.completedCareIds) ||
      !data.completedCareIds.every(isCareId)) return null;
    return data as DailyCheckin;
  } catch { return null; }
}

export function resolveView(view: string, daily: DailyCheckin | null): GardenView {
  if (view === 'care' && (!daily || daily.date !== localDay())) return 'checkin';
  return ['onboarding', 'home', 'checkin', 'care', 'garden'].includes(view) ? view as GardenView : 'home';
}
