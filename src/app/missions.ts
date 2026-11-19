import { appStorage } from './app-storage';
import { localDay } from './daily-checkin';

// Optional small missions done with the friend. Unlike the daily cares they grant nothing,
// never expire into "missed", and are never required, so they add play without pressure.
export const MISSIONS = [
  { id: 'tell-feeling', title: '친구에게 오늘 기분 말해 주기', copy: '정원에서 마이크를 눌러 한 문장만 들려줘도 충분해요.' },
  { id: 'pet-friend', title: '친구 쓰다듬어 주기', copy: '정원에서 친구를 손가락으로 살살 쓸어 주세요.' },
  { id: 'window-30', title: '창밖을 함께 30초 바라보기', copy: '눈에 들어오는 색 하나를 친구에게 알려 주세요.' },
  { id: 'stretch-together', title: '친구처럼 기지개 켜기', copy: '팔을 위로 쭉 뻗고 천천히 내려요.' },
  { id: 'water-sip', title: '친구와 물 한 모금', copy: '한 모금이면 돼요. 친구도 함께 마신다고 생각해요.' },
  { id: 'three-breaths', title: '친구와 숨 세 번 맞추기', copy: '친구가 숨 쉬는 속도에 맞춰 천천히 세 번 쉬어요.' },
  { id: 'name-good', title: '오늘 괜찮았던 일 하나 떠올리기', copy: '아주 작은 일이어도 친구는 기뻐해요.' },
  { id: 'tidy-one', title: '친구 자리 옆 물건 하나 정리하기', copy: '눈앞의 물건 하나만 제자리에 두어요.' },
  { id: 'sky-check', title: '오늘 하늘 색 알려 주기', copy: '창문이나 사진으로 하늘을 한 번 봐요.' },
  { id: 'kind-word', title: '나에게 다정한 말 한마디', copy: '친구가 해 줄 법한 말을 나에게 들려줘요.' },
  { id: 'music-one', title: '친구와 노래 한 곡 듣기', copy: '끝까지 듣지 않아도 괜찮아요.' },
  { id: 'goodnight', title: '자기 전 친구에게 인사하기', copy: '“오늘도 수고했어” 한마디면 충분해요.' },
] as const;
// Always offered on the care tab, next to the rotating three.
export const MINUTE_MISSIONS = [
  { id: 'heart-1min', kind: 'count', title: '1분 동안 심박수 세기', copy: '손목이나 목에 손가락을 대고, 1분 동안 뛰는 횟수를 세어요.', unit: '회/분', min: 30, max: 220 },
  { id: 'breath-1min', kind: 'count', title: '1분 동안 호흡수 세기', copy: '편하게 숨 쉬면서, 1분 동안 들이쉰 횟수를 세어요.', unit: '회/분', min: 3, max: 60 },
  { id: 'still-1min', kind: 'still', title: '1분 동안 아무것도 생각하지 않기', copy: '떠오르는 생각은 흘려보내요. 끝나면 가장 먼저 떠올랐던 것을 적어도 좋아요.' },
] as const;
export const HELLO_MISSION = { id: 'send-hello', title: '소중한 사람에게 안부 전하기', copy: '문자 앱이 문구를 채워서 열려요. 받는 사람은 직접 골라요. 보내지 않아도 괜찮아요.' } as const;
export const HELLO_TEMPLATES = ['잘 지내? 갑자기 생각나서 연락해 봤어.', '오늘 하루 어땠어? 나는 천천히 지내고 있어.', '요즘 날씨가 바뀌네. 감기 조심해!', '고마웠던 게 생각나서 연락했어. 늘 고마워.'] as const;

export type MissionId = typeof MISSIONS[number]['id'] | typeof MINUTE_MISSIONS[number]['id'] | typeof HELLO_MISSION.id;
const ALL_IDS: readonly string[] = [...MISSIONS, ...MINUTE_MISSIONS, HELLO_MISSION].map(m => m.id);
const isMissionId = (id: unknown): id is MissionId => typeof id === 'string' && ALL_IDS.includes(id);

/** Three missions per day, rotating so the same day always shows the same three. */
export function todaysMissions(date = localDay()) {
  let seed = 7;
  for (let i = 0; i < date.length; i++) seed = (seed * 31 + date.charCodeAt(i)) >>> 0;
  return [0, 1, 2].map(k => MISSIONS[(seed + k * 5) % MISSIONS.length]);
}

/** Self-counted values from the minute missions; a body check-in, not a medical measurement. */
export type MissionValues = { heart?: number; breath?: number; thought?: string };
export const MISSIONS_KEY = 'little-garden.missions.v1';
type MissionLog = { version: 1; done: Record<string, MissionId[]>; values: Record<string, MissionValues> };
const THOUGHT_MAX = 200;

function validValues(v: unknown): MissionValues {
  const out: MissionValues = {};
  if (!v || typeof v !== 'object') return out;
  const { heart, breath, thought } = v as MissionValues;
  if (Number.isInteger(heart) && heart! >= 30 && heart! <= 220) out.heart = heart;
  if (Number.isInteger(breath) && breath! >= 3 && breath! <= 60) out.breath = breath;
  if (typeof thought === 'string' && thought.trim()) out.thought = thought.slice(0, THOUGHT_MAX);
  return out;
}
export function readMissionLog(): MissionLog {
  try {
    const log = JSON.parse(appStorage.getItem(MISSIONS_KEY) ?? 'null') as MissionLog | null;
    if (log?.version !== 1 || !log.done || typeof log.done !== 'object') return { version: 1, done: {}, values: {} };
    const done = Object.fromEntries(Object.entries(log.done).filter(([, ids]) => Array.isArray(ids)).map(([d, ids]) => [d, ids.filter(isMissionId)]));
    const values = Object.fromEntries(Object.entries(log.values ?? {}).map(([d, v]) => [d, validValues(v)]).filter(([, v]) => Object.keys(v).length));
    return { version: 1, done, values };
  } catch { return { version: 1, done: {}, values: {} }; }
}
// Keep about a month; nothing older is ever shown.
const recent = <T,>(entries: Record<string, T>) => Object.fromEntries(Object.entries(entries).sort(([a], [b]) => b.localeCompare(a)).slice(0, 31));
function write(log: MissionLog) {
  appStorage.setItem(MISSIONS_KEY, JSON.stringify({ version: 1, done: recent(log.done), values: recent(log.values) }));
}

export function toggleMission(id: MissionId, date = localDay()) {
  if (!isMissionId(id)) throw new Error('알 수 없는 미션이에요.');
  const log = readMissionLog();
  const today = log.done[date] ?? [];
  log.done = { ...log.done, [date]: today.includes(id) ? today.filter(x => x !== id) : [...today, id] };
  write(log);
  return log.done[date] ?? [];
}
/** Saves a minute mission's result and marks it done. Out-of-range counts are refused, not clamped. */
export function saveMinuteMission(id: typeof MINUTE_MISSIONS[number]['id'], value: number | string, date = localDay()) {
  const log = readMissionLog();
  const values = { ...log.values[date] };
  if (id === 'still-1min') {
    if (typeof value === 'string' && value.trim()) values.thought = value.trim().slice(0, THOUGHT_MAX);
  } else {
    const spec = MINUTE_MISSIONS.find(m => m.id === id);
    if (spec?.kind !== 'count') throw new Error('알 수 없는 미션이에요.');
    if (!Number.isInteger(value) || (value as number) < spec.min || (value as number) > spec.max)
      throw new Error(`${spec.min}에서 ${spec.max} 사이의 숫자로 적어 주세요.`);
    values[id === 'heart-1min' ? 'heart' : 'breath'] = value as number;
  }
  const today = log.done[date] ?? [];
  log.done = { ...log.done, [date]: today.includes(id) ? today : [...today, id] };
  log.values = { ...log.values, [date]: values };
  write(log);
  return log;
}
