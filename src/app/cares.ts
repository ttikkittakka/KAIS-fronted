type Care = {
  id: string;
  category: 'body' | 'rest' | 'environment' | 'movement' | 'mind' | 'comfort';
  icon: 'drop' | 'cloud' | 'walk' | 'leaf';
  // Reuse existing icon color styles independently of the care ID.
  tone: 'water' | 'sky' | 'walk';
  title: string; copy: string; meta: string;
};

export const CARES = [
  { id: 'water', category: 'body', icon: 'drop', tone: 'water', title: '물 몇 모금', copy: '한 컵을 다 마시지 않아도 괜찮아요.', meta: '1분 · 아주 쉬움' },
  { id: 'snack', category: 'body', icon: 'leaf', tone: 'walk', title: '간단한 것 하나 먹기', copy: '바나나, 요거트처럼 손에 잡히는 것부터.', meta: '3분 · 쉬움' },
  { id: 'rest', category: 'rest', icon: 'cloud', tone: 'sky', title: '3분만 눈 감기', copy: '아무것도 하지 않고 잠깐 쉬어도 좋아요.', meta: '3분 · 아주 쉬움' },
  { id: 'window', category: 'environment', icon: 'cloud', tone: 'sky', title: '창문 열기', copy: '잠깐 바깥 공기를 느껴봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'sky', category: 'environment', icon: 'cloud', tone: 'sky', title: '하늘 바라보기', copy: '창문 너머 하늘을 잠깐 바라봐요.', meta: '2분 · 아주 쉬움' },
  { id: 'stretch', category: 'body', icon: 'walk', tone: 'water', title: '몸 한 번 펴기', copy: '어깨와 목을 천천히 움직여봐요.', meta: '2분 · 아주 쉬움' },
  { id: 'walk', category: 'movement', icon: 'walk', tone: 'walk', title: '5분 걷기', copy: '멀리 가지 않아도 괜찮아요.', meta: '5분 · 쉬움' },
  { id: 'music', category: 'mind', icon: 'leaf', tone: 'sky', title: '좋아하는 노래 한 곡', copy: '아무것도 하지 않고 음악만 들어도 좋아요.', meta: '3분 · 아주 쉬움' },
  { id: 'warm-drink', category: 'comfort', icon: 'drop', tone: 'walk', title: '따뜻한 음료 마시기', copy: '잠깐 손에 따뜻함을 느껴봐요.', meta: '5분 · 쉬움' },
  { id: 'wash', category: 'body', icon: 'drop', tone: 'water', title: '얼굴 씻기', copy: '편안한 온도의 물로 천천히 씻어봐요.', meta: '2분 · 아주 쉬움' },
  { id: 'shoulders', category: 'rest', icon: 'cloud', tone: 'sky', title: '어깨 내려놓기', copy: '숨을 내쉬면서 어깨에 힘을 조금 풀어봐요.', meta: '1분 · 아주 쉬움' },
  { id: 'sunlight', category: 'environment', icon: 'leaf', tone: 'walk', title: '햇빛 잠깐 받기', copy: '창가에 잠깐 앉아 있어도 괜찮아요.', meta: '3분 · 아주 쉬움' },
  { id: 'favorite', category: 'mind', icon: 'leaf', tone: 'sky', title: '좋아하는 것 하나 바라보기', copy: '눈에 들어오는 좋아하는 물건을 잠깐 바라봐요.', meta: '1분 · 아주 쉬움' },
] as const satisfies readonly Care[];

export type CareId = typeof CARES[number]['id'];
export function isCareId(id: unknown): id is CareId {
  return typeof id === 'string' && CARES.some(care => care.id === id);
}
