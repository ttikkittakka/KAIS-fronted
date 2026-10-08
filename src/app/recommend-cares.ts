import { CARES, type Care, type CareId, type CareTag } from './cares';
import { normalizeAnswers, type AnswerValue } from './questions';

const low = (value: AnswerValue | undefined) => value === 'very_low' || value === 'low';
const good = (value: AnswerValue | undefined) => value === 'good' || value === 'very_good';
const TITLES = {
  energy: ['오늘은 몸을 조금\n쉬게 해줄까요?', '오늘은 조금 천천히\n가도 괜찮아요.', '아주 작은 것 하나만\n해볼까요?'],
  sleep: ['오늘은 조금 천천히\n가도 괜찮아요.', '잠깐 쉬어가는 시간을\n만들어볼까요?'],
  meal: ['오늘은 몸에 작은 것을\n하나 채워줄까요?', '부담 없는 한 모금부터\n시작해볼까요?'],
  mood: ['오늘은 마음에 작은 틈을\n만들어볼까요?', '지금의 나에게 조금\n다정해져볼까요?', '작은 돌봄 하나만\n골라도 좋아요.'],
  comfortable: ['오늘의 좋은 기분을\n조금 이어가볼까요?', '가벼운 마음으로\n하나 골라볼까요?', '오늘은 어떤 작은 돌봄을\n해볼까요?'],
  general: ['오늘 나를 위해\n잠깐 시간을 내볼까요?', '이 중 편안한 것 하나만\n골라도 좋아요.'],
};

function contextFor(answers: unknown) {
  const values = normalizeAnswers(answers);
  const [sleep, energy, meal, mood] = values;
  const complete = values.every(Boolean);
  const comfortable = complete && !values.some(low) && good(energy) && good(mood);
  const minimalOnly = !complete || energy === 'very_low' || (sleep === 'very_low' && low(energy));
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
  return { complete, comfortable, minimalOnly, tags, profile };
}

export function getCareCandidates(answers: unknown) {
  const context = contextFor(answers);
  return CARES.filter((care: Care) => {
    if (context.minimalOnly && care.effort !== 'minimal') return false;
    if ((care.effort === 'active' || care.category === 'connection') && !context.comfortable) return false;
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

export type CareRecommendation = { title: string; cares: (typeof CARES[number])[] };
export function recommendCares(answers: unknown, { date, recentIds = [] }: { date: string; recentIds?: readonly CareId[] }): CareRecommendation {
  const context = contextFor(answers);
  const random = seededRandom(`${date}:cares`);
  const candidates = getCareCandidates(answers);
  const selected: CareRecommendation['cares'] = [];
  const recent = new Set(recentIds);
  while (selected.length < 3) {
    const remaining = candidates.filter(care => !selected.some(item => item.id === care.id));
    // Include at least one action directly related to the recorded needs when
    // such a candidate exists; fill the other slots with suitable variety.
    const related = selected.length === 0
      ? remaining.filter((care: Care) => care.tags.some(tag => context.tags.includes(tag))) : [];
    const eligible = related.length ? related : remaining;
    // Prefer unused categories, without adding unsuitable actions to fill a slot.
    const diverse = eligible.filter(care => !selected.some(item => item.category === care.category));
    const pool = diverse.length ? diverse : eligible;
    if (!pool.length) break;
    // These are selection probabilities, not an assessment/score of the user.
    const weights = pool.map((care: Care) => (care.tags.some(tag => context.tags.includes(tag)) ? 3 : 1) * (recent.has(care.id as CareId) ? 0.2 : 1));
    let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
    const index = weights.findIndex(weight => { draw -= weight; return draw < 0; });
    selected.push(pool[index < 0 ? pool.length - 1 : index]);
  }
  const titles = TITLES[context.profile];
  const title = titles[Math.floor(seededRandom(`${date}:title`)() * titles.length)];
  return { title, cares: selected };
}
