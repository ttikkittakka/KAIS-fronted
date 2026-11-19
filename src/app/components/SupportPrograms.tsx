'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { getAuthClient } from '../../lib/supabase/auth-client';
import { beginStorageOperation, dataScope, type DataScope } from '../app-storage';
import type { CompanionId } from '../companions';
import {
  findSupportProgram, recommendSupportPrograms, SUPPORT_AGE_GROUPS, SUPPORT_CHECKED_AT, SUPPORT_NEEDS, SUPPORT_PROGRAMS,
  SUPPORT_REGIONS, SUPPORT_TOPICS, type LiveBenefit, type SupportAgeGroup, type SupportNeed, type SupportProgram,
  type SupportRegion, type SupportTopic,
} from '../support';
import {
  canCancelSupport, cancelLocalSupportApplication, EMPTY_SUPPORT_CONSENTS, EMPTY_SUPPORT_DRAFT, eraseLocalSupportApplication,
  listLocalSupportApplications, normalizeSupportDraft, prepareSupportSubmission, submitLocalSupportApplication, SUPPORT_AGE_ERROR,
  SUPPORT_CONSENT_VERSION, SUPPORT_CONTACT_TIMES, SUPPORT_IDENTIFIER_WARNING, SUPPORT_STATUS_LABELS, SUPPORT_STORY_LIMIT,
  supportCharacterCount, validateSupportConsents, validateSupportDraft, type SupportConsentErrors, type SupportConsentKind,
  type SupportConsents, type SupportDraft, type SupportField, type SupportFieldErrors, type SupportReceipt,
} from '../support-apply';

const STEPS = {
  intro: ['지원 제도 신청 도우미', '받을 수 있는 도움부터 함께 찾아볼까요?'],
  match: ['필요한 도움 고르기', '어떤 도움이 필요한지 골라 주세요.'],
  consent: ['개인정보 동의', '보내기 전에 내 정보가 어떻게 쓰이는지 확인해요.'],
  form: ['신청서 작성', '운영팀이 연락할 수 있도록 필요한 정보만 적어요.'],
  review: ['신청 내용 확인', '이대로 보내도 괜찮은지 마지막으로 살펴봐요.'],
  history: ['내 신청 현황', '운영팀이 어디까지 도왔는지 여기서 볼 수 있어요.'],
} as const;
type Step = keyof typeof STEPS;
type Friend = { id: CompanionId; name: string };
const DEFAULT_FRIEND: Friend = { id: 'plant', name: '새싹이' };
const TEST_NOTICE = '테스트 신청 · 실제로 보내지 않아요';
const RETENTION = '지원 요청을 처리하는 동안과 완료·취소일부터 1년 동안 보관해요. 그 전에 동의를 철회하면 신청 건에서 계정 연결과 입력한 정보를 바로 지워요.';
const COLLECTION_ITEMS = '계정 식별자, 지원 제도, 이름, 생년월일, 휴대전화, 시·도와 시·군·구, 연락 가능 시간, 이메일(선택), 접수·처리 일시와 상태, 동의 이력';
const SHARING_ITEMS = '선택한 제도, 이름, 생년월일, 휴대전화, 거주 시·도 및 시·군·구 중 기관 업무에 꼭 필요한 항목';
const SHARING_RETENTION = '신청 확인이나 연계 업무가 끝날 때까지 보유하는 것을 기준으로 해요. 실제 보유 기간과 법령에 따른 예외는 제공 전에 기관별로 알려 드려요.';

function OfficialLink({ program }: { program: SupportProgram }) {
  return <a className="support-apply" href={program.url} target="_blank" rel="noreferrer">{program.urlLabel} ↗</a>;
}

function ProgramList({ programs, onSelect }: { programs: readonly SupportProgram[]; onSelect?: (program: SupportProgram) => void }) {
  return <ul className="support-list">{programs.map(program => <li key={program.id} className="support-card">
    <span className="support-agency">{program.agency}</span>
    <h3>{program.name}</h3>
    <p>{program.what}</p>
    <dl>
      <div><dt>대상</dt><dd>{program.who}</dd></div>
      <div><dt>방법</dt><dd>{program.how}</dd></div>
      <div><dt>검색어</dt><dd>{program.search}</dd></div>
    </dl>
    <div className="support-actions">
      {onSelect && <button type="button" className="shop-secondary" aria-label={program.name + ' 신청 도움 받기'} onClick={() => onSelect(program)}>
        {program.topic === 'find' ? '혜택 찾기 도움 받기' : '신청 도움 받기'}
      </button>}
      <OfficialLink program={program}/>
    </div>
  </li>)}</ul>;
}

function OfficialPrograms() {
  const [topic, setTopic] = useState<SupportTopic | 'all'>('all');
  const [live, setLive] = useState<LiveBenefit[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/benefits', {
      cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
    })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!controller.signal.aborted && Array.isArray(data?.items)) setLive(data.items);
      })
      .catch(() => { /* The static catalog remains available. */ });
    return () => controller.abort();
  }, []);
  const shown = SUPPORT_PROGRAMS.filter(program => topic === 'all' || program.topic === topic);
  return <section className="support-official" aria-labelledby="support-official-title">
    <h2 id="support-official-title">공식 안내에서 직접 찾아보기</h2>
    <div className="support-topics" role="group" aria-label="분야">
      {SUPPORT_TOPICS.map(t => <button key={t.id} type="button" aria-pressed={topic === t.id} onClick={() => setTopic(t.id)}>{t.label}</button>)}
    </div>
    <ProgramList programs={shown}/>
    {live.length > 0 && <section className="support-live" aria-labelledby="support-live-title">
      <h3 id="support-live-title">정부24에서 찾은 마음·상담 관련 제도</h3>
      <ul className="support-list">{live.map(benefit => <li key={benefit.id} className="support-card">
        <span className="support-agency">{benefit.agency}</span>
        <h4>{benefit.name}</h4>
        {benefit.summary && <p>{benefit.summary}</p>}
        <dl>{benefit.target && <div><dt>대상</dt><dd>{benefit.target}</dd></div>}{benefit.how && <div><dt>방법</dt><dd>{benefit.how}</dd></div>}</dl>
        {/^https:\/\//.test(benefit.url) && <a className="support-apply" href={benefit.url} target="_blank" rel="noreferrer">정부24에서 자세히 보기 ↗</a>}
      </li>)}</ul>
    </section>}
    <p className="privacy-note">제도 목록 기준일 {SUPPORT_CHECKED_AT} · 각 제도의 공식 안내에서 최신 조건을 확인해 주세요.</p>
  </section>;
}

type MatchFilters = { needs: SupportNeed[]; ageGroup: SupportAgeGroup | ''; region: SupportRegion | '' };
function MatchPrograms({ filters, onChange, onSelect }: {
  filters: MatchFilters;
  onChange: (filters: MatchFilters) => void;
  onSelect: (program: SupportProgram) => void;
}) {
  const id = useId();
  const programs = recommendSupportPrograms(filters.needs, filters.ageGroup, filters.region);
  return <>
    <fieldset className="support-choices">
      <legend>어떤 도움이 필요해요?</legend>
      <div className="support-needs">{SUPPORT_NEEDS.map(need => {
        const checked = filters.needs.includes(need.id);
        return <label key={need.id} className="support-choice" htmlFor={id + '-' + need.id}>
          <input id={id + '-' + need.id} type="checkbox" checked={checked} onChange={() => onChange({
            ...filters, needs: checked ? filters.needs.filter(id => id !== need.id) : [...filters.needs, need.id],
          })}/>{need.label}
        </label>;
      })}</div>
    </fieldset>
    <div className="support-fields support-match-fields">
      <div>
        <label htmlFor={id + '-age'}>연령대</label>
        <select id={id + '-age'} value={filters.ageGroup} onChange={event => onChange({ ...filters, ageGroup: event.target.value as MatchFilters['ageGroup'] })}>
          <option value="">전체 연령</option>
          {SUPPORT_AGE_GROUPS.map(age => <option key={age.id} value={age.id}>{age.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={id + '-region'}>시·도</label>
        <select id={id + '-region'} value={filters.region} onChange={event => onChange({ ...filters, region: event.target.value as MatchFilters['region'] })}>
          <option value="">전국</option>
          {SUPPORT_REGIONS.map(region => <option key={region} value={region}>{region}</option>)}
        </select>
      </div>
    </div>
    <h3>추천 제도</h3>
    <p>신청 자격과 모집 여부는 각 기관의 공식 안내에서 확인해 주세요.</p>
    <p className="sr-only" aria-live="polite">{programs.length}개 제도를 찾았어요.</p>
    <ProgramList programs={programs} onSelect={onSelect}/>
    <p className="privacy-note">제도 목록 기준일 {SUPPORT_CHECKED_AT}</p>
  </>;
}

function ConsentItem({ kind, title, checked, error, onChange, children }: {
  kind: SupportConsentKind;
  title: string;
  checked: boolean;
  error?: string;
  onChange: (kind: SupportConsentKind, value: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  return <div className="support-consent">
    <label className="support-choice" htmlFor={id}>
      <input id={id} name={kind} type="checkbox" checked={checked} required={kind === 'collection' || kind === 'sharing'} aria-invalid={Boolean(error)}
        aria-describedby={id + '-detail' + (error ? ' ' + id + '-error' : '')} onChange={event => onChange(kind, event.target.checked)}/>
      {title}
    </label>
    <div id={id + '-detail'}>{children}</div>
    {error && <p className="support-error" id={id + '-error'} role="alert">{error}</p>}
  </div>;
}

function SensitiveConsent({ consents, error, onChange }: {
  consents: SupportConsents;
  error?: string;
  onChange: (kind: SupportConsentKind, value: boolean) => void;
}) {
  return <ConsentItem kind="sensitive" title="[사연을 보낼 때 필수] 민감정보 처리 (제23조)" checked={consents.sensitive} error={error} onChange={onChange}>
    <dl className="support-details">
      <div><dt>목적·항목</dt><dd>운영팀이 필요한 지원을 파악하는 데 건강·정신건강 등 민감한 내용이 포함될 수 있는 선택 사연을 이용해요.</dd></div>
      <div><dt>보유 기간</dt><dd>{RETENTION}</dd></div>
      <div><dt>거부할 권리</dt><dd>동의하지 않아도 사연 없이 신청할 수 있어요. 사연은 운영팀 확인에만 쓰고 신청 기관에는 보내지 않아요.</dd></div>
    </dl>
  </ConsentItem>;
}

function ConsentFields({ program, consents, errors, onChange }: {
  program: SupportProgram;
  consents: SupportConsents;
  errors: SupportConsentErrors;
  onChange: (kind: SupportConsentKind, value: boolean) => void;
}) {
  return <>
    <p><strong>{program.name}</strong> 신청 도움을 요청해요. 개인정보 보호법에 따라 항목별로 동의해 주세요.</p>
    <fieldset className="support-choices support-consents">
      <legend>신청에 필요한 동의</legend>
      <ConsentItem kind="collection" title="[필수] 개인정보 수집·이용 (제15조)" checked={consents.collection} error={errors.collection} onChange={onChange}>
        <dl className="support-details">
          <div><dt>목적</dt><dd>운영팀의 접수, 연락, 자격 확인, 신청 지원, 신청 현황과 동의 관리</dd></div>
          <div><dt>항목</dt><dd>{COLLECTION_ITEMS}</dd></div>
          <div><dt>보유·이용 기간</dt><dd>{RETENTION}</dd></div>
          <div><dt>거부할 권리</dt><dd>동의를 거부할 수 있어요. 거부하면 운영팀에 요청할 수 없고 공식 안내에서 직접 신청할 수 있어요.</dd></div>
        </dl>
      </ConsentItem>
      <ConsentItem kind="sharing" title="[필수] 개인정보 제3자 제공 (제17조)" checked={consents.sharing} error={errors.sharing} onChange={onChange}>
        <dl className="support-details">
          <div><dt>받는 곳</dt><dd>{program.recipient} (신청 기관·연계 기관)</dd></div>
          <div><dt>목적</dt><dd>해당 제도의 지원 자격 확인, 신청 또는 지역 서비스 연계</dd></div>
          <div><dt>제공 항목</dt><dd>{SHARING_ITEMS}</dd></div>
          <div><dt>기관의 보유 기간</dt><dd>{SHARING_RETENTION}</dd></div>
          <div><dt>거부할 권리</dt><dd>동의를 거부할 수 있어요. 거부하면 운영팀의 신청·연계 요청을 보낼 수 없고 직접 신청할 수 있어요.</dd></div>
        </dl>
        <p>운영팀 접수만으로 기관에 정보가 전달되지는 않아요. 운영팀이 실제 기관명과 항목, 기간을 안내하고 별도 동의를 받은 뒤 제공해요.</p>
      </ConsentItem>
      <SensitiveConsent consents={consents} error={errors.sensitive} onChange={onChange}/>
    </fieldset>
    <fieldset className="support-choices support-consents support-consents--optional">
      <legend>선택 동의</legend>
      <ConsentItem kind="notifications" title="[선택] 진행 알림 받기" checked={consents.notifications} onChange={onChange}>
        <p>운영팀이 신청 상태를 문자나 입력한 이메일로 알려 드려요. 알림에는 휴대전화 또는 이메일을 사용하고, 완료·취소 또는 동의 철회 시 발송을 끝내요. 연락처 보관 기간은 수집·이용 동의와 같아요. 알림을 받지 않아도 신청할 수 있어요.</p>
      </ConsentItem>
    </fieldset>
    <details className="support-inline-policy">
      <summary>개인정보 처리방침 보기</summary>
      <PrivacyPolicy/>
    </details>
    <OfficialLink program={program}/>
  </>;
}

const FIELD_LABELS: Record<SupportField, string> = {
  name: '이름',
  birthDate: '생년월일',
  phone: '휴대전화',
  email: '이메일 (선택)',
  region: '시·도',
  district: '시·군·구',
  contactTime: '연락 가능한 시간',
  story: '필요한 도움이나 사연 (선택)',
};

function focusFirstError(form: HTMLFormElement, errors: SupportFieldErrors | SupportConsentErrors) {
  for (const key of Object.keys(errors)) {
    const control = form.elements.namedItem(key);
    if (control instanceof HTMLElement && !control.matches(':disabled')) {
      control.focus();
      return;
    }
  }
}

function ApplicationFields({ draft, errors, consents, consentError, program, onChange, onConsent }: {
  draft: SupportDraft;
  errors: SupportFieldErrors;
  consents: SupportConsents;
  consentError?: string;
  program: SupportProgram;
  onChange: (field: SupportField, value: string) => void;
  onConsent: (kind: SupportConsentKind, value: boolean) => void;
}) {
  const id = useId();
  const fieldId = (field: SupportField) => id + '-' + field;
  const control = (field: SupportField, hasHint = false) => ({
    id: fieldId(field),
    name: field,
    value: draft[field],
    'aria-invalid': Boolean(errors[field]),
    'aria-describedby': [
      hasHint ? fieldId(field) + '-hint' : '',
      errors[field] ? fieldId(field) + '-error' : '',
    ].filter(Boolean).join(' ') || undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(field, event.target.value),
  });
  const row = (field: SupportField, input: ReactNode, hint?: ReactNode) => (
    <div className="support-field">
      <label htmlFor={fieldId(field)}>{FIELD_LABELS[field]}</label>
      {hint && <p id={fieldId(field) + '-hint'} className="support-hint">{hint}</p>}
      {input}
      {errors[field] && <p id={fieldId(field) + '-error'} className="support-error" role="alert">{errors[field]}</p>}
      {field === 'birthDate' && errors.birthDate === SUPPORT_AGE_ERROR && <div className="support-underage">
        <a className="support-text-link" href="https://www.1388.go.kr/cco/YTOSP_SC_CCI_01" target="_blank" rel="noreferrer">청소년상담1388</a>
        <a className="support-text-link" href="#safety">안전 도움 보기</a>
        <OfficialLink program={program}/>
      </div>}
    </div>
  );
  return <div className="support-fields">
    <p className="support-hint">{SUPPORT_IDENTIFIER_WARNING}</p>
    {row('name', <input {...control('name')} type="text" autoComplete="name" maxLength={160} required/>)}
    {row('birthDate', <input {...control('birthDate')} type="date" autoComplete="bday" min="0001-01-01" required/>)}
    {row('phone', <input {...control('phone')} type="tel" autoComplete="tel" maxLength={30} required/>)}
    {row('email', <input {...control('email')} type="email" autoComplete="email" maxLength={254}/>)}
    {row('region', <select {...control('region')} autoComplete="address-level1" required>
      <option value="">시·도를 골라 주세요</option>
      {SUPPORT_REGIONS.map(region => <option key={region} value={region}>{region}</option>)}
    </select>)}
    {row('district', <input {...control('district', true)} type="text" autoComplete="address-level2" maxLength={40} readOnly={draft.region === '세종'} required/>,
      '시·군·구까지만 입력해 주세요. 예를 들어 성남시 분당구처럼 적어요.')}
    {row('contactTime', <select {...control('contactTime')} required>
      <option value="">시간대를 골라 주세요</option>
      {SUPPORT_CONTACT_TIMES.map(time => <option key={time.id} value={time.id}>{time.label}</option>)}
    </select>)}
    <div className="support-story">
      <SensitiveConsent consents={consents} error={consentError} onChange={onConsent}/>
      {row('story', <textarea {...control('story', true)} rows={4} disabled={!consents.sensitive}/>,
        '건강·정신건강 같은 민감한 내용이 들어갈 수 있어요. 동의한 뒤 필요한 내용만 500자까지 적어 주세요.')}
      <p className="support-hint">{supportCharacterCount(draft.story.trim())}/{SUPPORT_STORY_LIMIT}자</p>
      {draft.story && <button className="shop-secondary" type="button" onClick={() => onChange('story', '')}>사연 지우기</button>}
    </div>
  </div>;
}

function ReviewDetails({ program, draft: rawDraft, consents }: { program: SupportProgram; draft: SupportDraft; consents: SupportConsents }) {
  const draft = normalizeSupportDraft(rawDraft);
  const details = [
    ['지원 제도', program.name],
    [FIELD_LABELS.name, draft.name],
    [FIELD_LABELS.birthDate, draft.birthDate],
    [FIELD_LABELS.phone, draft.phone],
    [FIELD_LABELS.email, draft.email],
    ['시·도와 시·군·구', draft.region + ' ' + draft.district],
    [FIELD_LABELS.contactTime, SUPPORT_CONTACT_TIMES.find(time => time.id === draft.contactTime)?.label],
    [FIELD_LABELS.story, draft.story],
    ['개인정보 수집·이용 및 제3자 제공', '동의'],
    ['민감정보 처리', draft.story ? '동의' : '사연 미입력'],
    ['진행 알림', consents.notifications ? '받을게요' : '받지 않을게요'],
  ];
  return <>
    <dl className="support-details support-summary">{details.map(([label, value]) => <div key={label}>
      <dt>{label}</dt><dd>{value || '입력하지 않았어요'}</dd>
    </div>)}</dl>
    <OfficialLink program={program}/>
  </>;
}

type HistoryAction = { id: string; kind: 'cancel' | 'withdraw' };
const ACTION_LABELS = { cancel: '신청 취소', withdraw: '동의 철회 및 정보 삭제 요청' };
const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium' });

function ApplicationHistory({ rows, loading, error, action, actionError, actionBusy, onAction, onConfirm, onDismiss, onRefresh }: {
  rows: SupportReceipt[];
  loading: boolean;
  error: string;
  action: HistoryAction | null;
  actionError: string;
  actionBusy: boolean;
  onAction: (action: HistoryAction) => void;
  onConfirm: () => void;
  onDismiss: () => void;
  onRefresh: () => void;
}) {
  const dismiss = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (action) dismiss.current?.focus(); }, [action]);
  const locked = loading || actionBusy;
  return <div aria-busy={loading}>
    <p>운영팀의 처리 상태예요. 기관의 심사 결과는 해당 기관에서 확인해 주세요.</p>
    <button type="button" className="shop-secondary" disabled={locked} onClick={onRefresh}>{error ? '다시 불러오기' : '새로고침'}</button>
    {loading && <p role="status">신청 현황을 불러오고 있어요.</p>}
    {error && <p className="support-error" role="alert">{error}</p>}
    {!loading && !error && !rows.length && <p>아직 신청 내역이 없어요.</p>}
    <ul className="support-list support-history">{rows.map(row => {
      const pending = action?.id === row.id ? action : null;
      return <li className="support-card" key={row.id}>
        <span className="support-status">{SUPPORT_STATUS_LABELS[row.status]}</span>
        <h3>{findSupportProgram(row.program_id)?.name ?? '지원 제도 신청'}</h3>
        <p>접수 {dateLabel.format(new Date(row.created_at))}</p>
        {pending ? <div className="support-confirm" role="group" aria-label={ACTION_LABELS[pending.kind]}>
          <p>{pending.kind === 'cancel'
            ? '운영팀의 지원을 중단해요. 신청 정보도 지우려면 동의 철회를 선택해 주세요.'
            : '진행 중인 지원을 중단하고 신청 건에서 계정 연결과 입력한 정보를 지워요. 지운 정보는 다시 볼 수 없어요.'}</p>
          {actionError && <p className="support-error" role="alert">{actionError}</p>}
          <div className="support-actions">
            <button className="shop-secondary" type="button" ref={dismiss} disabled={locked} onClick={onDismiss}>돌아가기</button>
            <button className="primary-button" type="button" disabled={locked} onClick={onConfirm}>
              {actionBusy ? '처리 중…' : actionError ? '다시 시도' : ACTION_LABELS[pending.kind]}
            </button>
          </div>
        </div> : <div className="support-actions">
          {canCancelSupport(row.status) && <button className="shop-secondary" type="button" disabled={locked || !!action}
            onClick={() => onAction({ id: row.id, kind: 'cancel' })}>{ACTION_LABELS.cancel}</button>}
          <button className="shop-secondary" type="button" disabled={locked || !!action}
            onClick={() => onAction({ id: row.id, kind: 'withdraw' })}>{ACTION_LABELS.withdraw}</button>
        </div>}
      </li>;
    })}</ul>
  </div>;
}

const SERVER_FIELD_ERRORS: Record<string, [SupportField, string] | undefined> = {
  support_name: ['name', '이름을 확인해 주세요.'],
  support_birth_date: ['birthDate', '올바른 생년월일을 입력해 주세요.'],
  support_min_age: ['birthDate', SUPPORT_AGE_ERROR],
  support_phone: ['phone', '휴대전화 번호를 확인해 주세요.'],
  support_email: ['email', '이메일 주소를 확인해 주세요.'],
  support_region: ['region', '시·도를 골라 주세요.'],
  support_district: ['district', '시·군·구 이름을 확인해 주세요.'],
  support_contact_time: ['contactTime', '연락 가능한 시간을 골라 주세요.'],
  support_story: ['story', '사연이 500자 이내이고 고유식별정보가 없는지 확인해 주세요.'],
};

function supportClient() {
  const client = getAuthClient();
  if (dataScope() !== 'account' || !client) throw new Error('Support session unavailable');
  return client;
}

function SupportFlow({ friend, scope }: { friend: Friend; scope: DataScope }) {
  const [step, setStep] = useState<Step>('intro');
  const [filters, setFilters] = useState<MatchFilters>({ needs: [], ageGroup: '', region: '' });
  const [program, setProgram] = useState<SupportProgram | null>(null);
  const [draft, setDraft] = useState<SupportDraft>(EMPTY_SUPPORT_DRAFT);
  const [consents, setConsents] = useState<SupportConsents>(EMPTY_SUPPORT_CONSENTS);
  const [fieldErrors, setFieldErrors] = useState<SupportFieldErrors>({});
  const [consentErrors, setConsentErrors] = useState<SupportConsentErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [retryConflict, setRetryConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [rows, setRows] = useState<SupportReceipt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [action, setAction] = useState<HistoryAction | null>(null);
  const [actionError, setActionError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);
  const historyRead = useRef(0);
  const headingId = useId();
  const [title, guide] = STEPS[step];
  const simulated = scope !== 'account';

  useEffect(() => { heading.current?.focus(); }, [step]);

  function show(next: Step) {
    setStep(next);
    setFieldErrors({});
    setConsentErrors({});
    setSubmitError('');
    setRetryConflict(false);
    setAction(null);
    setActionError('');
    setFeedback('');
  }

  function chooseProgram(selected: SupportProgram) {
    if (selected.id !== program?.id) setConsents(previous => ({ ...previous, sharing: false }));
    setProgram(selected);
    setDraft(previous => previous.region || !filters.region ? previous : {
      ...previous, region: filters.region, district: filters.region === '세종' ? '세종시' : previous.district,
    });
    show('consent');
  }

  function changeField(field: SupportField, value: string) {
    setDraft(previous => {
      if (field === 'region' && previous.region !== value) {
        return { ...previous, region: value, district: value === '세종' ? '세종시' : '' };
      }
      return { ...previous, [field]: value };
    });
    setFieldErrors(previous => ({ ...previous, [field]: undefined, ...(field === 'region' ? { district: undefined } : {}) }));
    if (field === 'story' && !value.trim()) setConsentErrors(previous => ({ ...previous, sensitive: undefined }));
  }

  function changeConsent(kind: SupportConsentKind, value: boolean) {
    setConsents(previous => ({ ...previous, [kind]: value }));
    setConsentErrors(previous => ({ ...previous, [kind]: undefined }));
  }

  function continueFromConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateSupportConsents(consents, draft.story);
    if (Object.keys(errors).length) {
      setConsentErrors(errors);
      focusFirstError(event.currentTarget, errors);
      return;
    }
    show('form');
  }

  function continueFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = validateSupportDraft(draft);
    const agreements = validateSupportConsents(consents, draft.story);
    const errors = { ...fields, ...agreements };
    if (Object.keys(errors).length) {
      setFieldErrors(fields);
      setConsentErrors(agreements);
      focusFirstError(event.currentTarget, errors);
      return;
    }
    show('review');
  }

  async function loadHistory() {
    const read = ++historyRead.current;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      if (dataScope() !== scope) throw new Error('Support scope changed');
      let records: SupportReceipt[];
      if (simulated) {
        records = listLocalSupportApplications();
      } else {
        const { data, error } = await supportClient().from('onestep_support_applications')
          .select('id,program_id,status,created_at,closed_at').order('created_at', { ascending: false })
          .abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
        records = data ?? [];
      }
      if (historyRead.current === read) setRows(records);
    } catch {
      if (historyRead.current === read) setHistoryError('신청 현황을 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.');
    } finally {
      if (historyRead.current === read) setHistoryLoading(false);
    }
  }

  function openHistory() {
    show('history');
    void loadHistory();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!program || inFlight.current || retryConflict) return;
    const fields = validateSupportDraft(draft);
    const agreements = validateSupportConsents(consents, draft.story);
    if (Object.keys(fields).length || Object.keys(agreements).length) {
      show('form');
      setFieldErrors(fields);
      setConsentErrors(agreements);
      return;
    }

    const release = beginStorageOperation();
    inFlight.current = true;
    setBusy(true);
    setSubmitError('');
    try {
      if (dataScope() !== scope) throw new Error('Support scope changed');
      const id = requestId.current ??= crypto.randomUUID();
      if (simulated) {
        submitLocalSupportApplication(id, program.id, draft, consents);
      } else {
        const { programId, form, consents: agreement } = prepareSupportSubmission(program.id, draft, consents);
        const { data, error } = await supportClient().rpc('onestep_support_submit', {
          p_id: id, p_program_id: programId, p_form: form, p_consents: agreement,
        }).abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
        if (data !== id) throw new Error('Support receipt unavailable');
      }
      requestId.current = null;
      setDraft(EMPTY_SUPPORT_DRAFT);
      setConsents(EMPTY_SUPPORT_CONSENTS);
      setProgram(null);
      setFilters({ needs: [], ageGroup: '', region: '' });
      openHistory();
      setFeedback(simulated ? '이 기기에 테스트 신청을 저장했어요.' : '운영팀에 지원 요청을 보냈어요.');
    } catch (error) {
      const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
      const fieldError = Object.hasOwn(SERVER_FIELD_ERRORS, code) ? SERVER_FIELD_ERRORS[code] : undefined;
      if (fieldError) {
        show('form');
        setFieldErrors({ [fieldError[0]]: fieldError[1] });
      } else if (code === 'support_sensitive') {
        show('form');
        setConsentErrors({ sensitive: '사연을 보내려면 민감정보 처리에 동의해 주세요.' });
      } else if (code === 'support_retry_conflict') {
        setRetryConflict(true);
        setSubmitError('이미 접수된 내용과 지금 확인한 내용이 달라요. 내 신청 현황에서 접수 여부를 먼저 확인해 주세요.');
      } else {
        setSubmitError('접수를 확인하지 못했어요. 입력한 내용은 이 화면에 남아 있어요. 잠시 뒤 다시 제출해 주세요.');
      }
    } finally {
      release();
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function changeApplication() {
    if (!action || inFlight.current) return;
    const release = beginStorageOperation();
    inFlight.current = true;
    setBusy(true);
    setActionError('');
    try {
      if (dataScope() !== scope) throw new Error('Support scope changed');
      if (simulated) {
        if (action.kind === 'cancel') cancelLocalSupportApplication(action.id);
        else eraseLocalSupportApplication(action.id);
      } else {
        const rpc = action.kind === 'cancel' ? 'onestep_support_cancel' : 'onestep_support_withdraw';
        const { error } = await supportClient().rpc(rpc, { p_id: action.id }).abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
      }
      setAction(null);
      setRows(previous => action.kind === 'withdraw'
        ? previous.filter(row => row.id !== action.id)
        : previous.map(row => row.id === action.id ? { ...row, status: 'cancelled' } : row));
      setFeedback(action.kind === 'cancel' ? '신청을 취소했어요.' : '동의를 철회하고 신청 정보를 지웠어요.');
      heading.current?.focus();
      void loadHistory();
    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error && error.message === 'support_cancel_unavailable') {
        setAction(null);
        setFeedback('먼저 바뀐 신청 상태를 확인해 주세요.');
        heading.current?.focus();
        void loadHistory();
      } else {
        setActionError('요청을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      }
    } finally {
      release();
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="settings-content support support-flow">
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{title}</p>
    <section className="settings-card support-step" aria-labelledby={headingId}>
      <header className="support-guide">
        <Image className="support-avatar" src={'/characters/' + friend.id + '.webp'} alt="" width={48} height={48} unoptimized/>
        <div>
          <h2 ref={heading} id={headingId} tabIndex={-1}>{title}</h2>
          <p><strong>{friend.name}</strong>: {guide}</p>
        </div>
      </header>
      {simulated && <p className="support-test">{TEST_NOTICE}</p>}
      {feedback && <p className="support-feedback" role="status">{feedback}</p>}

      {step === 'intro' && <>
        <p>정부 시스템에 직접 신청하려면 본인인증이 필요해요. 동의한 뒤 이 화면에서 제출하면 앱 운영팀이 신청 정보를 받아요.</p>
        <p>운영팀이 연락해서 지원 자격을 함께 확인하고 신청을 도와요. 대리 신청을 허용하는 기관은 위임을 확인한 뒤 대신 신청할 수 있어요.</p>
        <p>지금 많이 힘들다면 <a className="support-text-link" href="#safety">안전 도움 보기 (109 · 1577-0199)</a>를 먼저 살펴봐요.</p>
        <div className="support-actions">
          <button className="primary-button" type="button" onClick={() => show('match')}>도움 찾아보기</button>
          <button className="shop-secondary" type="button" onClick={openHistory}>내 신청 현황</button>
        </div>
      </>}

      {step === 'match' && <>
        <MatchPrograms filters={filters} onChange={setFilters} onSelect={chooseProgram}/>
        <button className="shop-secondary" type="button" onClick={() => show('intro')}>처음으로</button>
      </>}

      {step === 'consent' && program && <form noValidate onSubmit={continueFromConsent}>
        <ConsentFields program={program} consents={consents} errors={consentErrors} onChange={changeConsent}/>
        <div className="support-actions">
          <button className="shop-secondary" type="button" onClick={() => show('match')}>이전</button>
          <button className="primary-button" type="submit">신청서 작성하기</button>
        </div>
      </form>}

      {step === 'form' && program && <form noValidate onSubmit={continueFromForm}>
        <ApplicationFields draft={draft} errors={fieldErrors} consents={consents} consentError={consentErrors.sensitive}
          program={program} onChange={changeField} onConsent={changeConsent}/>
        <div className="support-actions">
          <button className="shop-secondary" type="button" onClick={() => show('consent')}>이전</button>
          <button className="primary-button" type="submit">신청 내용 확인하기</button>
        </div>
      </form>}

      {step === 'review' && program && <form onSubmit={submit} aria-busy={busy}>
        <ReviewDetails program={program} draft={draft} consents={consents}/>
        {submitError && <p className="support-error" role="alert">{submitError}</p>}
        <div className="support-actions">
          <button className="shop-secondary" type="button" disabled={busy} onClick={() => show('form')}>입력 내용 수정</button>
          {retryConflict ? <>
            <button className="shop-secondary" type="button" onClick={() => { setStep('history'); void loadHistory(); }}>내 신청 현황</button>
            <button className="shop-secondary" type="button" onClick={() => { requestId.current = null; show('form'); }}>새 요청 준비하기</button>
          </> : <button className="primary-button" type="submit" disabled={busy}>
            {busy ? '보내는 중…' : submitError ? '다시 제출하기' : simulated ? '테스트 신청 저장' : '운영팀에 요청 보내기'}
          </button>}
        </div>
      </form>}

      {step === 'history' && <>
        <ApplicationHistory rows={rows} loading={historyLoading} error={historyError} action={action}
          actionError={actionError} actionBusy={busy} onRefresh={loadHistory} onConfirm={changeApplication}
          onAction={selected => { setActionError(''); setFeedback(''); setAction(selected); }}
          onDismiss={() => { setAction(null); heading.current?.focus(); }}/>
        <div className="support-actions">
          <button className="shop-secondary" type="button" disabled={busy} onClick={() => retryConflict ? setStep('review') : show('intro')}>
            {retryConflict ? '신청 내용으로 돌아가기' : '처음으로'}
          </button>
        </div>
      </>}
    </section>
    {step === 'intro' && <OfficialPrograms/>}
  </div>;
}

export default function SupportPrograms({ friend }: { friend?: { id: CompanionId; name: string } | null }) {
  const scope = dataScope();
  return <SupportFlow key={scope} scope={scope} friend={friend ?? DEFAULT_FRIEND}/>;
}

export function PrivacyPolicy() {
  return <article className="settings-content support-privacy">
    <section className="settings-card">
      <h2>지원 제도 신청 도우미 개인정보 처리방침</h2>
      <p>시행일 <time dateTime="2026-11-19">2026년 11월 19일</time> · 동의문 버전 {SUPPORT_CONSENT_VERSION}</p>
      <p>이 방침은 지원 제도 신청 도우미에서 운영팀에 보내는 지원 요청에 적용돼요.</p>
    </section>
    <section className="settings-card">
      <h2>1. 처리 목적과 항목</h2>
      <p>지원 요청을 접수하고 연락해 자격을 확인하며, 신청과 기관 연계, 처리 현황 확인, 동의와 철회 처리를 위해 개인정보를 이용해요.</p>
      <p>{COLLECTION_ITEMS}를 처리해요. 선택 사연에 건강·정신건강 등 민감정보가 들어갈 수 있어 별도 동의를 받고 운영팀이 필요한 지원을 확인하는 데 사용해요. 진행 알림에 동의한 경우에만 입력한 휴대전화나 이메일로 상태를 안내해요.</p>
      <p>추천에 고른 필요 분야와 연령대는 기기에서만 사용해요. 작성한 신청서는 제출 전까지 화면에만 남아요. 테스트 신청은 이 기기에 제도와 처리 상태 등 모의 접수 이력만 저장해요. {SUPPORT_IDENTIFIER_WARNING}</p>
    </section>
    <section className="settings-card">
      <h2>2. 보유 기간과 파기</h2>
      <p>{RETENTION} 계정 연결을 끊은 접수번호·상태·일시와 동의 및 철회 이력은 완료·취소일부터 1년 동안 보관한 뒤 삭제해요.</p>
      <p>보유 기간이 끝난 전자 기록은 서비스 데이터베이스에서 삭제해요. 법에서 별도 보관을 요구하는 항목과 기간이 있으면 이를 안내하고 분리해 보관해요.</p>
    </section>
    <section className="settings-card">
      <h2>3. 개인정보 제3자 제공</h2>
      <p>받는 곳은 사용자와 확인한 신청 기관이나 연계 기관이에요. 기관이 자격 확인, 신청 또는 연계를 처리하는 데 필요한 경우에 {SHARING_ITEMS}을 제공해요.</p>
      <p>{SHARING_RETENTION} 제공 전 실제 기관명, 목적, 항목과 보유 기간을 안내하고 별도 동의를 받아요. 동의를 거부하면 운영팀의 기관 신청·연계는 이용할 수 없어요. 공식 사이트에서 직접 신청할 수 있어요.</p>
      <p>선택 사연은 운영팀만 확인해요. 신청 철회 전에 이미 제공된 정보는 운영팀에 연락해 기관의 처리 중단과 삭제를 요청할 수 있어요.</p>
    </section>
    <section className="settings-card">
      <h2>4. 개인정보 처리 위탁</h2>
      <p>수탁자 Supabase · 위탁 업무는 로그인 세션 확인과 신청·동의 기록 데이터베이스 호스팅 및 운영이에요.</p>
      <p>운영팀은 위탁 업무와 접근 범위를 계약으로 정하고 처리 상황을 점검해요. 국외 이전이 발생하는 경우 이전 국가, 받는 곳, 항목, 목적, 이전 시점·방법, 보유 기간과 거부 방법을 별도로 알려 드려요.</p>
    </section>
    <section className="settings-card">
      <h2>5. 권리와 행사 방법</h2>
      <p>정보 열람, 정정, 삭제, 처리 정지와 동의 철회를 요청할 수 있어요. 앱의 <a className="support-text-link" href="#support">지원 제도</a>에서 ‘내 신청 현황’을 열면 신청 취소와 동의 철회 및 정보 삭제를 요청할 수 있어요.</p>
      <p>열람·정정, 알림 동의 철회, 기관에 이미 제공된 기록의 조치 요청은 아래 개인정보 보호책임자 연락처로 보내 주세요. 요청을 처리하기 위해 최소한의 정보로 본인이나 정당한 대리인인지 확인해요.</p>
    </section>
    <section className="settings-card">
      <h2>6. 안전성 확보 조치</h2>
      <p>전송 구간을 암호화하고 로그인과 계정별 접근 제어로 신청 정보를 보호해요. 지정된 운영 담당자만 업무에 필요한 신청에 접근하며, 서버가 입력과 동의를 확인한 뒤 저장하거나 상태를 변경해요.</p>
    </section>
    <section className="settings-card">
      <h2>7. 개인정보 보호책임자</h2>
      <p><strong>[출시 전 운영팀 기입]</strong> 운영 주체, 개인정보 보호책임자 성명·직책, 개인정보 문의 이메일 및 전화번호</p>
    </section>
    <section className="settings-card">
      <h2>8. 변경 고지</h2>
      <p>처리방침이 바뀌면 적용일과 바뀐 내용을 앱에서 안내해요. 동의가 필요한 내용은 새 동의를 받아요.</p>
    </section>
  </article>;
}
