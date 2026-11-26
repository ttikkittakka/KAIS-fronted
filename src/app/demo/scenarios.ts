import { normalizeAnswers } from '../questions';

export const CARE_SCENARIOS = [
  { label: '기본 상태', answers: ['normal', 'normal', 'normal', 'normal'] },
  { label: '에너지 낮음', answers: ['normal', 'low', 'normal', 'normal'] },
  { label: '많이 지친 날', answers: ['low', 'very_low', 'normal', 'very_low'] },
  { label: '신난 상태', answers: ['good', 'very_good', 'good', 'very_good'] },
];

export function demoAnswers(params: URLSearchParams) {
  const values = normalizeAnswers(['sleep', 'energy', 'meal', 'mood'].map(key => params.get(key)));
  return values.every(Boolean) ? values as string[] : null;
}
