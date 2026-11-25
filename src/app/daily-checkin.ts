import { developerToolsAvailable } from './app-storage';
import type { SunshineLedger } from './sunshine';
import { isCareId } from './cares';
import { parseCareHistory, type DailyCareRecommendation } from './daily-cares';
import type { Outing } from './wellbeing';
import type { RecoveryId } from './mission-policy';

export type GardenView = 'onboarding' | 'home' | 'today' | 'checkin' | 'care' | 'garden' | 'photo' | 'growth' | 'shop' | 'decorate' | 'dress' | 'items' | 'rewards' | 'extra-care' | 'settings' | 'developer' | 'safety' | 'companion' | 'companions' | 'support' | 'privacy' | 'map' | 'connections' | 'guardian' | 'missions' | 'medications' | 'profile' | 'pot-name';
export type DailyCheckin = {
  version: 1;
  sunshine?: SunshineLedger;
  userId?: string;
  photoId?: string;
  photoComment?: string;
  stage?: 'checkin' | 'photo' | 'growth' | 'care';
  createdAt?: string;
  updatedAt?: string;
  date: string;
  answers: string[];
  note: string;
  outing?: Outing;
  plantState: 'low' | 'normal';
  completedCareIds: string[];
  completedMissionIds?: RecoveryId[];
  careRecommendations?: DailyCareRecommendation[];
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
    // Damaged recommendation metadata must not discard a valid check-in.
    if (data.careRecommendations !== undefined) data.careRecommendations = parseCareHistory(data.careRecommendations);
    return data as DailyCheckin;
  } catch { return null; }
}

export function resolveView(view: string, daily: DailyCheckin | null): GardenView {
  if (view === 'developer') return developerToolsAvailable() ? 'developer' : 'settings';
  if (['care', 'photo', 'growth'].includes(view) && (!daily || daily.date !== localDay() || !daily.answers.every(Boolean) || daily.answers.length !== 4)) return 'checkin';
  if (view === 'care' && daily?.stage && daily.stage !== 'care') return daily.stage;
  return ['onboarding', 'home', 'today', 'checkin', 'care', 'garden', 'photo', 'growth', 'shop', 'decorate', 'dress', 'items', 'rewards', 'extra-care', 'settings', 'safety', 'companion', 'companions', 'support', 'privacy', 'map', 'connections', 'guardian', 'missions', 'medications', 'profile', 'pot-name'].includes(view) ? view as GardenView : 'home';
}
