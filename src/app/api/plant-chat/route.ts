import { z } from 'zod';
import { gov24Source } from '../../../../backend/src/benefits';
import { findEDrugLabels } from '../../../lib/e-drug';
import { keyConfigurationError, requestOpenAIJson } from '../../../lib/openai/connection';
import { EDRUG_KEY_HEADER, GOV24_KEY_HEADER, OPENAI_KEY_HEADER, parseProviderKey } from '../../../lib/provider-keys';
import { privateJson, smallJson } from '../../../lib/request';
import { friendReply } from '../../chat';
import { medicineNameKey, POLICY_BRIEFING_LIMIT } from '../../plant-briefing';
import { PLANT_CHAT_HISTORY_LIMIT, PLANT_CHAT_TEXT_LIMIT, type PlantChatReply } from '../../plant-chat';

const input = z.object({ turns: z.array(z.object({
  role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(PLANT_CHAT_TEXT_LIMIT),
}).strict()).min(1).max(PLANT_CHAT_HISTORY_LIMIT) }).strict();
const kind = ['chat', 'medicine', 'policies'] as const;
const output = z.object({
  kind: z.enum(kind),
  reply: z.string().trim().max(1800),
  product: z.string().trim().max(180),
  terms: z.array(z.string().trim().max(32)).max(4),
}).strict();
const medicalQuestion = /복용\s*(?:법|방법|주기|시간|량|해도|하면|할까)|복약|용법|용량|약\s*(?:정보|이름)|알레르기|과민\s*반응|부작용|병용/;
const policyQuestion = /정부\s*24|보조금\s*24|지원\s*(?:사업|제도|정책|금)|복지\s*혜택|공공서비스/;
const genericPolicyTerms = new Set(['지원', '지원사업', '지원제도', '지원정책', '지원금', '혜택', '복지', '정부', '정부24', '보조금24', '공공서비스']);

export async function POST(request: Request) {
  const parsed = input.safeParse(await smallJson(request, 24 * 1024));
  const latest = parsed.success ? parsed.data.turns.at(-1) : undefined;
  if (!parsed.success || latest?.role !== 'user') return privateJson({ error: 'invalid-conversation' }, 400);
  const local = friendReply(latest.text);
  if (local.safety) return privateJson({ text: local.text, safety: true, support: local.support });
  const key = parseProviderKey(request.headers.get(OPENAI_KEY_HEADER));
  if (!key || keyConfigurationError(key)) return privateJson({ error: 'connection-required' }, 400);

  const turns = parsed.data.turns.filter(turn => turn.role !== 'user' || !friendReply(turn.text).safety);
  const model = await requestOpenAIJson({
    instructions: '정원을 함께 가꾸는 다정한 화분으로서 사용자의 마지막 말과 최근 대화에 맞춰 한국어 300자 이내로 답하세요. '
      + '상대의 구체적인 이야기를 반영하고 이전 문장을 반복하지 마세요. 일기나 계정 정보는 제공받지 않습니다. '
      + '의약품, 용법, 알레르기, 부작용, 병용 질문은 medicine으로 분류하고 제품에 관한 답변을 만들지 마세요. '
      + 'product에는 사용자가 직접 쓴 제품 이름과 함량만 적고, 제품을 특정하기 어렵거나 여러 제품이면 빈 문자열을 반환하세요. '
      + '정부 지원사업, 제도, 혜택 조회는 policies로 분류하세요. 사용자가 직접 말한 지역·대상·분야 검색어를 terms에 최대 3개 넣고 구체적인 제도 정보를 만들지 마세요. '
      + '특정 검색어가 없거나 policies가 아니면 terms는 빈 배열입니다. '
      + '일상 대화는 chat으로 분류하고 reply를 채우세요. 진단하거나 복용·치료·지원 자격을 판단하지 마세요.',
    input: JSON.stringify(turns), maxOutputTokens: 640,
    name: 'garden_plant_conversation',
    schema: { type: 'object', additionalProperties: false, required: ['kind', 'reply', 'product', 'terms'], properties: {
      kind: { type: 'string', enum: kind }, reply: { type: 'string' }, product: { type: 'string' }, terms: { type: 'array', items: { type: 'string' } },
    } },
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(16_000)]),
  }, { env: { OPENAI_API_KEY: key } });
  const answer = output.safeParse(model.value);
  if (model.status !== 'success' || !answer.success) return privateJson({ error: 'openai-unavailable' }, 502);

  const { text } = latest;
  if (answer.data.kind === 'medicine' || medicalQuestion.test(text)) {
    const product = answer.data.product;
    const productKey = medicineNameKey(product);
    const namedByUser = productKey.length >= 2 && turns.some(turn => turn.role === 'user' && medicineNameKey(turn.text).includes(productKey));
    return privateJson(await medicineReply(namedByUser ? product : '', request));
  }
  if (answer.data.kind === 'policies' || policyQuestion.test(text)) {
    const terms = Array.from(new Set(answer.data.terms.map(medicineNameKey).filter(term => term.length >= 2 &&
      !genericPolicyTerms.has(term) && turns.some(turn => turn.role === 'user' && medicineNameKey(turn.text).includes(term))))).slice(0, 3);
    return privateJson(await policyReply(terms, request));
  }
  if (!answer.data.reply) return privateJson({ error: 'openai-unavailable' }, 502);
  return privateJson({ text: answer.data.reply.slice(0, PLANT_CHAT_TEXT_LIMIT) });
}

async function medicineReply(name: string, request: Request): Promise<PlantChatReply> {
  if (!name) return { text: '약 포장에 적힌 제품명과 함량을 알려주면 식약처의 사용법과 알레르기 관련 주의사항을 찾아볼게요.' };
  const key = parseProviderKey(request.headers.get(EDRUG_KEY_HEADER));
  if (!key) return { text: '설정에서 식약처 e약은요 API를 연결하면 이 제품의 공식 정보를 찾아볼 수 있어요.' };
  try {
    const products = await findEDrugLabels(name, key, request.signal);
    const exact = products.filter(product => medicineNameKey(product.name) === medicineNameKey(name));
    if (exact.length !== 1) {
      if (!products.length) return { text: '식약처 e약은요에서 해당 제품을 찾지 못했어요. 포장을 보면서 제품명과 함량을 확인해 주세요.' };
      return { text: '검색된 제품 중 포장과 동일한 이름을 골라 주세요. 함량과 제형까지 확인해 주세요.',
        source: { kind: 'medicine-options', names: Array.from(new Set(products.map(product => product.name))).slice(0, 3) } };
    }
    const { code, name: productName, manufacturer, effect, howToUse, precautions, interactions } = exact[0];
    return { text: '식약처에서 확인한 제품 정보예요. 알레르기 이력이나 함께 복용하는 약이 있다면 제품 포장을 약사에게 보여 주세요.',
      source: { kind: 'medicine', product: { code, name: productName, manufacturer, effect, howToUse, precautions, interactions } } };
  } catch { return { text: '식약처 제품 정보를 불러오지 못했어요. 연결을 확인한 뒤 다시 물어봐 주세요.' }; }
}

async function policyReply(terms: string[], request: Request): Promise<PlantChatReply> {
  const key = parseProviderKey(request.headers.get(GOV24_KEY_HEADER));
  if (!key) return { text: '설정에서 행안부 정부24 API를 연결하면 지원사업을 찾아볼 수 있어요.', support: true };
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(13_000)]);
    const items = await gov24Source(key, fetch, signal, POLICY_BRIEFING_LIMIT, terms)!();
    return items.length
      ? { text: '정부24에서 찾은 지원사업이에요. 각 공식 안내에서 대상과 신청 기간을 확인해 주세요.',
        source: { kind: 'policies', items }, support: true }
      : { text: '정부24에서 검색 조건에 맞는 지원사업을 찾지 못했어요. 지역이나 분야를 짧게 다시 알려줘도 좋아요.', support: true };
  } catch { return { text: '정부24 지원사업을 불러오지 못했어요. 연결을 확인한 뒤 다시 물어봐 주세요.', support: true }; }
}
