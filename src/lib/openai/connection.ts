import 'server-only';
import { z } from 'zod';

export const CONNECTION_MODEL = 'gpt-5.4-mini';
type ErrorCode = 'OPENAI_API_KEY_MISSING' | 'OPENAI_API_KEY_PLACEHOLDER' | 'OPENAI_PROJECT_ID_NOT_API_KEY'
  | 'OPENAI_KEY_HEADER_UNSAFE' | 'OPENAI_AUTHENTICATION_FAILED'
  | 'OPENAI_PERMISSION_DENIED' | 'OPENAI_MODEL_UNAVAILABLE' | 'OPENAI_RATE_LIMITED'
  | 'OPENAI_UPSTREAM_ERROR' | 'OPENAI_REQUEST_REJECTED' | 'OPENAI_TIMEOUT'
  | 'OPENAI_NETWORK_ERROR' | 'OPENAI_INVALID_RESPONSE' | 'OPENAI_INCOMPLETE_RESPONSE';
export type ConnectionResult = {
  status: 'not_run' | 'success' | 'error';
  model: typeof CONNECTION_MODEL;
  errorCode: ErrorCode | null;
};

/** 로컬 설정 오류만 구분합니다. 키의 접두어·길이·실제 유효성은 검사하지 않습니다. */
export function keyConfigurationError(value: string | undefined): ErrorCode | null {
  const key = value?.trim();
  if (!key) return 'OPENAI_API_KEY_MISSING';
  if (/^(?:your[-_ ](?:openai[-_ ])?api[-_ ]key(?:[-_ ]here)?|your[-_ ]key[-_ ]here|replace[-_ ]?me|changeme|placeholder|example|sk-(?:\.\.\.|your[-_]api[-_]key)|OPENAI_API_KEY|여기에.*(?:키|key).*|실제.*(?:키|key).*|발급받은.*(?:키|key).*)$/i.test(key)
    || /^<[^<>]+>$/.test(key) || /^\$\{[^{}]+\}$/.test(key)) return 'OPENAI_API_KEY_PLACEHOLDER';
  if (/^proj[_-][A-Za-z0-9_-]+$/.test(key)) return 'OPENAI_PROJECT_ID_NOT_API_KEY';
  // 실제 HTTP 헤더 제약만 확인합니다. 잘못 붙여 넣은 문자를 삭제해 키를 변형하지 않습니다.
  try { new Headers({ Authorization: `Bearer ${key}` }); }
  catch { return 'OPENAI_KEY_HEADER_UNSAFE'; }
  return null;
}

const responseSchema = z.object({
  status: z.string(),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }).optional(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
});

type ImageInput = { role: 'user'; content: (
  { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'low' | 'high' }
)[] }[];
type JsonRequest = { instructions: string; input: string | ImageInput; name: string; schema: Record<string, unknown>; maxOutputTokens: number; signal?: AbortSignal };
export type JsonResponse = ConnectionResult & { attempted: boolean; value?: unknown; usage?: { inputTokens: number; outputTokens: number } };

/** 서버 전용 공통 전송 계층. 고정 모델·목적지, 저장 비활성화, 재시도 없음. */
export async function requestOpenAIJson(
  payload: JsonRequest,
  { env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY }, request = fetch }: {
    env?: { OPENAI_API_KEY?: string };
    request?: typeof fetch;
  } = {},
): Promise<JsonResponse> {
  let attempted = false;
  let usage: JsonResponse['usage'];
  const result = (status: ConnectionResult['status'], errorCode: ErrorCode | null = null): JsonResponse =>
    ({ status, model: CONNECTION_MODEL, errorCode, attempted, ...(usage ? { usage } : {}) });
  const configurationError = keyConfigurationError(env.OPENAI_API_KEY);
  if (configurationError) return result('not_run', configurationError);
  const key = env.OPENAI_API_KEY!.trim();

  const timeout = AbortSignal.timeout(45000);
  const signal = payload.signal ? AbortSignal.any([payload.signal, timeout]) : timeout;
  try {
    signal.throwIfAborted();
    attempted = true;
    // 목적지 고정 및 리디렉션 차단으로 인증 정보가 다른 호스트로 전달되지 않게 합니다.
    const response = await request('https://api.openai.com/v1/responses', {
      method: 'POST', redirect: 'error', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONNECTION_MODEL, store: false, max_output_tokens: payload.maxOutputTokens,
        reasoning: { effort: 'low' },
        instructions: payload.instructions, input: payload.input,
        text: { format: { type: 'json_schema', name: payload.name, strict: true, schema: payload.schema } },
      }),
    });
    if (!response.ok) {
      // 오류 본문·헤더·요청 ID·원본 예외는 출력하거나 반환하지 않습니다.
      await response.body?.cancel();
      const code: ErrorCode = response.status === 401 ? 'OPENAI_AUTHENTICATION_FAILED'
        : response.status === 403 ? 'OPENAI_PERMISSION_DENIED'
        : response.status === 404 ? 'OPENAI_MODEL_UNAVAILABLE'
        : response.status === 429 ? 'OPENAI_RATE_LIMITED'
        : response.status >= 500 ? 'OPENAI_UPSTREAM_ERROR' : 'OPENAI_REQUEST_REJECTED';
      return result('error', code);
    }
    let raw: unknown;
    try { raw = await response.json(); }
    catch { return result('error', signal.aborted ? 'OPENAI_TIMEOUT' : 'OPENAI_INVALID_RESPONSE'); }
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) return result('error', 'OPENAI_INVALID_RESPONSE');
    if (parsed.data.usage) usage = { inputTokens: parsed.data.usage.input_tokens, outputTokens: parsed.data.usage.output_tokens };
    if (parsed.data.status !== 'completed') return result('error', 'OPENAI_INCOMPLETE_RESPONSE');
    const texts = parsed.data.output.filter(item => item.type === 'message')
      .flatMap(item => item.content ?? []);
    if (texts.length !== 1 || texts[0].type !== 'output_text' || !texts[0].text) return result('error', 'OPENAI_INVALID_RESPONSE');
    try { return { ...result('success'), value: JSON.parse(texts[0].text) }; }
    catch { return result('error', 'OPENAI_INVALID_RESPONSE'); }
  } catch {
    return result('error', signal.aborted ? 'OPENAI_TIMEOUT' : 'OPENAI_NETWORK_ERROR');
  }
}

/** 가상 기록 전용 연결 확인. 명시적 실행 전에는 네트워크를 사용하지 않습니다. */
export async function testOpenAIConnection(
  { execute = false }: { execute?: boolean } = {},
  dependencies: Parameters<typeof requestOpenAIJson>[1] = {},
): Promise<ConnectionResult> {
  if (!execute) return { status: 'not_run', model: CONNECTION_MODEL, errorCode: null };
  const response = await requestOpenAIJson({
    instructions: '연결 확인용 가상 기록입니다. 진단하거나 조언하지 말고 {"connection":"ok"}만 반환하세요.',
    input: JSON.stringify({ synthetic: true, answers: { sleep: 'low', energy: 'normal', meal: 'good', mood: 'low' },
      note: '가상 인물의 테스트 기록: 조금 피곤하지만 잠깐 쉬고 싶어요.', photoComment: '가상의 화분 사진을 떠올렸어요.' }),
    name: 'connection_check', maxOutputTokens: 512,
    schema: { type: 'object', additionalProperties: false, required: ['connection'], properties: { connection: { type: 'string', enum: ['ok'] } } },
  }, dependencies);
  if (response.status === 'success' && !z.object({ connection: z.literal('ok') }).strict().safeParse(response.value).success)
    return { status: 'error', model: CONNECTION_MODEL, errorCode: 'OPENAI_INVALID_RESPONSE' };
  return { status: response.status, model: response.model, errorCode: response.errorCode };
}
