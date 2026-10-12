import { CARES, ACTIVE_CARES, LEGACY_CARES, isCareId, type CareId } from './cares';
import { recommendCares, type CareRecommendation } from './recommend-cares';

export type DailyCareRecommendation = { date: string; ids: CareId[]; title: string; catalogVersion?: 2 };

function dayNumber(date: string) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date
    ? time / 86400000 : NaN;
}

export function parseCareHistory(value: unknown): DailyCareRecommendation[] {
  if (!Array.isArray(value)) return [];
  const valid = value.filter((entry): entry is DailyCareRecommendation => entry &&
    typeof entry.date === 'string' && Number.isFinite(dayNumber(entry.date)) &&
    typeof entry.title === 'string' && entry.title.trim().length > 0 && entry.title.length <= 200 &&
    Array.isArray(entry.ids) && entry.ids.length === 3 && entry.ids.every(isCareId) && new Set(entry.ids).size === 3 &&
    (entry.catalogVersion === undefined || entry.catalogVersion === 2) &&
    entry.ids.every((id: string) => (entry.catalogVersion === 2 ? ACTIVE_CARES : LEGACY_CARES).some(care => care.id === id)));
  return valid.filter((entry, index) => valid.findIndex(item => item.date === entry.date) === index)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
}

export function readCareHistory(raw: string | null) {
  try {
    const data = JSON.parse(raw ?? 'null');
    return data?.version === 1 ? parseCareHistory(data.careRecommendations) : [];
  } catch { return []; }
}

export function ensureCareHistory(date: string, answers: unknown, history: readonly DailyCareRecommendation[] = []) {
  const entries = parseCareHistory(history).filter(entry => entry.date <= date);
  // This also fixes the order and the wording after an answer edit on the same day.
  if (entries.some(entry => entry.date === date)) return entries;
  const recentIds = entries.filter(entry => {
    const age = dayNumber(date) - dayNumber(entry.date);
    return age >= 1 && age <= 3;
  }).flatMap(entry => entry.ids);
  const recommendation = recommendCares(answers, { date, recentIds });
  return [{ date, ids: recommendation.cares.map(care => care.id as CareId), title: recommendation.title, catalogVersion: 2 as const }, ...entries].slice(0, 7);
}

export function displayCareRecommendation(saved: DailyCareRecommendation): CareRecommendation {
  return { title: saved.title, cares: saved.ids.map(id => saved.catalogVersion === 2
    ? ACTIVE_CARES.find(care => care.id === id)!
    : { ...LEGACY_CARES.find(care => care.id === id)!, active: CARES.find(care => care.id === id)?.active ?? false }) };
}
