// This catalog is a starting point. The official notice determines eligibility and availability.
export const SUPPORT_CHECKED_AT = '2026-11-04';

export const SUPPORT_NEEDS = [
  { id: 'mind', label: '마음·상담' },
  { id: 'living', label: '생활비' },
  { id: 'work', label: '일자리' },
  { id: 'housing', label: '주거' },
  { id: 'connection', label: '고립·외로움' },
  { id: 'study', label: '학업' },
] as const;
export type SupportNeed = typeof SUPPORT_NEEDS[number]['id'];

export const SUPPORT_AGE_GROUPS = [
  { id: '19-39', label: '만 19~39세' },
  { id: '40-64', label: '만 40~64세' },
  { id: '65-plus', label: '만 65세 이상' },
] as const;
export type SupportAgeGroup = typeof SUPPORT_AGE_GROUPS[number]['id'];

export const SUPPORT_REGIONS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
] as const;
export type SupportRegion = typeof SUPPORT_REGIONS[number];

export type SupportTopic = 'mind' | 'youth' | 'living' | 'work' | 'study' | 'find';
export const SUPPORT_TOPICS: { id: SupportTopic | 'all'; label: string }[] = [
  { id: 'all', label: '전체' }, { id: 'mind', label: '마음·상담' }, { id: 'youth', label: '청년' },
  { id: 'living', label: '생활·주거' }, { id: 'work', label: '일자리' }, { id: 'study', label: '학업' },
  { id: 'find', label: '내 혜택 찾기' },
];

type Program = {
  id: string;
  topic: SupportTopic;
  name: string;
  agency: string;
  recipient: string;
  what: string;
  who: string;
  how: string;
  url: string;
  urlLabel: string;
  search: string;
  tags: readonly SupportNeed[];
  region?: SupportRegion;
  ageGroup?: SupportAgeGroup;
};

export const SUPPORT_PROGRAMS = [
  {
    id: 'mind-voucher', topic: 'mind', name: '정신건강 심리상담 바우처사업', agency: '보건복지부',
    recipient: '관할 읍·면·동 행정복지센터',
    what: '전문 심리상담을 받을 수 있는 이용권을 지원해요. 본인부담금은 소득에 따라 달라요.',
    who: '상담이 필요하다는 의뢰서나 소견 등 사업 기준에 맞는 증빙이 있는 분',
    how: '복지로에서 본인 신청하거나 읍·면·동 행정복지센터에 문의해요.',
    url: 'https://www.bokjiro.go.kr', urlLabel: '복지로에서 신청하기', search: '정신건강 심리상담 바우처',
    tags: ['mind'],
  },
  {
    id: 'mind-center', topic: 'mind', name: '정신건강복지센터 상담', agency: '시·군·구 정신건강복지센터',
    recipient: '관할 시·군·구 정신건강복지센터',
    what: '가까운 센터에 상담과 지역 서비스 연계를 문의할 수 있어요.',
    who: '상담 대상과 이용 방법은 가까운 센터에 확인해요.',
    how: '국가정신건강정보포털에서 가까운 기관을 찾아 문의해요.',
    url: 'https://www.mentalhealth.go.kr', urlLabel: '가까운 센터 찾기', search: '정신건강복지센터',
    tags: ['mind', 'connection'],
  },
  {
    id: 'seoul-youth-mind', topic: 'youth', name: '서울 청년 마음건강 지원사업', agency: '서울특별시',
    recipient: '서울특별시 청년 마음건강 지원사업 담당 부서',
    what: '심리 검사와 맞춤형 심리상담을 지원해요.',
    who: '서울 거주 만 19~39세 청년이 기본 대상이에요. 제대군인 등 세부 기준은 공식 공고를 확인해요.',
    how: '청년몽땅정보통에서 모집 공고를 찾아 신청해요.',
    url: 'https://youth.seoul.go.kr/youthConts.do?key=2310100076', urlLabel: '청년몽땅정보통 열기', search: '청년 마음건강',
    tags: ['mind'], region: '서울', ageGroup: '19-39',
  },
  {
    id: 'emergency-welfare', topic: 'living', name: '긴급복지지원', agency: '보건복지부',
    recipient: '관할 읍·면·동 행정복지센터 또는 시·군·구 긴급복지 담당 부서',
    what: '갑작스러운 위기 상황에 생활비나 주거비 등 필요한 도움을 요청할 수 있어요.',
    who: '위기 사유와 소득·재산 기준은 공식 안내에서 확인해요.',
    how: '읍·면·동 행정복지센터나 시·군·구에 지원을 요청해요.',
    url: 'https://www.mohw.go.kr/menu.es?mid=a10708010100', urlLabel: '보건복지부 안내 보기', search: '긴급복지지원',
    tags: ['living', 'housing'],
  },
  {
    id: 'employment-support', topic: 'work', name: '국민취업지원제도', agency: '고용노동부',
    recipient: '관할 고용센터',
    what: '구직에 필요한 상담과 취업지원 서비스를 제공해요.',
    who: '참여 유형에 따라 기준이 달라요. 고용24의 신청 안내를 확인해요.',
    how: '고용24에서 신청하거나 고용센터에 문의해요.',
    url: 'https://www.work24.go.kr/ua/z/z/1300/selectEmssRqutIntro.do', urlLabel: '고용24에서 신청 안내 보기', search: '국민취업지원제도',
    tags: ['work'],
  },
  {
    id: 'national-scholarship', topic: 'study', name: '소득연계형 국가장학금', agency: '한국장학재단',
    recipient: '한국장학재단 국가장학금 담당 부서',
    what: '대학생의 등록금 부담을 덜어 주는 장학금이에요.',
    who: '유형별 대상과 소득·성적 기준은 한국장학재단의 학기별 안내를 확인해요.',
    how: '한국장학재단에서 신청 기간과 제출할 서류를 확인해요.',
    url: 'https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_01_01_01p', urlLabel: '한국장학재단 안내 보기', search: '소득연계형 국가장학금',
    tags: ['study'],
  },
  {
    id: 'gov24-benefits', topic: 'find', name: '정부24 보조금24 (내가 받을 수 있는 혜택)', agency: '행정안전부',
    recipient: '운영팀과 함께 찾을 지원 제도의 신청 기관 또는 연계 기관',
    what: '정부 혜택을 한 곳에서 찾아볼 수 있어요.',
    who: '혜택마다 대상과 조건이 달라요.',
    how: '정부24에서 보조금24를 열어 혜택을 찾아요.',
    url: 'https://www.gov.kr', urlLabel: '정부24 열기', search: '보조금24',
    tags: [],
  },
  {
    id: 'bokjiro-find', topic: 'find', name: '복지로 복지서비스 찾기', agency: '보건복지부',
    recipient: '운영팀과 함께 찾을 지원 제도의 신청 기관 또는 연계 기관',
    what: '생활·건강·일자리 등 복지서비스를 찾아볼 수 있어요.',
    who: '서비스마다 대상과 조건이 달라요.',
    how: '복지로에서 복지서비스 찾기를 열어요.',
    url: 'https://www.bokjiro.go.kr', urlLabel: '복지로 열기', search: '복지서비스 찾기',
    tags: [],
  },
] as const satisfies readonly Program[];

export type SupportProgram = Program & { id: typeof SUPPORT_PROGRAMS[number]['id'] };

export function findSupportProgram(id: string): SupportProgram | undefined {
  return SUPPORT_PROGRAMS.find(program => program.id === id);
}

export function recommendSupportPrograms(
  needs: readonly SupportNeed[],
  ageGroup: SupportAgeGroup | '',
  region: SupportRegion | '',
) {
  const programs: readonly SupportProgram[] = SUPPORT_PROGRAMS;
  return programs
    .filter(program => !region || !program.region || program.region === region)
    .map(program => ({
      program,
      matches: program.tags.filter(tag => needs.includes(tag)).length,
      context: Number(Boolean(region && program.region === region)) + (ageGroup && program.ageGroup ? (program.ageGroup === ageGroup ? 2 : -2) : 0),
    }))
    .filter(({ program, matches }) => !needs.length || matches > 0 || program.topic === 'find')
    .sort((a, b) => b.matches - a.matches || b.context - a.context)
    .map(({ program }) => program);
}

/** Live 정부24 entries proxied by ../backend (only when it has a 공공데이터포털 service key). */
export type LiveBenefit = { id: string; name: string; summary: string; target: string; how: string; agency: string; url: string };
