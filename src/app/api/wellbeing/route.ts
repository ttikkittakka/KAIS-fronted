import { z } from 'zod';
import { requestUser, privateJson, smallJson } from '../../../lib/request';
import { DAY_PARTS, MISSION_PACES, RECOVERY_MISSIONS, isRecoveryId, rankMissions, hasContactDip, type RecoveryId } from '../../mission-policy';
import { LEVELS, MOOD_TAGS, OUTINGS } from '../../wellbeing';

const ids = z.array(z.string().refine(isRecoveryId)).max(RECOVERY_MISSIONS.length);
const missionRequest = z.object({
  kind: z.literal('missions'),
  ai: z.boolean().optional(),
  answers: z.array(z.enum(LEVELS).nullable()).length(4),
  tags: z.array(z.enum(MOOD_TAGS as [typeof MOOD_TAGS[number], ...typeof MOOD_TAGS])).max(MOOD_TAGS.length),
  outing: z.enum(OUTINGS).optional(),
  part: z.enum(DAY_PARTS),
  pace: z.enum(MISSION_PACES),
  recent: ids,
  skipped: ids,
}).strict();
const connectionRequest = z.object({
  kind: z.literal('connection'),
  ai: z.boolean().optional(),
  recent: z.number().int().min(0).max(50),
  previous: z.number().int().min(0).max(50),
}).strict();

const limiter = new Map<string, number>();
async function modelText(request: Request, optedIn: boolean | undefined, system: string, prompt: string) {
  if (!optedIn || !process.env.ANTHROPIC_API_KEY) return null;
  const user = await requestUser(request);
  const now = Date.now();
  if (!user || (limiter.get(user.id) ?? 0) > now) return null;
  for (const [key, time] of limiter) if (time <= now) limiter.delete(key);
  if (limiter.size >= 500) return null;
  limiter.set(user.id, now + 45_000);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
        max_tokens: 96, system, messages: [{ role: 'user', content: prompt }],
      }),
      cache: 'no-store', signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) return null;
    const data = await response.json() as { stop_reason?: string; content?: { type: string; text?: string }[] };
    return data.stop_reason === 'end_turn' ? data.content?.find(item => item.type === 'text')?.text?.trim() ?? null : null;
  } catch { return null; }
}

export async function POST(request: Request) {
  const parsed = z.discriminatedUnion('kind', [missionRequest, connectionRequest]).safeParse(await smallJson(request));
  if (!parsed.success) return privateJson({ error: 'invalid-input' }, 400);
  const data = parsed.data;
  if (data.kind === 'connection') {
    if (!hasContactDip(data)) return privateJson({ suggest: false, source: 'rules' });
    const answer = await modelText(request, data.ai,
      '두 기간의 자기기록 연락 횟수만 비교합니다. 부담 없는 안부 제안을 보일지 suggest 또는 wait 하나만 출력합니다. 긴급도나 감정을 추정하지 않습니다.',
      JSON.stringify({ recent: data.recent, previous: data.previous }));
    return privateJson({ suggest: answer !== 'wait', source: answer === 'wait' || answer === 'suggest' ? 'ai' : 'rules' });
  }
  const input = { ...data, recent: data.recent as RecoveryId[], skipped: data.skipped as RecoveryId[] };
  const ranked = rankMissions(input);
  const fallback = { ...ranked, ids: ranked.ids.slice(0, 3) };
  if (!ranked.ids.length) return privateJson(fallback);
  const candidates = ranked.ids.slice(0, 6).map(id => RECOVERY_MISSIONS.find(mission => mission.id === id)!);
  const text = await modelText(request, data.ai,
    '자기보고 상태를 보고 아래 후보에서 부담이 가장 적은 미션을 1~3개 고릅니다. 후보 id만 순서대로 콤마로 구분해 출력합니다. 다른 행동과 설명은 출력하지 않습니다.',
    JSON.stringify({ answers: data.answers, tags: data.tags, outing: data.outing, part: data.part, pace: data.pace, recent: data.recent, candidates: candidates.map(({ id, title, minutes }) => ({ id, title, minutes })) }));
  const picked = text?.split(',').map(id => id.trim());
  if (picked?.length && picked.length <= 3 && new Set(picked).size === picked.length && picked.every(id => candidates.some(m => m.id === id))) {
    return privateJson({ ...fallback, ids: picked, source: 'ai' });
  }
  return privateJson(fallback);
}
