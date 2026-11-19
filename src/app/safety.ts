// Runs only on the device: free text is checked here and never sent anywhere.
// 힘들어·우울·도움·상담 are left out on purpose: they are everyday diary words in this app
// (e.g. the "누군가에게 도움 요청하는 말 생각하기" care), so they would flag ordinary days.
// Phrases are matched with spaces removed; (?!서) skips "친구를 도와줘서".
const SAFETY_PHRASES = [
  '자살', '자해', '죽고싶', '죽어버리고싶', '사라지고싶', '없어지고싶', '살기싫', '살고싶지않',
  '극단적선택', '뛰어내리고싶', '목숨을끊고싶', '목숨끊고싶', '도와줘(?!서)', '도와주세요', '살려줘(?!서)', '살려주세요', '도움이필요해',
];
const SAFETY_PATTERN = new RegExp(SAFETY_PHRASES.join('|'));

export function needsSafetyRoute(text: string) {
  return SAFETY_PATTERN.test(text.replace(/\s+/g, ''));
}

// Checked against 보건복지부 notices; re-check numbers before every public demo.
export const SAFETY_VERIFIED_AT = '2026-11-03';
export const SAFETY_SOURCE = { label: '보건복지부', url: 'https://www.mohw.go.kr' };
export const SAFETY_CONTACTS = [
  { number: '109', name: '자살예방상담전화', note: '24시간 · 나와 주변 사람 모두 상담할 수 있어요' },
  { number: '1577-0199', name: '정신건강위기상담전화', note: '24시간' },
  { number: '112', name: '경찰', note: '지금 즉각적인 위험이 있을 때' },
  { number: '119', name: '119 구급', note: '지금 즉각적인 위험이 있을 때' },
] as const;
