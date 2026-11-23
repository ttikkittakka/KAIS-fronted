export type AnswerValue = 'very_low' | 'low' | 'normal' | 'good' | 'very_good';
export type QuestionId = 'sleep' | 'energy' | 'meal' | 'mood';
type Question = { id: QuestionId; title: string; helper: string; options: { label: string; value: AnswerValue }[] };

export const QUESTIONS: Question[] = [
  { id: 'sleep', title: '오늘 잠은 어땠나요?', helper: '완벽하게 기억하지 않아도 괜찮아요.', options: [
    { label: '많이 힘들었어요', value: 'very_low' }, { label: '조금 뒤척였어요', value: 'low' },
    { label: '그냥 그래요', value: 'normal' }, { label: '괜찮게 잤어요', value: 'good' },
  ] },
  { id: 'energy', title: '지금 에너지는\n어느 정도인가요?', helper: '지금 이 순간에 가장 가까운 것을 골라주세요.', options: [
    { label: '매우 낮음', value: 'very_low' }, { label: '낮음', value: 'low' }, { label: '보통', value: 'normal' },
    { label: '괜찮음', value: 'good' }, { label: '충분함', value: 'very_good' },
  ] },
  { id: 'meal', title: '오늘 식사는 어땠나요?', helper: '잘 챙기지 못한 날도 있는 그대로 괜찮아요.', options: [
    { label: '거의 못 먹었어요', value: 'very_low' }, { label: '조금 먹었어요', value: 'low' },
    { label: '평소와 비슷해요', value: 'normal' }, { label: '든든하게 먹었어요', value: 'good' },
  ] },
  { id: 'mood', title: '지금 마음은 어떤가요?', helper: '이름 붙이기 어려운 마음도 괜찮아요.', options: [
    { label: '많이 지쳐요', value: 'very_low' }, { label: '조금 무거워요', value: 'low' }, { label: '잔잔해요', value: 'normal' },
    { label: '괜찮아요', value: 'good' }, { label: '가벼워요', value: 'very_good' },
  ] },
];

// Accept original v1 label-based records as well as new internal values.
export function normalizeAnswers(answers: unknown): (AnswerValue | undefined)[] {
  return QUESTIONS.map((question, index) => {
    const answer: unknown = Array.isArray(answers) ? answers[index] : undefined;
    return question.options.find(option => option.value === answer || option.label === answer)?.value;
  });
}

export function plantStateForAnswers(answers: unknown): 'low' | 'normal' {
  return normalizeAnswers(answers).some(value => value === 'very_low' || value === 'low') ? 'low' : 'normal';
}
