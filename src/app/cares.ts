import { LEGACY_CARES } from './legacy-cares';
export { LEGACY_CARES } from './legacy-cares';
export type CareTag = 'general' | 'low_energy' | 'low_sleep' | 'low_meal' | 'low_mood' | 'comfortable';
export const CARE_CATEGORIES = { body: '몸 돌보기', rest: '마음 쉬어가기', understanding: '나를 이해하기', change: '일상에 작은 변화', connection: '세상과 연결되기' } as const;
export type Care = {
  id: string; category: string; title: string; copy: string; meta: string;
  effort: 'minimal' | 'gentle' | 'active'; tags: readonly CareTag[];
  icon: 'drop' | 'cloud' | 'walk' | 'leaf'; tone: 'water' | 'sky' | 'walk';
  active: boolean; minutes?: number; instruction?: string; helper?: string; example?: string;
  similarity?: string; weights?: Partial<Record<CareTag, number>>; comfortableOnly?: boolean;
};
// Catalog v2 is immutable once published; bump the saved catalog version for future wording changes.
const DEFINITIONS = [
  {
    "id": "water",
    "category": "body",
    "title": "물 몇 모금",
    "minutes": 1,
    "effort": "minimal",
    "copy": "한 컵을 다 마시지 않아도 괜찮아요.",
    "instruction": "마실 물이 있다면 편한 만큼 몇 모금 마셔볼까요?",
    "helper": "지금 마시기 어렵다면 건너뛰어도 괜찮아요.",
    "similarity": "drink",
    "weights": {
      "low_energy": 5,
      "low_meal": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "snack",
    "category": "body",
    "title": "간단한 것 하나 먹기",
    "minutes": 3,
    "effort": "gentle",
    "copy": "먹을 수 있는 상황이라면 작은 것부터.",
    "instruction": "지금 먹을 수 있고 나에게 맞는 간단한 음식을 하나 골라볼까요?",
    "helper": "음식이 없거나 먹기 어렵다면 다른 돌봄을 골라도 괜찮아요.",
    "similarity": "food",
    "weights": {
      "low_meal": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "rest",
    "category": "body",
    "title": "3분만 눈 감기",
    "minutes": 3,
    "effort": "minimal",
    "copy": "잠들지 않고 잠깐 쉬어도 좋아요.",
    "instruction": "안전하고 편안한 자리에서 잠시 눈을 쉬게 해볼까요?",
    "helper": "눈 감기가 불편하면 뜬 채 쉬거나 건너뛰어도 괜찮아요.",
    "similarity": "pause",
    "weights": {
      "low_sleep": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "comfortable-lean",
    "category": "body",
    "title": "편안한 곳에 기대기",
    "minutes": 2,
    "effort": "minimal",
    "copy": "나에게 편한 자세로 잠깐 쉬어요.",
    "instruction": "몸을 지지해 주는 안전한 곳에 편하게 기대어볼까요?",
    "helper": "기대는 자세가 불편하면 지금 자세 그대로 쉬어도 좋아요.",
    "similarity": "pause",
    "weights": {
      "low_sleep": 5,
      "low_energy": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "easy-drink",
    "category": "body",
    "title": "마시기 편한 음료 천천히 즐기기",
    "minutes": 3,
    "effort": "gentle",
    "copy": "편하게 마실 수 있는 음료가 있다면.",
    "instruction": "나에게 맞는 음료를 골라 편한 속도로 조금 마셔볼까요?",
    "helper": "준비하기 어렵거나 마시고 싶지 않으면 건너뛰어도 좋아요.",
    "similarity": "drink",
    "weights": {},
    "comfortableOnly": false
  },
  {
    "id": "body-need",
    "category": "body",
    "title": "내 몸에 필요한 것 하나 떠올리기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "몸이 바라는 것을 가볍게 떠올려요.",
    "instruction": "지금 내 몸에 필요한 것이 무엇인지 하나 떠올려볼까요?",
    "helper": "잘 모르겠어도 괜찮고, 바로 행동으로 옮기지 않아도 좋아요.",
    "similarity": "needs",
    "weights": {
      "low_energy": 5,
      "low_meal": 5
    },
    "example": "물 한 모금, 편한 자세, 잠깐의 쉼",
    "comfortableOnly": false
  },
  {
    "id": "breathe",
    "category": "rest",
    "title": "천천히 숨 내쉬기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "편안한 만큼만 숨을 내쉬어요.",
    "instruction": "편한 자세에서 평소처럼 숨을 쉬다가 한 번 천천히 내쉬어볼까요?",
    "helper": "호흡에 집중하는 것이 불편하면 멈추고 다른 돌봄을 골라도 괜찮아요.",
    "similarity": "breath",
    "weights": {
      "low_sleep": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "pause",
    "category": "rest",
    "title": "아무것도 하지 않고 2분",
    "minutes": 2,
    "effort": "minimal",
    "copy": "잠깐 멈춰 있는 시간도 괜찮아요.",
    "instruction": "안전한 자리에서 하던 일을 잠시 내려놓아볼까요?",
    "helper": "시간을 꼭 채우지 않아도 괜찮아요.",
    "similarity": "pause",
    "weights": {
      "low_sleep": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "music",
    "category": "rest",
    "title": "좋아하는 노래 한 곡",
    "minutes": 3,
    "effort": "minimal",
    "copy": "듣고 싶은 소리에 잠깐 머물러요.",
    "instruction": "지금 듣고 싶은 노래가 있다면 편안한 크기로 틀어볼까요?",
    "helper": "끝까지 듣지 않거나 조용히 쉬는 쪽을 골라도 좋아요.",
    "similarity": "sound",
    "weights": {
      "low_energy": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "phone-down",
    "category": "rest",
    "title": "휴대폰 잠깐 내려놓기",
    "minutes": 3,
    "effort": "minimal",
    "copy": "화면에서 잠시 눈을 쉬어봐요.",
    "instruction": "필요한 연락을 기다리는 중이 아니라면 휴대폰을 잠깐 내려놓아볼까요?",
    "helper": "내려놓기 어려운 상황이면 건너뛰어도 괜찮아요.",
    "similarity": "screen",
    "weights": {
      "low_sleep": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "texture",
    "category": "rest",
    "title": "부드러운 촉감 느끼기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "가까운 물건의 촉감을 살짝 느껴봐요.",
    "instruction": "만져도 괜찮은 옷이나 담요의 촉감을 잠깐 느껴볼까요?",
    "helper": "촉감에 집중하는 것이 불편하면 만지지 않아도 괜찮아요.",
    "similarity": "sensory",
    "weights": {
      "low_mood": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "three-sounds",
    "category": "rest",
    "title": "지금 들리는 소리 세 가지 찾기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "주변 소리를 가볍게 알아차려요.",
    "instruction": "지금 들리는 소리를 하나씩, 세 가지까지 찾아볼까요?",
    "helper": "하나만 찾아도 좋아요. 소리가 들리지 않거나 불편하면 건너뛰어도 괜찮아요.",
    "similarity": "sound",
    "weights": {
      "low_mood": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "mood-word",
    "category": "understanding",
    "title": "기분 한 단어 적기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "떠오르는 말 하나면 충분해요.",
    "instruction": "종이나 메모에 지금의 기분과 가까운 단어를 하나 적어볼까요?",
    "helper": "이름 붙이기 어렵다면 모르겠다고 적거나 생각만 해도 좋아요.",
    "similarity": "expression",
    "weights": {},
    "comfortableOnly": false
  },
  {
    "id": "choose-need",
    "category": "understanding",
    "title": "지금 필요한 것 하나 골라보기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "지금 나에게 필요한 것을 살펴봐요.",
    "instruction": "지금 나에게 가장 필요한 것이 무엇인지 생각해 봐요.",
    "helper": "정답은 없어요. 지금의 마음에 가까운 것을 골라보세요.",
    "similarity": "needs",
    "weights": {
      "low_energy": 5,
      "low_meal": 5,
      "low_mood": 5
    },
    "example": "휴식, 음식이나 물, 혼자만의 시간, 누군가의 도움",
    "comfortableOnly": false
  },
  {
    "id": "kind-word",
    "category": "understanding",
    "title": "나에게 다정한 한마디",
    "minutes": 1,
    "effort": "minimal",
    "copy": "나에게 따뜻한 말을 건네봐요.",
    "instruction": "오늘 하루를 보낸 나에게 따뜻한 말을 건네볼까요?",
    "helper": "말이 떠오르지 않으면 마음속으로 생각하는 것만으로도 괜찮아요.",
    "similarity": "kindness",
    "weights": {
      "low_mood": 5
    },
    "example": "지금도 충분히 애쓰고 있어.",
    "comfortableOnly": false
  },
  {
    "id": "okay-moment",
    "category": "understanding",
    "title": "오늘 괜찮았던 순간 떠올리기",
    "minutes": 2,
    "effort": "minimal",
    "copy": "아주 잠깐의 순간이어도 좋아요.",
    "instruction": "오늘 조금 편했거나 괜찮았던 순간이 있었는지 떠올려볼까요?",
    "helper": "떠오르지 않는 날도 괜찮아요. 좋은 일을 억지로 찾지 않아도 돼요.",
    "similarity": "memory",
    "weights": {
      "comfortable": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "accept-reluctance",
    "category": "understanding",
    "title": "하기 싫은 마음도 인정하기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "하기 싫은 마음도 내 마음이에요.",
    "instruction": "지금 무언가 하기 싫은 마음이 있다면, 그 마음을 잠시 알아차려 봐요.",
    "helper": "언제나 의욕적일 필요는 없어요.",
    "similarity": "kindness",
    "weights": {
      "low_mood": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "self-question",
    "category": "understanding",
    "title": "지금의 나에게 질문 하나",
    "minutes": 2,
    "effort": "minimal",
    "copy": "답을 서두르지 않아도 좋아요.",
    "instruction": "지금의 나에게 묻고 싶은 질문 하나를 조용히 떠올려볼까요?",
    "helper": "답이 없거나 생각이 불편해지면 여기서 멈춰도 괜찮아요.",
    "similarity": "reflection",
    "weights": {},
    "example": "지금 나는 무엇을 덜어내고 싶을까?",
    "comfortableOnly": false
  },
  {
    "id": "sky",
    "category": "change",
    "title": "하늘 바라보기",
    "minutes": 2,
    "effort": "minimal",
    "copy": "창문 너머 하늘도 좋아요.",
    "instruction": "안전한 자리에서 하늘빛이나 구름을 잠깐 바라볼까요?",
    "helper": "하늘이 보이지 않거나 바라보기 어렵다면 건너뛰어도 좋아요.",
    "similarity": "view",
    "weights": {
      "comfortable": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "stretch",
    "category": "change",
    "title": "몸 한 번 펴기",
    "minutes": 2,
    "effort": "gentle",
    "copy": "편안한 범위에서만 움직여요.",
    "instruction": "지금 자세에서 몸을 편안한 만큼 천천히 펴볼까요?",
    "helper": "움직임이 불편하거나 아프면 멈추고 쉬어도 괜찮아요.",
    "similarity": "movement",
    "weights": {},
    "comfortableOnly": false
  },
  {
    "id": "shoulders",
    "category": "change",
    "title": "어깨 내려놓기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "힘을 조금 풀 수 있다면.",
    "instruction": "어깨에 힘이 들어가 있는지 살피고 편한 만큼 내려놓아볼까요?",
    "helper": "움직이기 불편하면 지금 자세 그대로 있어도 괜찮아요.",
    "similarity": "movement",
    "weights": {},
    "comfortableOnly": false
  },
  {
    "id": "tidy",
    "category": "change",
    "title": "물건 하나만 제자리로",
    "minutes": 1,
    "effort": "gentle",
    "copy": "전체를 정리하지 않아도 괜찮아요.",
    "instruction": "손이 닿는 곳에 있는 물건 하나를 두고 싶은 자리에 놓아볼까요?",
    "helper": "지금 그대로 두어도 괜찮아요.",
    "similarity": "environment",
    "weights": {},
    "comfortableOnly": false
  },
  {
    "id": "light-air",
    "category": "change",
    "title": "빛과 공기 느끼기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "주변의 빛이나 공기를 잠깐 살펴요.",
    "instruction": "안전한 자리에서 주변의 밝기나 공기의 느낌을 잠깐 알아차려볼까요?",
    "helper": "창문을 열거나 밖으로 나갈 필요는 없어요. 감각에 집중하기 불편하면 건너뛰어요.",
    "similarity": "sensory",
    "weights": {
      "comfortable": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "gentle-move",
    "category": "change",
    "title": "잠깐 걷거나 몸 움직이기",
    "minutes": 2,
    "effort": "active",
    "copy": "내 몸에 맞는 움직임 하나면 좋아요.",
    "instruction": "움직이고 싶다면 안전한 곳에서 조금 걷거나 편한 동작을 해볼까요?",
    "helper": "서거나 걷지 않아도 괜찮아요. 불편하거나 아프면 멈추고 쉬어요.",
    "similarity": "movement",
    "weights": {
      "comfortable": 5
    },
    "comfortableOnly": true
  },
  {
    "id": "favorite",
    "category": "connection",
    "title": "좋아하는 것 하나 바라보기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "좋아하는 것에 잠깐 눈길을 줘요.",
    "instruction": "가까이 있는 좋아하는 물건이나 그림을 잠깐 바라볼까요?",
    "helper": "지금 떠오르는 것이 없어도 괜찮아요.",
    "similarity": "view",
    "weights": {
      "comfortable": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "hello",
    "category": "connection",
    "title": "짧은 안부 보내기",
    "minutes": 2,
    "effort": "gentle",
    "copy": "연락하고 싶은 사람이 있다면.",
    "instruction": "안심하고 연락할 수 있는 사람에게 짧은 안부를 건네볼까요?",
    "helper": "보내지 않거나 답장을 기다리지 않아도 괜찮아요.",
    "similarity": "contact",
    "weights": {
      "comfortable": 5
    },
    "comfortableOnly": true
  },
  {
    "id": "grateful-person",
    "category": "connection",
    "title": "고마운 사람 한 명 떠올리기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "마음에 떠오르는 사람이 있다면.",
    "instruction": "작은 도움이나 함께한 시간이 떠오르는 사람을 생각해볼까요?",
    "helper": "억지로 고마움을 느낄 필요는 없고, 연락하지 않아도 괜찮아요.",
    "similarity": "memory",
    "weights": {},
    "comfortableOnly": false
  },
  {
    "id": "safe-place",
    "category": "connection",
    "title": "안심되는 장소 떠올리기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "조금 편하게 느껴지는 곳을 생각해요.",
    "instruction": "실제 장소나 상상 속에서 안심되는 곳을 잠깐 떠올려볼까요?",
    "helper": "떠오르지 않거나 생각이 불편하면 다른 돌봄을 골라도 괜찮아요.",
    "similarity": "comfort",
    "weights": {
      "low_mood": 5
    },
    "comfortableOnly": false
  },
  {
    "id": "favorite-note",
    "category": "connection",
    "title": "내가 좋아하는 것 하나 적기",
    "minutes": 1,
    "effort": "minimal",
    "copy": "취향에는 정답이 없어요.",
    "instruction": "종이나 메모에 내가 좋아하는 것을 하나 적어볼까요?",
    "helper": "크고 특별한 것이 아니어도, 머릿속으로만 생각해도 좋아요.",
    "similarity": "expression",
    "weights": {},
    "comfortableOnly": false
  },
  {
    "id": "ask-help",
    "category": "connection",
    "title": "누군가에게 도움 요청하는 말 생각하기",
    "minutes": 2,
    "effort": "minimal",
    "copy": "도움이 필요할 때 쓸 말을 떠올려요.",
    "instruction": "도움이 필요한 순간에 사용할 수 있는 말을 하나 떠올려 봐요.",
    "helper": "지금 당장 누군가에게 보내지 않아도 괜찮아요.",
    "similarity": "contact",
    "weights": {},
    "example": "요즘 조금 힘든데, 내 이야기 들어줄 수 있어?",
    "comfortableOnly": false
  }
] as const;
export type CareId = typeof DEFINITIONS[number]['id'] | typeof LEGACY_CARES[number]['id'];
const appearance = { body: ['drop','water'], rest: ['cloud','sky'], understanding: ['leaf','sky'], change: ['walk','walk'], connection: ['leaf','walk'] } as const;
export const ACTIVE_CARES: Care[] = DEFINITIONS.map(care => ({ ...care, active: true,
  tags: ['general', ...Object.keys(care.weights)] as CareTag[],
  icon: LEGACY_CARES.find(old => old.id === care.id)?.icon ?? appearance[care.category][0],
  tone: LEGACY_CARES.find(old => old.id === care.id)?.tone ?? appearance[care.category][1],
  meta: care.minutes + '분 · ' + (care.effort === 'minimal' ? '아주 쉬움' : '쉬움'),
}));
// All historical IDs remain valid for stored completion and rewards.
export const CARES: Care[] = [...ACTIVE_CARES, ...LEGACY_CARES.filter(old => !ACTIVE_CARES.some(care => care.id === old.id)).map(old => ({ ...old, active: false }))];
export function isCareId(id: unknown): id is CareId { return typeof id === 'string' && CARES.some(care => care.id === id); }
