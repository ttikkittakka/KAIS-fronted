import { appStorage, dataScope } from './app-storage';
import { findSupportProgram, SUPPORT_REGIONS } from './support';

export const SUPPORT_CONSENT_VERSION = '2026-11-19.1';
export const SUPPORT_STORY_LIMIT = 500;
export const SUPPORT_STATUS_LABELS = {
  received: '접수',
  reviewing: '확인 중',
  contact_scheduled: '연락 예정',
  completed: '완료',
  cancelled: '취소',
} as const;
export type SupportStatus = keyof typeof SUPPORT_STATUS_LABELS;

export const SUPPORT_CONTACT_TIMES = [
  { id: 'morning', label: '오전 (9~12시)' },
  { id: 'afternoon', label: '오후 (12~18시)' },
  { id: 'evening', label: '저녁 (18~21시)' },
  { id: 'any', label: '아무 때나 괜찮아요' },
] as const;

export const EMPTY_SUPPORT_DRAFT = {
  name: '',
  birthDate: '',
  phone: '',
  email: '',
  region: '',
  district: '',
  contactTime: '',
  story: '',
};
export type SupportDraft = typeof EMPTY_SUPPORT_DRAFT;
export type SupportField = keyof SupportDraft;
export type SupportFieldErrors = Partial<Record<SupportField, string>>;

export const EMPTY_SUPPORT_CONSENTS = {
  collection: false,
  sharing: false,
  sensitive: false,
  notifications: false,
};
export type SupportConsents = typeof EMPTY_SUPPORT_CONSENTS;
export type SupportConsentKind = keyof SupportConsents;
export type SupportConsentErrors = Partial<Record<SupportConsentKind, string>>;

export const SUPPORT_AGE_ERROR = '이 도우미는 만 19세부터 이용할 수 있어요. 지금 받을 수 있는 도움도 함께 찾아봐요.';
export const SUPPORT_IDENTIFIER_WARNING = '주민등록번호, 외국인등록번호, 여권번호, 운전면허번호는 입력하지 말아 주세요.';
const SUPPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_PATTERN = /[0-9]{6}[\s-]*[0-9]{7}|[0-9]{2}[\s-]*[0-9]{2}[\s-]*[0-9]{6}[\s-]*[0-9]{2}|[A-Z](?:[0-9]{8}|[0-9]{3}[A-Z][0-9]{4})|[A-Z]{2}[0-9]{7}/i;

export function supportCharacterCount(value: string) {
  return Array.from(value).length;
}

function containsIdentifier(value: string) {
  return ID_PATTERN.test(value.normalize('NFKC').replace(/[‐‑‒–—−]/g, '-'));
}

const seoulDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

export function normalizeSupportDraft(draft: SupportDraft): SupportDraft {
  return {
    name: draft.name.trim(),
    birthDate: draft.birthDate.trim(),
    phone: draft.phone.trim().replace(/[ -]/g, '').replace(/^\+82/, '0'),
    email: draft.email.trim(),
    region: draft.region.trim(),
    district: draft.district.trim(),
    contactTime: draft.contactTime.trim(),
    story: draft.story.trim(),
  };
}

export function validateSupportDraft(input: SupportDraft, today = seoulDate.format(new Date())): SupportFieldErrors {
  const draft = normalizeSupportDraft(input);
  const errors: SupportFieldErrors = {};
  if (!draft.name || supportCharacterCount(draft.name) > 80 ||
    !/^[\p{L}\p{M} .’'-]+$/u.test(draft.name) || !/\p{L}/u.test(draft.name)) {
    errors.name = '이름을 80자 이내로 입력해 주세요.';
  }

  const birth = new Date(draft.birthDate + 'T00:00:00Z');
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(draft.birthDate) || draft.birthDate.startsWith('0000-') ||
    !Number.isFinite(+birth) || birth.toISOString().slice(0, 10) !== draft.birthDate || draft.birthDate > today) {
    errors.birthDate = '올바른 생년월일을 입력해 주세요.';
  } else {
    const years = Number(today.slice(0, 4)) - birth.getUTCFullYear();
    if (years < 19 || (years === 19 && today.slice(5) < draft.birthDate.slice(5))) errors.birthDate = SUPPORT_AGE_ERROR;
  }

  if (!/^(010[0-9]{8}|01[16789][0-9]{7,8})$/.test(draft.phone)) {
    errors.phone = '연락받을 수 있는 휴대전화 번호를 입력해 주세요.';
  }
  if (draft.email &&
    (draft.email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_{}|~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(draft.email))) {
    errors.email = '이메일 주소를 확인해 주세요.';
  } else if (containsIdentifier(draft.email)) {
    errors.email = SUPPORT_IDENTIFIER_WARNING;
  }
  if (!SUPPORT_REGIONS.some(region => region === draft.region)) errors.region = '시·도를 골라 주세요.';
  if (draft.district.length > 40 || !/^[가-힣]+[시군구]( [가-힣]+구)?$/.test(draft.district) ||
    (draft.region === '세종' && draft.district !== '세종시')) {
    errors.district = draft.region === '세종' ? '세종시로 입력해 주세요.' : '시·군·구 이름을 입력해 주세요. 예를 들어 성남시 분당구처럼 적어요.';
  }
  if (!SUPPORT_CONTACT_TIMES.some(time => time.id === draft.contactTime)) errors.contactTime = '연락 가능한 시간을 골라 주세요.';
  if (supportCharacterCount(draft.story) > SUPPORT_STORY_LIMIT) {
    errors.story = '사연은 500자 이내로 적어 주세요.';
  } else if (containsIdentifier(draft.story)) {
    errors.story = SUPPORT_IDENTIFIER_WARNING;
  } else if (/\p{Cc}/u.test(draft.story.replace(/[\t\r\n]/g, ''))) {
    errors.story = '사연에 입력한 글자를 확인해 주세요.';
  }
  return errors;
}

export function validateSupportConsents(consents: SupportConsents, story: string): SupportConsentErrors {
  const errors: SupportConsentErrors = {};
  if (consents.collection !== true) errors.collection = '개인정보 수집·이용 동의를 확인해 주세요.';
  if (consents.sharing !== true) errors.sharing = '제3자 제공 동의를 확인해 주세요.';
  if (story.trim() && consents.sensitive !== true) errors.sensitive = '사연을 보내려면 민감정보 처리에 동의해 주세요.';
  return errors;
}

export function prepareSupportSubmission(programId: string, draft: SupportDraft, consents: SupportConsents) {
  const program = findSupportProgram(programId);
  const form = normalizeSupportDraft(draft);
  if (!program || Object.keys(validateSupportDraft(form)).length || Object.keys(validateSupportConsents(consents, form.story)).length) {
    throw new Error('신청서와 동의 항목을 확인해 주세요.');
  }
  return {
    programId: program.id,
    form,
    consents: {
      version: SUPPORT_CONSENT_VERSION,
      collection: true,
      sharing: true,
      sensitive: Boolean(form.story),
      notifications: consents.notifications === true,
    },
  };
}

export type SupportReceipt = {
  id: string;
  program_id: string;
  status: SupportStatus;
  created_at: string;
  closed_at: string | null;
};

export function canCancelSupport(status: SupportStatus) {
  return status !== 'completed' && status !== 'cancelled';
}

export const SUPPORT_APPLICATIONS_KEY = 'little-garden.support-applications.v1';

function assertSimulationScope() {
  if (dataScope() === 'account') throw new Error('계정 신청은 서버에서 확인해 주세요.');
}

export function listLocalSupportApplications(): SupportReceipt[] {
  assertSimulationScope();
  const rows = JSON.parse(appStorage.getItem(SUPPORT_APPLICATIONS_KEY) ?? '[]');
  if (!Array.isArray(rows)) throw new Error('이 기기의 신청 내역을 읽지 못했어요.');
  return rows.map(row => {
    if (typeof row?.id !== 'string' || !SUPPORT_ID.test(row.id) || typeof row.program_id !== 'string' ||
      !Object.hasOwn(SUPPORT_STATUS_LABELS, row.status) || typeof row.created_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      (row.closed_at !== null && (typeof row.closed_at !== 'string' || !Number.isFinite(Date.parse(row.closed_at))))) {
      throw new Error('이 기기의 신청 내역을 읽지 못했어요.');
    }
    const { id, program_id, status, created_at, closed_at } = row;
    return { id, program_id, status, created_at, closed_at };
  });
}

export function submitLocalSupportApplication(id: string, programId: string, draft: SupportDraft, consents: SupportConsents) {
  const rows = listLocalSupportApplications();
  if (!SUPPORT_ID.test(id)) throw new Error('접수 번호를 확인하지 못했어요.');
  const submission = prepareSupportSubmission(programId, draft, consents);
  const existing = rows.find(row => row.id === id);
  if (existing) {
    if (existing.program_id !== submission.programId) throw new Error('내 신청 현황에서 먼저 접수를 확인해 주세요.');
    return;
  }
  const receipt: SupportReceipt = {
    id,
    program_id: submission.programId,
    status: 'received',
    created_at: new Date().toISOString(),
    closed_at: null,
  };
  appStorage.setItem(SUPPORT_APPLICATIONS_KEY, JSON.stringify([receipt, ...rows]));
}

export function cancelLocalSupportApplication(id: string) {
  const rows = listLocalSupportApplications();
  const closedAt = new Date().toISOString();
  const updated = rows.map(row => row.id === id && canCancelSupport(row.status)
    ? { ...row, status: 'cancelled', closed_at: closedAt }
    : row);
  appStorage.setItem(SUPPORT_APPLICATIONS_KEY, JSON.stringify(updated));
}

export function eraseLocalSupportApplication(id: string) {
  const rows = listLocalSupportApplications();
  appStorage.setItem(SUPPORT_APPLICATIONS_KEY, JSON.stringify(rows.filter(row => row.id !== id)));
}
