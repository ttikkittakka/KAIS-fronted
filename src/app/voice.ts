import { appStorage } from './app-storage';
import { localDay } from './daily-checkin';

// What the user tells their friend is reduced to word counts on this device; sentences are never stored.
// The lexicon is a small stem list, so negation ("안 좋아") and context are not understood.
export const POSITIVE_STEMS = ['좋', '행복', '고마', '감사', '기쁘', '기뻐', '즐거', '즐겁', '재밌', '재미있', '신나', '신났', '편안', '편해', '괜찮', '사랑', '설레', '뿌듯', '다행', '웃', '맛있', '따뜻', '상쾌', '개운', '안심', '기대'] as const;
export const NEGATIVE_STEMS = ['힘들', '힘드', '슬프', '슬퍼', '우울', '외로', '외롭', '불안', '짜증', '화나', '화가', '싫', '피곤', '지쳐', '지친', '아프', '아파', '무서', '무섭', '걱정', '답답', '속상', '괴로', '괴롭', '서운', '후회', '막막', '귀찮'] as const;
const STOPWORDS = new Set(['그냥', '너무', '진짜', '정말', '오늘', '나', '내가', '나는', '저', '제가', '저는', '좀', '그리고', '근데', '그래서', '그런데', '아', '음', '어', '응', '네', '것', '거', '수', '더', '또', '이', '그', '저기', '이제', '조금', '많이', '같아', '있어', '없어', '했어', '해', '하고']);
const PARTICLES = ['에서', '에게', '한테', '이랑', '으로', '께서', '처럼', '까지', '부터', '은', '는', '이', '가', '을', '를', '에', '랑', '도', '만', '의', '로', '와', '과'];
const MAX_LENGTH = 300;
// A longer run of letters is usually a sentence typed without spaces; storing it would keep the sentence.
const MAX_STORED_WORD = 6;

/** Splits speech into words, dropping particles and filler words. */
export function words(text: string) {
  return text.slice(0, MAX_LENGTH).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).map(word => {
    for (const p of PARTICLES) if (word.length > p.length + 1 && word.endsWith(p)) return word.slice(0, -p.length);
    return word;
  }).filter(word => word.length > 1 && !STOPWORDS.has(word));
}
export const tone = (word: string) => POSITIVE_STEMS.some(s => word.includes(s)) ? 'positive' : NEGATIVE_STEMS.some(s => word.includes(s)) ? 'negative' : null;

export const VOICE_KEY = 'little-garden.voice-words.v1';
type VoiceLog = { version: 1; days: Record<string, Record<string, number>> };
export function readVoiceLog(): VoiceLog {
  try {
    const log = JSON.parse(appStorage.getItem(VOICE_KEY) ?? 'null') as VoiceLog | null;
    if (log?.version !== 1 || !log.days || typeof log.days !== 'object') return { version: 1, days: {} };
    const days = Object.fromEntries(Object.entries(log.days).map(([d, counts]) => [d, Object.fromEntries(
      Object.entries(counts ?? {}).filter(([w, n]) => typeof w === 'string' && w.length <= 20 && Number.isInteger(n) && n > 0))]));
    return { version: 1, days };
  } catch { return { version: 1, days: {} }; }
}
/** Adds one utterance's words to today's counts and returns its tone balance for the friend's reply. */
export function recordUtterance(text: string, date = localDay()) {
  const found = words(text);
  const log = readVoiceLog();
  const counts = { ...log.days[date] };
  for (const w of found) if (w.length <= MAX_STORED_WORD) counts[w] = (counts[w] ?? 0) + 1;
  // Keep about two months of counts.
  const days = Object.fromEntries(Object.entries({ ...log.days, [date]: counts }).sort(([a], [b]) => b.localeCompare(a)).slice(0, 62));
  if (found.length) appStorage.setItem(VOICE_KEY, JSON.stringify({ version: 1, days }));
  return { positive: found.filter(w => tone(w) === 'positive').length, negative: found.filter(w => tone(w) === 'negative').length, count: found.length };
}
/** Most used words and the positive/negative balance over the given dates. */
export function summarizeWords(dates: string[], log = readVoiceLog()) {
  const total = new Map<string, number>();
  for (const date of dates) for (const [w, n] of Object.entries(log.days[date] ?? {})) total.set(w, (total.get(w) ?? 0) + n);
  const sorted = Array.from(total).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const byTone = (t: 'positive' | 'negative') => sorted.filter(([w]) => tone(w) === t);
  const sum = (list: [string, number][]) => list.reduce((s, [, n]) => s + n, 0);
  return { top: sorted.slice(0, 8), positive: byTone('positive').slice(0, 5), negative: byTone('negative').slice(0, 5), positiveCount: sum(byTone('positive')), negativeCount: sum(byTone('negative')), total: sum(sorted) };
}
