import { z } from 'zod';
import { QUESTIONS } from '../../app/questions';
import { getCareCandidates, recommendCares } from '../../app/recommend-cares';

const answer = z.enum(['very_low', 'low', 'normal', 'good']);
const wide = z.enum(['very_low', 'low', 'normal', 'good', 'very_good']);
export const inputSchema = z.object({
  synthetic: z.literal(true),
  answers: z.tuple([answer, wide, answer, wide]),
  note: z.string().max(300), photoComment: z.string().max(100),
}).strict();
export type AnalysisInput = z.infer<typeof inputSchema>;
export const requestSchema = inputSchema.extend({ requestId: z.uuid() }).strict();
export const EVIDENCE_LABELS = { sleep: '잠', energy: '에너지', meal: '식사', mood: '마음', note: '글', photoComment: '사진 코멘트' } as const;
const evidence = z.object({ field: z.enum(['sleep', 'energy', 'meal', 'mood', 'note', 'photoComment']), quote: z.string().min(1).max(100) }).strict();
const prose = z.string().min(5).max(240);
export const analysisSchema = z.object({
  summary: prose,
  emotions: z.array(z.object({ interpretation: prose, evidence: z.array(evidence).min(1).max(3) }).strict()).min(1).max(3),
  energy: z.object({ level: wide, explanation: prose }).strict(),
  careNeeds: z.array(z.enum(['몸 쉬기', '기본 욕구 챙기기', '마음에 여유 주기', '나를 이해하기', '작은 변화', '연결감 느끼기'])).min(1).max(3),
  recommendations: z.array(z.object({ careId: z.string().min(1), reason: prose, evidence: z.array(evidence).min(1).max(2) }).strict()).length(3),
  uncertainty: prose,
}).strict();
export type Analysis = z.infer<typeof analysisSchema>;

// 시제품의 재현 가능한 고정 기준일입니다. 실제 날짜·기록·추천 이력을 읽지 않습니다.
export function prototypeCares(input: AnalysisInput) {
  const selected = recommendCares(input.answers, { date: '2026-11-19', recentIds: [] }).cares;
  const allowed = new Set(getCareCandidates(input.answers).map(care => care.id));
  if (selected.length !== 3 || selected.some(care => !allowed.has(care.id))) throw new Error('INVALID_CATALOG');
  return selected;
}
export function evidenceSources(input: AnalysisInput): Record<keyof typeof EVIDENCE_LABELS, string> {
  return { sleep: QUESTIONS[0].options.find(o => o.value === input.answers[0])!.label,
    energy: QUESTIONS[1].options.find(o => o.value === input.answers[1])!.label,
    meal: QUESTIONS[2].options.find(o => o.value === input.answers[2])!.label,
    mood: QUESTIONS[3].options.find(o => o.value === input.answers[3])!.label,
    note: input.note, photoComment: input.photoComment };
}
export function validateAnalysis(raw: unknown, input: AnalysisInput): Analysis {
  const value = analysisSchema.parse(raw);
  const cares = prototypeCares(input);
  if (value.energy.level !== input.answers[1] || value.recommendations.some((r, i) => r.careId !== cares[i].id)) throw new Error('INVALID_GROUNDING');
  const sources = evidenceSources(input);
  for (const entry of [...value.emotions, ...value.recommendations]) {
    for (const item of entry.evidence) {
      if (!item.quote.trim() || !sources[item.field].trim() || !sources[item.field].includes(item.quote)) throw new Error('INVALID_EVIDENCE');
    }
  }
  const texts = [value.summary, value.energy.explanation, value.uncertainty, ...value.emotions.map(e => e.interpretation), ...value.recommendations.map(r => r.reason)];
  // 문장 품질 검사는 보조 수단입니다. 의미상의 모든 추론 오류를 증명하지는 못합니다.
  if (texts.some(text => !/[가-힣]/.test(text) || /[\u3040-\u30ff]|우울증|조울증|정신질환|반드시|분명히|확실히|틀림없이|100%|https?:\/\//.test(text))) throw new Error('UNSAFE_LANGUAGE');
  if (!/수 있|어려|모르|제한|단정|추측/.test(value.uncertainty)) throw new Error('MISSING_UNCERTAINTY');
  return value;
}

// 2026-11-19 공식 가격 기준. 실제 청구액은 OpenAI Usage에서 확인합니다.
export const PRICE = { inputPerMillion: 0.75, outputPerMillion: 4.5, checkedAt: '2026-11-19', typicalMin: 0.004, typicalMax: 0.02 };
export const usageSchema = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).strict();
export const costFor = (usage: z.infer<typeof usageSchema>) => (usage.inputTokens * PRICE.inputPerMillion + usage.outputTokens * PRICE.outputPerMillion) / 1_000_000;
export const responseSchema = z.object({
  model: z.literal('gpt-5.4-mini'), analysis: analysisSchema,
  usage: usageSchema.nullable(), estimatedUsd: z.number().nonnegative().nullable(), apiCalls: z.literal(1),
}).strict();
export type AnalysisResponse = z.infer<typeof responseSchema>;
