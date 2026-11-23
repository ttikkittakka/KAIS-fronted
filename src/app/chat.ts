import { needsSafetyRoute } from './safety';
import { tone, words } from './voice';

// The friend answers on the device with short, kind lines. It never diagnoses or gives advice.
export type Emotion = 'joy' | 'excited' | 'comfort' | 'curious' | 'sleepy' | 'love' | 'surprised' | 'wave' | 'sing' | 'dance' | 'calm' | 'walk';
export type Reply = { text: string; emotion: Emotion; safety?: true; support?: true };

// Checked in order; the first matching topic answers.
const TOPICS: [RegExp, Emotion, string[]][] = [
  [/안녕|반가|하이|헬로/, 'joy', ['안녕! 와 줘서 반가워.', '안녕! 오늘은 어떤 하루였어?']],
  [/고마|감사|땡큐/, 'love', ['나도 고마워. 네가 있어서 좋아.', '헤헤, 그 말 들으니까 힘이 나!']],
  [/사랑해|좋아해|보고\s*싶/, 'love', ['나도 좋아해! 늘 여기 있을게.', '나도! 오늘도 같이 있자.']],
  [/대박|헐|깜짝|놀랐|우와/, 'surprised', ['헉, 정말? 깜짝 놀랐어!', '우와! 더 얘기해 줘!']],
  [/졸려|졸리|잠이|자야|피곤|자고\s*싶/, 'sleepy', ['오늘 많이 애썼어. 푹 쉬어도 돼.', '나도 조금 졸려… 같이 쉬자.']],
  [/배고|밥|먹었|먹을|간식/, 'joy', ['맛있는 거 먹었어? 생각만 해도 좋다!', '꼭꼭 챙겨 먹자. 나도 냠냠!']],
  [/심심|지루|놀자|놀아/, 'excited', ['그럼 나랑 놀자! 나를 살살 쓰다듬어 줄래?', '좋아, 놀자! 나를 꾹 눌러 봐!']],
  [/학교|회사|공부|시험|과제|숙제|알바|출근|야근/, 'comfort', ['할 일이 많았구나. 잠깐 숨 돌려도 괜찮아.', '애썼다, 정말. 조금 쉬어 가자.']],
  [/날씨|비가|비\s*와|더워|더운|추워|추운|맑아/, 'curious', ['오늘 날씨는 어때? 창밖을 한 번 바라봐도 좋아.', '날씨 따라 기분도 달라지지. 따뜻하게 지내!']],
  [/친구|가족|엄마|아빠|언니|오빠|누나|동생/, 'curious', ['그 사람 이야기 더 해 줄래?', '소중한 사람이구나. 더 듣고 싶어.']],
];
const QUESTION = /[?？]\s*$|뭐|왜|어떻게|언제|어디|누구|할까/;
const ASK = ['음… 같이 천천히 생각해 볼까?', '좋은 질문이야! 너는 어떻게 생각해?'];
const COMFORT = ['말해 줘서 고마워. 오늘은 천천히 쉬어도 괜찮아.', '그랬구나… 많이 힘들었겠다. 나는 여기 있을게.', '네 마음 잘 들었어. 혼자가 아니야.'];
const CHEER = ['좋은 이야기 들려줘서 나도 기뻐!', '와, 듣기만 해도 기분이 좋아져!', '정말 좋다! 그 기분 오래 간직하자.'];
const LISTEN = ['응, 잘 들었어. 또 이야기해 줘.', '그렇구나. 더 들려줄래?', '음음, 계속 듣고 있어.'];
export const SAFETY_REPLY = '말해 줘서 정말 고마워. 지금 많이 힘들구나. 혼자 견디지 않아도 돼. 바로 이야기할 수 있는 곳을 아래에 둘게.';
export const SUPPORT_REPLY = '응, 내가 도와줄게! 받을 수 있는 지원 제도를 같이 찾고 신청서도 같이 써 보자.';
export const SUPPORT_HELP_REPLY = '응, 내가 도와줄게. 지원 제도도 같이 찾자. 지금 많이 힘들면 바로 이야기할 수 있는 곳도 아래에 둘게.';
// Asking for help with a program or benefit. Its "도와줘" alone is not a crisis; every other crisis phrase still is.
const SUPPORT_ASK = /지원\s*(제도|사업|정책|금)|바우처|복지|혜택|수당|신청|정부\s*지원|상담\s*(받|지원|센터)/;
const HELP_WORDS = /도와\s*줘(?!\s*서)|도와\s*주세요|도움이\s*필요해/g;

// Varies the line by the message so the same words always get the same answer (stable for tests too).
const pick = (lines: string[], text: string) => lines[text.length % lines.length];

export function friendReply(text: string): Reply {
  const support = SUPPORT_ASK.test(text);
  if (needsSafetyRoute(support ? text.replace(HELP_WORDS, '') : text)) return { text: SAFETY_REPLY, emotion: 'comfort', safety: true };
  // A plea for help inside a benefits request never loses the crisis link: both links show.
  if (support) return needsSafetyRoute(text) ? { text: SUPPORT_HELP_REPLY, emotion: 'comfort', support: true, safety: true } : { text: SUPPORT_REPLY, emotion: 'joy', support: true };
  for (const [pattern, emotion, lines] of TOPICS) if (pattern.test(text)) return { text: pick(lines, text), emotion };
  const found = words(text);
  const negative = found.filter(w => tone(w) === 'negative').length;
  const positive = found.filter(w => tone(w) === 'positive').length;
  if (negative > positive) return { text: pick(COMFORT, text), emotion: 'comfort' };
  if (positive > 0) return { text: pick(CHEER, text), emotion: 'joy' };
  if (QUESTION.test(text)) return { text: pick(ASK, text), emotion: 'curious' };
  return { text: pick(LISTEN, text), emotion: 'curious' };
}

/** The friend speaks first every time the home screen opens. */
export const GREETING = '오늘도 와줘서 고마워. 오늘 하루는 어땠어?';

// Feelings the user can send with one tap when words are hard to find.
export const FEELINGS = [
  { label: '기뻐', text: '오늘 기분이 좋아!' }, { label: '슬퍼', text: '오늘 좀 슬퍼' }, { label: '화나', text: '화가 나' },
  { label: '불안해', text: '마음이 불안해' }, { label: '피곤해', text: '너무 피곤해' }, { label: '심심해', text: '심심해' },
] as const;

// Growing together opens more: 친밀도 (bond), 마음 성숙도 (mind) or the overall 레벨 (both added). null = open from day one.
export type Unlock = { meter: 'bond' | 'mind' | 'level'; level: number } | null;
export const INTERACTIONS = [
  { id: 'wave', label: '인사하기', done: '손을 흔들어 인사했어요', line: '안녕! 나도 손 흔들어 줄게!', emotion: 'wave', unlock: null },
  { id: 'pet', label: '쓰다듬기', done: '살살 쓰다듬었어요', line: '헤헤, 간지러워!', emotion: 'joy', unlock: null },
  { id: 'snack', label: '간식 주기', done: '간식을 줬어요', line: '냠냠! 정말 맛있어. 고마워!', emotion: 'excited', unlock: null },
  { id: 'hug', label: '안아 주기', done: '꼭 안아 줬어요', line: '따뜻해… 나도 꼭 안아 줄게.', emotion: 'love', unlock: null },
  { id: 'play', label: '같이 놀기', done: '같이 놀았어요', line: '와, 신난다! 한 번 더 놀자!', emotion: 'surprised', unlock: { meter: 'bond', level: 2 } },
  { id: 'breathe', label: '같이 숨 쉬기', done: '같이 천천히 숨을 쉬었어요', line: '들이쉬고… 후우, 내쉬고. 마음이 조금 편해졌어?', emotion: 'calm', unlock: { meter: 'mind', level: 2 } },
  { id: 'sing', label: '노래하기', done: '같이 노래했어요', line: '랄랄라~ 네가 있어서 노래가 절로 나와!', emotion: 'sing', unlock: { meter: 'level', level: 4 } },
  { id: 'walk', label: '산책하기', done: '정원을 한 바퀴 산책했어요', line: '바람이 시원하다! 같이 걸으니까 더 좋아.', emotion: 'walk', unlock: { meter: 'bond', level: 3 } },
  { id: 'dance', label: '춤추기', done: '같이 춤을 췄어요', line: '빙글빙글~ 우리 춤 정말 멋지다!', emotion: 'dance', unlock: { meter: 'mind', level: 4 } },
] as const satisfies readonly { id: string; label: string; done: string; line: string; emotion: Emotion; unlock: Unlock }[];
export type InteractionId = typeof INTERACTIONS[number]['id'];
export const unlockLabel = (unlock: NonNullable<Unlock>) => ({ bond: '친밀도', mind: '마음 성숙도', level: '레벨' })[unlock.meter] + ' Lv.' + unlock.level;
