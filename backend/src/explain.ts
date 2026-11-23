import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CARES, isCareId } from './catalog/cares';
import { QUESTIONS } from './catalog/questions';

export const PROMPT_VERSION = 'explain-v1';
const MODEL = 'claude-opus-5-5';
const LABELS = ['잠', '에너지', '식사', '마음'];

export const ExplainInput = z.object({
  answers: z.array(z.string()).length(4)
    .refine(answers => answers.every((value, i) => QUESTIONS[i].options.some(option => option.value === value)), 'unknown answer'),
  careIds: z.array(z.string()).min(1).max(3)
    .refine(ids => new Set(ids).size === ids.length && ids.every(isCareId), 'unknown care'),
}).strict();
export type ExplainInput = z.infer<typeof ExplainInput>;
export type Explanation = { reason: string; source: 'ai' | 'fallback'; promptVersion: string };
/** Returns the model's text, or null when it declined or stopped early. */
export type Llm = (system: string, prompt: string) => Promise<string | null>;

const SYSTEM = `당신은 '오늘의 정원' 앱에서, 이미 정해진 작은 돌봄 행동을 왜 골랐는지 사용자에게 짧게 설명합니다.
- 한국어 해요체로 1~2문장, 120자 이내로 씁니다.
- 사용자가 직접 답한 상태만 근거로 삼고, 감정이나 상태를 추측하거나 단정하지 않습니다.
- 행동을 새로 제안하거나 바꾸지 않습니다.
- 진단·치료·약·병원·상담·위기에 관한 말, 점수, 숫자, 전화번호, 링크를 쓰지 않습니다.
- "해야 해요" 같은 압박 대신 "하나만 골라도 괜찮아요" 같은 선택형 표현을 씁니다.
- 설명 문장만 출력합니다.`;

function promptFor({ answers, careIds }: ExplainInput) {
  const report = QUESTIONS.map((question, i) => `- ${LABELS[i]}: ${question.options.find(option => option.value === answers[i])!.label}`);
  const cares = careIds.map(id => `- ${CARES.find(care => care.id === id)!.title}`);
  return ['오늘의 자기보고', ...report, '', '이미 정해진 작은 돌봄', ...cares].join('\n');
}

const BANNED = ['진단', '치료', '처방', '약물', '복용', '병원', '의사', '상담', '우울증', '질환', '장애', '자살', '자해', '위험', '위기', '반드시', '해야 해', '해야 합니다', 'http', 'www.'];
/** Output guard: anything outside the contract falls back to fixed text. */
export function guard(text: string): string | null {
  const reason = text.trim();
  const sentences = reason.match(/[.!?。](?=\s|$)/g)?.length ?? 0;
  if (reason.length < 10 || reason.length > 140 || sentences > 2 || reason.includes('\n')) return null;
  if (!/[가-힣]/.test(reason) || /\d{3,}/.test(reason)) return null;
  return BANNED.some(word => reason.includes(word)) ? null : reason;
}

const low = (value: string) => value === 'very_low' || value === 'low';
export function fallbackReason([sleep, energy, meal, mood]: string[]) {
  if (low(energy)) return '오늘 에너지가 낮다고 답해 주어서, 몸에 부담이 적은 돌봄부터 골랐어요.';
  if (low(sleep)) return '잠이 편하지 않았다고 답해 주어서, 잠깐 쉬어갈 수 있는 돌봄을 골랐어요.';
  if (low(meal)) return '식사를 챙기기 어려웠다고 답해 주어서, 몸을 살피는 작은 돌봄을 담았어요.';
  if (low(mood)) return '마음이 무겁다고 답해 주어서, 마음에 작은 틈을 만드는 돌봄을 골랐어요.';
  return '오늘 답해 준 상태에 맞춰, 가볍게 해볼 수 있는 돌봄을 골랐어요.';
}

export async function explain(input: ExplainInput, llm: Llm | null): Promise<Explanation> {
  const fallback: Explanation = { reason: fallbackReason(input.answers), source: 'fallback', promptVersion: PROMPT_VERSION };
  if (!llm) return fallback;
  try {
    const text = await llm(SYSTEM, promptFor(input));
    const reason = text === null ? null : guard(text);
    // Never log the prompt or output: both describe the user's self-reported condition.
    if (!reason) console.warn('explain: model output rejected');
    return reason ? { reason, source: 'ai', promptVersion: PROMPT_VERSION } : fallback;
  } catch (error) {
    console.warn('explain: model call failed', error instanceof Anthropic.APIError ? error.status : error instanceof Error ? error.name : 'unknown');
    return fallback;
  }
}

export function claudeLlm(): Llm | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ timeout: 10_000, maxRetries: 0 });
  return async (system, prompt) => {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason !== 'end_turn') return null;
    return response.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('');
  };
}
