import { evidenceSources, prototypeCares, validateAnalysis, type AnalysisInput } from './model';

/** 화면과 검증 전용 정해진 예시입니다. AI가 생성한 결과가 아닙니다. */
export function mockAnalysis(input: AnalysisInput) {
  const sources = evidenceSources(input);
  return validateAnalysis({
    summary: `지금 마음을 ‘${sources.mood}’로 표현한 하루네요.`,
    emotions: [{ interpretation: `마음 답변을 보면 ‘${sources.mood}’에 가까운 상태일 수 있어요. 그 이유까지는 알기 어려워요.`,
      evidence: [{ field: 'mood', quote: sources.mood }] }],
    energy: { level: input.answers[1], explanation: `직접 선택한 에너지는 ‘${sources.energy}’예요. 지금 느끼는 상태를 우선했어요.` },
    careNeeds: ['마음에 여유 주기', '나를 이해하기'],
    recommendations: prototypeCares(input).map(care => ({ careId: care.id,
      reason: `선택한 에너지를 기준으로 부담을 조절한 돌봄이에요. ‘${care.title}’를 편한 만큼 해보셔도 좋아요.`,
      evidence: [{ field: 'energy', quote: sources.energy }] })),
    uncertainty: '짧은 답변만으로 하루의 사정이나 마음을 모두 알기는 어려워요. 실제 느낌과 다를 수 있어요.',
  }, input);
}
