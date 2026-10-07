// src/modules/quest/questpolicy.ts

export interface Quest {
  id: string;
  title: string;
  instruction: string;
  category: 'hydration' | 'environment' | 'movement' | 'breathing' | 'connection';
  difficulty: 1 | 2 | 3;
  minutes: number;
  indoor: boolean;
}

// 1. 검토된 행동 화이트리스트 카탈로그
// difficulty 1 = 컨디션이 안 좋을 때도 부담 없는 행동, 3 = 컨디션이 좋을 때 시도할 만한 활동적인 행동
export const QUEST_CATALOG: Quest[] = [
  // 수분 섭취
  { id: 'q_water', title: '물 한 모금 마시기', instruction: '시원한 물을 한 모금 천천히 마십니다.', category: 'hydration', difficulty: 1, minutes: 0.5, indoor: true },
  { id: 'q_water_full', title: '물 한 잔 가득 마시기', instruction: '컵에 물을 가득 채워 천천히 한 잔을 다 마셔봅니다.', category: 'hydration', difficulty: 2, minutes: 2, indoor: true },
  { id: 'q_tea', title: '따뜻한 차 한 잔 준비하기', instruction: '좋아하는 차나 음료를 직접 우려서 준비해봅니다.', category: 'hydration', difficulty: 2, minutes: 5, indoor: true },

  // 호흡/이완
  { id: 'q_deep_breath', title: '심호흡 세 번 하기', instruction: '숨을 깊게 마시고 천천히 내쉬는 동작을 3회 반복합니다.', category: 'breathing', difficulty: 1, minutes: 1, indoor: true },
  { id: 'q_breathing_478', title: '4-7-8 호흡법 해보기', instruction: '4초 들이쉬고 7초 참았다가 8초간 천천히 내쉬는 것을 3회 반복합니다.', category: 'breathing', difficulty: 2, minutes: 3, indoor: true },

  // 주변 정리/환경
  { id: 'q_tidy_one', title: '물건 하나 제자리 두기', instruction: '눈에 보이는 작은 물건 하나를 제자리에 둡니다.', category: 'environment', difficulty: 1, minutes: 2, indoor: true },
  { id: 'q_window_view', title: '바깥 풍경 30초 바라보기', instruction: '창문 밖을 향해 서서 먼 곳을 30초간 바라봅니다.', category: 'environment', difficulty: 1, minutes: 0.5, indoor: true },
  { id: 'q_open_window', title: '창문 열고 환기하기', instruction: '창문을 열어 신선한 공기를 2분 정도 들여봅니다.', category: 'environment', difficulty: 2, minutes: 2, indoor: true },
  { id: 'q_tidy_desk', title: '책상 위 정리하기', instruction: '책상이나 주변 공간을 3분 동안 가볍게 정리합니다.', category: 'environment', difficulty: 2, minutes: 3, indoor: true },

  // 움직임
  { id: 'q_shoulder', title: '어깨 천천히 움직이기', instruction: '창문 근처나 자리에서 어깨를 천천히 세 번 돌려줍니다.', category: 'movement', difficulty: 1, minutes: 1, indoor: true },
  { id: 'q_stretch', title: '가벼운 전신 스트레칭 하기', instruction: '팔다리를 천천히 늘리며 3분간 스트레칭합니다.', category: 'movement', difficulty: 2, minutes: 3, indoor: true },
  { id: 'q_short_walk', title: '집 근처 5분 산책하기', instruction: '가벼운 옷차림으로 집 근처를 5분간 걸어봅니다.', category: 'movement', difficulty: 2, minutes: 5, indoor: false },
  { id: 'q_brisk_walk', title: '동네 한 바퀴 활기차게 걷기', instruction: '평소보다 조금 빠른 걸음으로 동네를 15분간 걸어봅니다.', category: 'movement', difficulty: 3, minutes: 15, indoor: false },
  { id: 'q_home_workout', title: '집에서 가벼운 운동 하기', instruction: '스쿼트나 제자리 걷기를 5분간 가볍게 해봅니다.', category: 'movement', difficulty: 3, minutes: 5, indoor: true },

  // 관계/연결
  { id: 'q_gratitude', title: '고마웠던 순간 떠올리기', instruction: '오늘 하루 중 고마웠던 순간을 한 가지 떠올려봅니다.', category: 'connection', difficulty: 1, minutes: 1, indoor: true },
  { id: 'q_text_friend', title: '안부 문자 보내기', instruction: '좋아하는 사람에게 짧은 안부 문자를 보내봅니다.', category: 'connection', difficulty: 2, minutes: 3, indoor: true },
  { id: 'q_call_friend', title: '가까운 사람에게 전화하기', instruction: '가까운 사람에게 전화를 걸어 안부를 물어봅니다.', category: 'connection', difficulty: 3, minutes: 10, indoor: true }
];

interface SelectOptions {
  mood?: number;
  energy?: number;
  canGoOut?: boolean;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 컨디션(기분/에너지)에 따라 추천할 난이도 범위를 정한다.
// 상태가 안 좋을수록 쉬운 행동 위주로, 좋을수록 좀 더 활동적인 행동을 섞는다.
function getAllowedDifficulties(mood?: number, energy?: number): Array<1 | 2 | 3> {
  const isLow = (energy !== undefined && energy <= 2) || (mood !== undefined && mood <= 2);
  const isHigh = (energy !== undefined && energy >= 4) && (mood !== undefined && mood >= 4);

  if (isLow) return [1];
  if (isHigh) return [2, 3];
  return [1, 2];
}

// 2. 컨디션 기반 추천 규칙 엔진 (매번 같은 조합이 나오지 않도록 후보 내에서 무작위로 섞는다)
export function selectQuests(options: SelectOptions): Quest[] {
  let candidates = [...QUEST_CATALOG];

  // 외출 불가능 시 실외 행동 제외
  if (options.canGoOut === false) {
    candidates = candidates.filter(q => q.indoor);
  }

  const allowedDifficulties = getAllowedDifficulties(options.mood, options.energy);
  let scoped = candidates.filter(q => allowedDifficulties.includes(q.difficulty));

  // 난이도 제한 후 후보가 너무 적으면(카테고리 커버 불가) 전체 후보로 완화
  if (scoped.length < 3) {
    scoped = candidates;
  }

  const shuffled = shuffle(scoped);

  // 서로 다른 카테고리 위주로 최대 3개 선택
  const selected: Quest[] = [];
  const usedCategories = new Set<string>();

  for (const quest of shuffled) {
    if (!usedCategories.has(quest.category)) {
      selected.push(quest);
      usedCategories.add(quest.category);
    }
    if (selected.length === 3) break;
  }

  // 범주 중복을 고려해도 3개가 안 채워지면 남은 후보에서 무작위로 추가
  if (selected.length < 3) {
    for (const quest of shuffled) {
      if (!selected.some(s => s.id === quest.id)) {
        selected.push(quest);
      }
      if (selected.length === 3) break;
    }
  }

  return selected;
}
