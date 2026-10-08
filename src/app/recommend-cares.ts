import { CARES, type CareId } from './cares';
import { normalizeAnswers, type AnswerValue, type QuestionId } from './questions';

type Answers = Record<QuestionId, AnswerValue>;
type Rule = { matches: (answers: Answers) => boolean; title: string; ids: readonly [CareId, CareId, CareId] };
const low = (value: AnswerValue) => value === 'very_low' || value === 'low';
const good = (value: AnswerValue) => value === 'good' || value === 'very_good';

// First matching combination wins. Rest comes before activity, with no score.
// Each trio mixes categories; the most depleted combinations stay very gentle.
const RULES: Rule[] = [
  { matches: a => Object.values(a).every(value => value === 'very_low'), title: '오늘은 몸을 조금\n쉬게 해줄까요?', ids: ['rest', 'water', 'music'] },
  { matches: a => a.energy === 'very_low', title: '오늘은 몸을 조금\n쉬게 해줄까요?', ids: ['shoulders', 'water', 'music'] },
  { matches: a => a.sleep === 'very_low' && a.energy === 'low', title: '오늘은 조금 천천히\n가도 괜찮아요.', ids: ['rest', 'warm-drink', 'sunlight'] },
  { matches: a => a.meal === 'very_low', title: '오늘은 몸에 작은 것을\n하나 채워줄까요?', ids: ['water', 'snack', 'warm-drink'] },
  { matches: a => a.mood === 'very_low', title: '오늘은 마음에 작은 틈을\n만들어볼까요?', ids: ['music', 'rest', 'favorite'] },
  { matches: a => a.energy === 'low' && a.mood === 'low', title: '오늘은 아주 작은 것부터\n시작해볼까요?', ids: ['window', 'stretch', 'sky'] },
  { matches: a => low(a.sleep), title: '오늘은 조금 천천히\n가도 괜찮아요.', ids: ['rest', 'warm-drink', 'sunlight'] },
  { matches: a => a.energy === 'low', title: '오늘은 몸을 조금\n쉬게 해줄까요?', ids: ['shoulders', 'water', 'sky'] },
  { matches: a => a.meal === 'low', title: '오늘은 몸에 작은 것을\n하나 채워줄까요?', ids: ['water', 'snack', 'sunlight'] },
  { matches: a => a.mood === 'low', title: '오늘은 마음에 작은 틈을\n만들어볼까요?', ids: ['favorite', 'shoulders', 'window'] },
  { matches: a => good(a.energy) && good(a.mood), title: '오늘의 좋은 기분을\n조금 이어가볼까요?', ids: ['walk', 'sky', 'sunlight'] },
  { matches: a => good(a.energy), title: '오늘은 가볍게\n환기해볼까요?', ids: ['wash', 'window', 'music'] },
];
const DEFAULT = { title: '오늘 나를 위해\n잠깐 시간을 내볼까요?', ids: ['water', 'sky', 'stretch'] as const };

export function recommendCares(answers: unknown) {
  const [sleep, energy, meal, mood] = normalizeAnswers(answers);
  // Missing, unrecognized or partial answers use a complete gentle fallback.
  const selected = sleep && energy && meal && mood
    ? RULES.find(rule => rule.matches({ sleep, energy, meal, mood })) ?? DEFAULT
    : DEFAULT;
  return { title: selected.title, cares: selected.ids.map(id => CARES.find(care => care.id === id)!) };
}
