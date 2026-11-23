import { appStorage } from './app-storage';
import { isLow } from './wellbeing';
import type { AnswerValue } from './questions';

export const PLACES = [
  { id: 'seoul-forest', name: '서울숲', district: '성동구', kind: '그늘 산책', detail: '나무 데크를 따라 걸으며 편한 곳에서 잠깐 쉬어요.', lat: 37.5446, lon: 127.0376, effort: 1,
    file: 'Seoul_Forest_boardwalk_with_tables.jpg', photographer: 'CartoonChess', license: '4.0' },
  { id: 'cheonggye', name: '청계천', district: '종로구', kind: '물가 산책', detail: '청계광장에서 가까운 구간만 물길을 따라 걸어요.', lat: 37.5691, lon: 126.9787, effort: 1,
    file: 'Cheonggyecheon_tree-lined_stream_and_footbridge_at_sunrise_in_Seoul.jpg', photographer: 'Basile Morin', license: '4.0' },
  { id: 'seokchon', name: '석촌호수', district: '송파구', kind: '호수 둘레', detail: '호수 한쪽을 걸으며 물 위에 비친 풍경을 살펴봐요.', lat: 37.5089, lon: 127.1033, effort: 2,
    file: 'Seokchon_Lake_Cherry_Blossoms_2020.jpg', photographer: 'Ox1997cow', license: '4.0' },
  { id: 'olympic', name: '올림픽공원', district: '송파구', kind: '잔디와 숲길', detail: '넓은 잔디와 흙길 중 오늘 걷기 좋은 길을 골라요.', lat: 37.5209, lon: 127.1219, effort: 3,
    file: 'Olympic_Park_in_Oct_2020.jpg', photographer: 'Hyeonyoung Lee 21', license: '4.0' },
  { id: 'botanic', name: '서울식물원', district: '강서구', kind: '정원 둘러보기', detail: '온실과 야외 정원 중 마음이 가는 공간을 둘러봐요.', lat: 37.5711, lon: 126.8352, effort: 2,
    file: 'Seoul_botanic_park_05.jpg', photographer: 'korea.net', license: '2.0' },
] as const;

export type Place = typeof PLACES[number];
type PlaceId = Place['id'];
export type PlaceStatus = 'saved' | 'visited';
export type Position = { lat: number; lon: number };
type PlaceLog = Partial<Record<PlaceId, { status: PlaceStatus; date: string }>>;
const KEY = 'little-garden.places.v1';

export function placeLog(): PlaceLog {
  try {
    const raw = JSON.parse(appStorage.getItem(KEY) ?? '{}');
    return Object.fromEntries(PLACES.flatMap(({ id }) => {
      const entry = raw?.[id];
      return entry && ['saved', 'visited'].includes(entry.status) && typeof entry.date === 'string' ? [[id, entry]] : [];
    }));
  } catch { return {}; }
}

export function markPlace(id: PlaceId, status: PlaceStatus, date: string) {
  const log = placeLog();
  if (log[id]?.status === status) delete log[id];
  else log[id] = { status, date };
  appStorage.setItem(KEY, JSON.stringify(log));
  return log;
}

export function kmBetween(a: Position, b: Position) {
  const rad = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
}

export function rankPlaces(energy?: AnswerValue, position?: Position) {
  return [...PLACES].sort((a, b) => {
    const pace = isLow(energy) ? (a.effort - b.effort) * 3 : 0;
    return pace + (position ? kmBetween(position, a) - kmBetween(position, b) : 0);
  });
}
