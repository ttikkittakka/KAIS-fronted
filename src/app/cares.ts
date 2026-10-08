export type CareTag = 'general' | 'low_energy' | 'low_sleep' | 'low_meal' | 'low_mood' | 'comfortable';
export type Care = {
  id: string;
  category: 'body' | 'rest' | 'environment' | 'movement' | 'mind' | 'comfort' | 'connection' | 'routine' | 'sensory' | 'nature';
  effort: 'minimal' | 'gentle' | 'active';
  tags: readonly CareTag[];
  icon: 'drop' | 'cloud' | 'walk' | 'leaf';
  // Reuse existing icon color styles independently of the care ID.
  tone: 'water' | 'sky' | 'walk';
  title: string; copy: string; meta: string;
};

export const CARES = [
  { id: 'water', effort: 'minimal', tags: ['low_energy', 'low_meal', 'general'], category: 'body', icon: 'drop', tone: 'water', title: '물 몇 모금', copy: '한 컵을 다 마시지 않아도 괜찮아요.', meta: '1분 · 아주 쉬움' },
  { id: 'snack', effort: 'gentle', tags: ['low_meal'], category: 'body', icon: 'leaf', tone: 'walk', title: '간단한 것 하나 먹기', copy: '바나나, 요거트처럼 손에 잡히는 것부터.', meta: '3분 · 쉬움' },
  { id: 'rest', effort: 'minimal', tags: ['low_sleep', 'low_energy', 'low_mood', 'general'], category: 'rest', icon: 'cloud', tone: 'sky', title: '3분만 눈 감기', copy: '아무것도 하지 않고 잠깐 쉬어도 좋아요.', meta: '3분 · 아주 쉬움' },
  { id: 'window', effort: 'gentle', tags: ['low_energy', 'low_mood', 'general'], category: 'environment', icon: 'cloud', tone: 'sky', title: '창문 열기', copy: '잠깐 바깥 공기를 느껴봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'sky', effort: 'minimal', tags: ['low_energy', 'low_mood', 'general'], category: 'environment', icon: 'cloud', tone: 'sky', title: '하늘 바라보기', copy: '창문 너머 하늘을 잠깐 바라봐요.', meta: '2분 · 아주 쉬움' },
  { id: 'stretch', effort: 'gentle', tags: ['low_energy', 'general'], category: 'body', icon: 'walk', tone: 'water', title: '몸 한 번 펴기', copy: '어깨와 목을 천천히 움직여봐요.', meta: '2분 · 아주 쉬움' },
  { id: 'walk', effort: 'active', tags: ['comfortable'], category: 'movement', icon: 'walk', tone: 'walk', title: '5분 걷기', copy: '멀리 가지 않아도 괜찮아요.', meta: '5분 · 쉬움' },
  { id: 'music', effort: 'minimal', tags: ['low_energy', 'low_mood', 'general'], category: 'mind', icon: 'leaf', tone: 'sky', title: '좋아하는 노래 한 곡', copy: '아무것도 하지 않고 음악만 들어도 좋아요.', meta: '3분 · 아주 쉬움' },
  { id: 'warm-drink', effort: 'gentle', tags: ['low_sleep', 'low_meal', 'low_mood', 'general'], category: 'comfort', icon: 'drop', tone: 'walk', title: '따뜻한 음료 마시기', copy: '잠깐 손에 따뜻함을 느껴봐요.', meta: '5분 · 쉬움' },
  { id: 'wash', effort: 'gentle', tags: ['general'], category: 'body', icon: 'drop', tone: 'water', title: '얼굴 씻기', copy: '편안한 온도의 물로 천천히 씻어봐요.', meta: '2분 · 아주 쉬움' },
  { id: 'shoulders', effort: 'minimal', tags: ['low_sleep', 'low_energy', 'low_mood', 'general'], category: 'rest', icon: 'cloud', tone: 'sky', title: '어깨 내려놓기', copy: '숨을 내쉬면서 어깨에 힘을 조금 풀어봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'sunlight', effort: 'minimal', tags: ['low_sleep', 'low_energy', 'general'], category: 'environment', icon: 'leaf', tone: 'walk', title: '햇빛 잠깐 받기', copy: '창가에 잠깐 앉아 있어도 괜찮아요.', meta: '3분 · 아주 쉬움' },
  { id: 'favorite', effort: 'minimal', tags: ['low_mood', 'low_energy', 'general'], category: 'mind', icon: 'leaf', tone: 'sky', title: '좋아하는 것 하나 바라보기', copy: '눈에 들어오는 좋아하는 물건을 잠깐 바라봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'wash-hands', effort: 'gentle', tags: ['general'], category: 'body', icon: 'drop', tone: 'water', title: '손 씻기', copy: '편안한 온도의 물로 손을 천천히 씻어봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'brush', effort: 'gentle', tags: ['general'], category: 'routine', icon: 'leaf', tone: 'water', title: '양치하기', copy: '입안을 가볍게 개운하게 해볼까요?', meta: '3분 · 쉬움' },
  { id: 'breathe', effort: 'minimal', tags: ['low_energy', 'low_mood', 'general'], category: 'rest', icon: 'cloud', tone: 'sky', title: '천천히 숨 내쉬기', copy: '편한 자세에서 숨을 한 번 천천히 내쉬어봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'lean', effort: 'minimal', tags: ['low_sleep', 'low_energy', 'general'], category: 'rest', icon: 'cloud', tone: 'sky', title: '잠깐 기대기', copy: '등을 편하게 기대고 잠시 쉬어도 좋아요.', meta: '2분 · 아주 쉬움' },
  { id: 'pause', effort: 'minimal', tags: ['low_sleep', 'low_energy', 'low_mood', 'general'], category: 'rest', icon: 'cloud', tone: 'sky', title: '아무것도 하지 않고 2분', copy: '무언가를 하지 않는 시간도 괜찮아요.', meta: '2분 · 아주 쉬움' },
  { id: 'phone-down', effort: 'minimal', tags: ['low_sleep', 'low_mood', 'general'], category: 'routine', icon: 'leaf', tone: 'sky', title: '휴대폰 잠깐 내려놓기', copy: '화면을 뒤집어두고 잠시 눈을 쉬어봐요.', meta: '3분 · 아주 쉬움' },
  { id: 'dim-light', effort: 'minimal', tags: ['low_sleep', 'low_energy'], category: 'environment', icon: 'cloud', tone: 'sky', title: '조명을 조금 낮추기', copy: '편안하게 느껴지는 밝기를 찾아봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'neck', effort: 'gentle', tags: ['low_energy', 'general'], category: 'movement', icon: 'walk', tone: 'water', title: '목 천천히 움직이기', copy: '편안한 만큼만 좌우로 움직여봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'shoulder-roll', effort: 'gentle', tags: ['low_energy', 'general'], category: 'movement', icon: 'walk', tone: 'water', title: '어깨 한 번 돌리기', copy: '크게 움직이지 않아도 괜찮아요.', meta: '1분 · 아주 쉬움' },
  { id: 'stand', effort: 'gentle', tags: ['general', 'comfortable'], category: 'movement', icon: 'walk', tone: 'walk', title: '자리에서 한 번 일어나기', copy: '괜찮다면 잠깐 일어났다가 앉아봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'short-walk', effort: 'active', tags: ['comfortable'], category: 'movement', icon: 'walk', tone: 'walk', title: '2분만 걷기', copy: '가까운 곳까지 가볍게 다녀와도 좋아요.', meta: '2분 · 쉬움' },
  { id: 'curtain', effort: 'gentle', tags: ['low_sleep', 'general'], category: 'environment', icon: 'leaf', tone: 'walk', title: '커튼 조금 열기', copy: '바깥의 빛을 잠깐 들여봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'tidy', effort: 'gentle', tags: ['general', 'comfortable'], category: 'routine', icon: 'leaf', tone: 'walk', title: '물건 하나만 제자리로', copy: '책상 전체를 정리하지 않아도 괜찮아요.', meta: '1분 · 아주 쉬움' },
  { id: 'mood-word', effort: 'minimal', tags: ['low_mood', 'general'], category: 'mind', icon: 'leaf', tone: 'sky', title: '기분 한 단어 적기', copy: '떠오르는 말 하나만 적어도 좋아요.', meta: '1분 · 아주 쉬움' },
  { id: 'blanket', effort: 'minimal', tags: ['low_energy', 'low_sleep', 'low_mood', 'general'], category: 'comfort', icon: 'cloud', tone: 'sky', title: '포근한 이불에 기대기', copy: '익숙한 포근함을 잠깐 느껴봐요.', meta: '2분 · 아주 쉬움' },
  { id: 'texture', effort: 'minimal', tags: ['low_energy', 'low_mood', 'general'], category: 'sensory', icon: 'leaf', tone: 'water', title: '부드러운 촉감 느끼기', copy: '가까이 있는 옷이나 담요를 살짝 만져봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'leaf-view', effort: 'minimal', tags: ['low_energy', 'low_mood', 'general'], category: 'nature', icon: 'leaf', tone: 'walk', title: '초록빛 잠깐 바라보기', copy: '창밖 나무나 가까운 식물에 눈길을 줘봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'hello', effort: 'gentle', tags: ['comfortable'], category: 'connection', icon: 'leaf', tone: 'walk', title: '짧은 안부 보내기', copy: '연락하고 싶은 사람이 있다면 한마디만 보내봐요.', meta: '2분 · 쉬움' },
  { id: 'emoji', effort: 'gentle', tags: ['comfortable'], category: 'connection', icon: 'leaf', tone: 'sky', title: '이모지 하나 보내기', copy: '떠오르는 사람이 있다면 가벼운 인사를 건네봐요.', meta: '1분 · 쉬움' },
] as const satisfies readonly Care[];

export type CareId = typeof CARES[number]['id'];
export function isCareId(id: unknown): id is CareId {
  return typeof id === 'string' && CARES.some(care => care.id === id);
}
