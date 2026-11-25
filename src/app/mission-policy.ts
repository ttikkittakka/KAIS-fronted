import type { AnswerValue } from './questions';
import { isLow, type MoodTag, type Outing } from './wellbeing';

export const RECOVERY_MISSIONS = [
  { id: 'water-sip', title: '물 몇 모금 마시기', detail: '물을 천천히 몇 모금 마셔요. 물컵을 사진으로 확인할 수도 있어요.', minutes: 1, setting: 'inside', icon: 'drop', camera: 'cup' },
  { id: 'window-30', title: '창가에서 바깥 보기', detail: '가까운 창가에서 눈에 들어오는 색 하나를 찾아요.', minutes: 1, setting: 'inside', icon: 'leaf' },
  { id: 'three-breaths', title: '2분 명상하기', detail: '편하게 앉아 숨이 들어오고 나가는 감각을 느껴요.', minutes: 2, setting: 'inside', icon: 'breathe' },
  { id: 'stretch-together', title: '두 팔 들어 기지개 켜기', detail: '편한 상태에서 두 팔을 들어 올렸다가 천천히 내려요.', minutes: 1, setting: 'inside', icon: 'wave', camera: 'arms' },
  { id: 'tidy-one', title: '눈앞의 물건 하나 정리하기', detail: '가까이 있는 물건 한 개만 제자리에 놓아요.', minutes: 2, setting: 'inside', icon: 'sparkle' },
  { id: 'porch-step', title: '현관 밖에 잠깐 서 보기', detail: '여유가 있다면 현관 앞까지 나가 한 번 숨을 골라요.', minutes: 3, setting: 'near', icon: 'walk' },
  { id: 'short-walk', title: '집 근처 5분 걷기', detail: '가까운 익숙한 길을 걷고 편한 지점에서 돌아와요.', minutes: 5, setting: 'near', icon: 'walk' },
  { id: 'outdoor-visit', title: '산책할 장소 한 곳 고르기', detail: '지도에서 한 곳을 보고, 마음이 가는 곳만 저장해요.', minutes: 2, setting: 'anywhere', icon: 'map' },
  { id: 'name-good', title: '긍정적인 단어 생각하기', detail: '온기, 여유처럼 오늘 마음에 두고 싶은 단어를 하나 떠올려요.', minutes: 2, setting: 'inside', icon: 'hug' },
  { id: 'send-hello', title: '생각나는 사람에게 안부 전하기', detail: '한 문장이면 충분해요. 보내는 건 직접 골라요.', minutes: 2, setting: 'anywhere', icon: 'chat' },
  { id: 'book-page', title: '책 한 페이지 펼치기', detail: '펼친 책이 사진의 가운데에 오게 찍어 봐요.', minutes: 2, setting: 'inside', icon: 'note', camera: 'book' },
  { id: 'meal-photo', title: '오늘 챙긴 한 끼 찍기', detail: '밥이나 음식이 눈에 잘 보이도록 찍어요.', minutes: 1, setting: 'inside', icon: 'snack', camera: 'meal' },
  { id: 'music-now', title: '지금 듣는 곡 남기기', detail: '제목과 재생 중 표시를 화면에 담아 올려요.', minutes: 1, setting: 'inside', icon: 'sing', camera: 'music' },
] as const;
export type RecoveryMission = typeof RECOVERY_MISSIONS[number];
export type RecoveryId = RecoveryMission['id'];
export const isRecoveryId = (id: unknown): id is RecoveryId => RECOVERY_MISSIONS.some(mission => mission.id === id);
export const PHOTO_RECOVERY_IDS: RecoveryId[] = RECOVERY_MISSIONS.flatMap(mission =>
  'camera' in mission && mission.camera !== 'arms' ? [mission.id] : []);
export const ADDITIONAL_CARE_IDS: RecoveryId[] = ['three-breaths', 'name-good', ...PHOTO_RECOVERY_IDS];

export const DAY_PARTS = ['morning', 'afternoon', 'evening'] as const;
export const MISSION_PACES = ['any', 'inside', 'outside'] as const;
export type MissionPace = typeof MISSION_PACES[number];
export type MissionInput = {
  answers: (AnswerValue | null)[];
  tags: MoodTag[];
  outing?: Outing;
  part: typeof DAY_PARTS[number];
  pace: MissionPace;
  recent: RecoveryId[];
  skipped: RecoveryId[];
};
export type MissionResult = { ids: RecoveryId[]; reason: string; source: 'ai' | 'rules' | 'offline' };

export function rankMissions({ answers, tags, outing, part, pace, recent, skipped }: MissionInput): MissionResult {
  const [sleep, energy, meal, mood] = answers;
  const gentle = isLow(energy) || isLow(sleep) || isLow(mood) || skipped.length > 0;
  const hasCheckin = answers.every(Boolean);
  const outdoors = (pace === 'outside' || (outing === 'inside' && hasCheckin)) && !gentle && part !== 'evening';
  const scores: Record<RecoveryId, number> = {
    'water-sip': isLow(meal) ? 15 : 7,
    'window-30': gentle ? 12 : 6,
    'three-breaths': gentle || tags.includes('걱정') || tags.includes('답답함') ? 14 : 5,
    'stretch-together': isLow(energy) ? 4 : 8,
    'tidy-one': pace === 'inside' ? 9 : 5,
    'porch-step': outdoors ? 13 : 0,
    'short-walk': outdoors && outing !== 'outside' ? 14 : -1,
    'outdoor-visit': pace === 'outside' ? 10 : 4,
    'name-good': part === 'evening' || gentle ? 10 : 5,
    'send-hello': tags.includes('외로움') && !gentle ? 10 : 3,
    'book-page': gentle ? 7 : 6,
    'meal-photo': hasCheckin && isLow(meal) ? 8 : 4,
    'music-now': isLow(mood) ? 7 : 5,
  };
  const ids = RECOVERY_MISSIONS.filter(mission => !skipped.includes(mission.id) &&
    (mission.setting !== 'near' || (hasCheckin && !gentle && pace !== 'inside' && part !== 'evening')))
    .map(mission => ({ id: mission.id, score: scores[mission.id] - (recent.includes(mission.id) ? 3 : 0) }))
    .sort((a, b) => b.score - a.score).map(item => item.id);
  const reason = skipped.length ? '조금 더 가볍게 시작할 수 있는 돌봄을 골랐어요.'
    : gentle ? '오늘 답해 준 상태에 맞춰 짧고 편한 돌봄을 골랐어요.'
    : outdoors ? '부담 없이 바깥을 둘러볼 수 있는 미션을 골랐어요.'
    : hasCheckin ? '오늘의 마음과 시간에 맞춘 작은 돌봄이에요.'
    : '일기를 남기면 오늘의 상태를 반영해 골라요.';
  return { ids, reason, source: 'rules' };
}

export type ContactTrend = { recent: number; previous: number };
export const hasContactDip = ({ recent, previous }: ContactTrend) => previous >= 3 && recent <= Math.floor(previous / 2);
