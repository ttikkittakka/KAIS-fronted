import { localDay, type DailyCheckin } from './daily-checkin';
import { normalizeAnswers, type AnswerValue } from './questions';

export const OUTINGS = ['inside', 'outside'] as const;
export type Outing = typeof OUTINGS[number];
export const OUTING_LABELS: Record<Outing, string> = { inside: '실내에서 지냈어요', outside: '밖에 다녀왔어요' };
export const LEVELS = ['very_low', 'low', 'normal', 'good', 'very_good'] as const;
export const MOOD_LABELS: Record<AnswerValue, string> = { very_low: '많이 지침', low: '조금 무거움', normal: '잔잔함', good: '괜찮음', very_good: '가벼움' };
export const ENERGY_LABELS: Record<AnswerValue, string> = { very_low: '매우 낮음', low: '낮음', normal: '보통', good: '괜찮음', very_good: '충분함' };

const DIARY_WORDS = [
  { tag: '지침', words: ['지쳤', '지치', '피곤', '힘이 없', '무기력'] },
  { tag: '걱정', words: ['걱정', '불안', '긴장', '부담', '초조'] },
  { tag: '외로움', words: ['외롭', '외로', '쓸쓸', '그리웠'] },
  { tag: '답답함', words: ['답답', '막막', '속상', '서운'] },
  { tag: '편안함', words: ['편안', '한결', '차분', '잔잔', '여유'] },
  { tag: '기쁨', words: ['기뻤', '기쁘', '즐겁', '즐거', '행복', '재밌'] },
  { tag: '고마움', words: ['고마', '감사', '덕분'] },
  { tag: '가벼움', words: ['가벼', '가볍', '후련', '상쾌'] },
] as const;
export const MOOD_TAGS = DIARY_WORDS.map(item => item.tag);
export type MoodTag = typeof DIARY_WORDS[number]['tag'];

export function diaryTags(...parts: (string | undefined)[]): MoodTag[] {
  const text = parts.filter(Boolean).join(' ').normalize('NFC');
  return DIARY_WORDS.filter(({ words }) => words.some(word => text.includes(word))).map(({ tag }) => tag);
}

export type MoodSnapshot = {
  date: string;
  mood: AnswerValue;
  energy: AnswerValue;
  sleep: AnswerValue;
  meal: AnswerValue;
  outing?: Outing;
};

export function moodSnapshot(records: readonly DailyCheckin[], today = localDay()): MoodSnapshot[] {
  const dates = new Set(trailingDays(14, today));
  return records.filter(record => dates.has(record.date)).flatMap(record => {
    const [sleep, energy, meal, mood] = normalizeAnswers(record.answers);
    return sleep && energy && meal && mood
      ? [{ date: record.date, sleep, energy, meal, mood, ...(record.outing ? { outing: record.outing } : {}) }]
      : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function trailingDays(count: number, today = localDay()) {
  const end = new Date(today + 'T12:00:00');
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(end);
    date.setDate(end.getDate() - count + 1 + i);
    return localDay(date);
  });
}

export const isLow = (value?: AnswerValue | null) => value === 'very_low' || value === 'low';

export function moodPattern(rows: readonly MoodSnapshot[], today = localDay()) {
  const recent = new Set(trailingDays(7, today));
  const previous = rows.filter(row => !recent.has(row.date));
  const current = rows.filter(row => recent.has(row.date));
  return {
    recentCount: current.length,
    lowDays: current.filter(row => isLow(row.mood)).length,
    last: rows.at(-1),
    gap: rows.length > 0 && current.length === 0,
    changed: current.length >= 3 && previous.length >= 3 &&
      current.filter(row => isLow(row.mood)).length / current.length >= 2 / 3 &&
      previous.filter(row => isLow(row.mood)).length / previous.length <= 1 / 3,
  };
}
