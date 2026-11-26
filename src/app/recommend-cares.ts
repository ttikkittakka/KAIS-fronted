import { ACTIVE_CARES, type Care, type CareId, type CareTag } from './cares';
import { normalizeAnswers, type AnswerValue } from './questions';

const low = (value: AnswerValue | undefined) => value === 'very_low' || value === 'low';
const good = (value: AnswerValue | undefined) => value === 'good' || value === 'very_good';
const TITLES = {
  energy: ['오늘은 몸을 조금\n쉬게 해줄까요?', '오늘은 조금 천천히\n가도 괜찮아요.', '아주 작은 것 하나만\n해볼까요?'],
  sleep: ['오늘은 조금 천천히\n가도 괜찮아요.', '잠깐 쉬어가는 시간을\n만들어볼까요?'],
  meal: ['지금 가능한 작은 돌봄을\n하나 골라볼까요?', '내 몸에 필요한 것을\n천천히 살펴볼까요?'],
  mood: ['오늘은 마음에 작은 틈을\n만들어볼까요?', '지금의 나에게 조금\n다정해져볼까요?', '작은 돌봄 하나만\n골라도 좋아요.'],
  comfortable: ['오늘의 좋은 기분을\n조금 이어가볼까요?', '가벼운 마음으로\n하나 골라볼까요?', '오늘은 어떤 작은 돌봄을\n해볼까요?'],
  general: ['오늘 나를 위해\n잠깐 시간을 내볼까요?', '이 중 편안한 것 하나만\n골라도 좋아요.'],
};

function contextFor(answers: unknown) {
  const values = normalizeAnswers(answers);
  const [sleep, energy, meal, mood] = values;
  const complete = values.every(Boolean);
  const comfortable = complete && !values.some(low) && good(energy) && good(mood);
  const minimalOnly = !complete || energy === 'very_low' || mood === 'very_low' || (sleep === 'very_low' && low(energy));
  const tags: CareTag[] = [];
  if (low(sleep)) tags.push('low_sleep');
  if (low(energy)) tags.push('low_energy');
  if (low(meal)) tags.push('low_meal');
  if (low(mood)) tags.push('low_mood');
  if (comfortable) tags.push('comfortable');
  const profile: keyof typeof TITLES = !complete ? 'general' : energy === 'very_low' ? 'energy'
    : sleep === 'very_low' && low(energy) ? 'sleep' : meal === 'very_low' ? 'meal'
    : low(mood) ? 'mood' : low(sleep) ? 'sleep' : low(energy) ? 'energy'
    : low(meal) ? 'meal' : comfortable ? 'comfortable' : 'general';
  const severity: Partial<Record<CareTag, number>> = { comfortable: 3, ...Object.fromEntries(['low_sleep', 'low_energy', 'low_meal', 'low_mood'].map((tag, index) =>
    [tag, values[index] === 'very_low' ? 2 : 1])) };
  return { complete, comfortable, minimalOnly, tags, profile, severity, values };
}

export function getCareCandidates(answers: unknown) {
  const context = contextFor(answers);
  return ACTIVE_CARES.filter((care: Care) => {
    if (context.minimalOnly && care.effort !== 'minimal') return false;
    if ((care.effort === 'active' || care.comfortableOnly) && !context.comfortable) return false;
    return care.tags.includes('general') || (context.complete && care.tags.some(tag => context.tags.includes(tag)));
  });
}

// Local PRNG: no global Math.random, time reads, storage or effects during render.
function seededRandom(seed: string) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export type CareRecommendation = { title: string; cares: Care[] };
export function recommendCares(answers: unknown, { date, recentIds = [] }: { date: string; recentIds?: readonly CareId[] }): CareRecommendation {
  const context = contextFor(answers);
  const random = seededRandom(`${date}:cares:${context.values.join(':')}`);
  const candidates = getCareCandidates(answers);
  const selected: CareRecommendation['cares'] = [];
  const recent = new Set(recentIds);
  while (selected.length < 3) {
    // Similar actions are excluded across categories too (e.g. resting and pausing).
    const remaining = candidates.filter(care => !selected.some(item => item.id === care.id ||
      (care.similarity && item.similarity === care.similarity)));
    const diverse = remaining.filter(care => !selected.some(item => item.category === care.category));
    const varied = diverse.length ? diverse : remaining;
    // Pick categories, never fixed mission IDs. Each category retains daily/history variation.
    const preferredCategory = context.comfortable ? ['change', 'understanding', 'connection'][selected.length]
      : selected.length === 0 ? (context.minimalOnly ? 'rest' : context.tags.some(tag => tag !== 'low_mood') ? 'body' : undefined)
      : undefined;
    const preferred = varied.filter(care => care.category === preferredCategory);
    const eligible = preferred.length ? preferred : varied;
    // Cover unmet needs rather than repeatedly selecting for the same answer.
    const uncovered = context.comfortable && selected.length === 2 ? ['comfortable'] as const
      : context.tags.filter(tag => !selected.some(care => (care.weights?.[tag] ?? 0) > 0));
    const related = eligible.filter(care => uncovered.some(tag => (care.weights?.[tag] ?? 0) > 0));
    const pool = related.length ? related : eligible;
    if (!pool.length) break;
    // Catalog preference weights scaled by answer severity, never a clinical assessment.
    const weights = pool.map(care => (1 + context.tags.reduce((sum, tag) => sum + (care.weights?.[tag] ?? 0) * (context.severity[tag] ?? 1), 0)) * (recent.has(care.id as CareId) ? 0.2 : 1));
    let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
    const index = weights.findIndex(weight => { draw -= weight; return draw < 0; });
    selected.push(pool[index < 0 ? pool.length - 1 : index]);
  }
  const titles = TITLES[context.profile];
  const title = titles[Math.floor(seededRandom(`${date}:title`)() * titles.length)];
  return { title, cares: selected };
}
