import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';

const support = loadTs(new URL('../src/app/support.ts', import.meta.url));
const apply = loadTs(new URL('../src/app/support-apply.ts', import.meta.url));
const storage = loadTs(new URL('../src/app/app-storage.ts', import.meta.url));
const adult = Object.freeze({
  ...apply.EMPTY_SUPPORT_DRAFT,
  name: '테스트 이름',
  birthDate: '2000-02-29',
  phone: '010-0000-0000',
  region: '경기',
  district: '성남시 분당구',
  contactTime: 'evening',
});
const consent = Object.freeze({ ...apply.EMPTY_SUPPORT_CONSENTS, collection: true, sharing: true });
const today = '2026-11-19';

test('validates all required fields, optional contact, Korean age and real calendar dates', () => {
  assert.deepEqual(apply.validateSupportDraft(adult, today), {});
  assert.deepEqual(Object.keys(apply.validateSupportDraft(apply.EMPTY_SUPPORT_DRAFT, today)), [
    'name', 'birthDate', 'phone', 'region', 'district', 'contactTime',
  ]);
  assert.deepEqual(apply.validateSupportDraft({ ...adult, birthDate: '2007-11-19' }, today), {});
  assert.equal(apply.validateSupportDraft({ ...adult, birthDate: '2007-11-20' }, today).birthDate, apply.SUPPORT_AGE_ERROR);
  assert.equal(apply.validateSupportDraft({ ...adult, birthDate: '2008-02-29' }, '2027-02-28').birthDate, apply.SUPPORT_AGE_ERROR);
  assert.deepEqual(apply.validateSupportDraft({ ...adult, birthDate: '2008-02-29' }, '2027-03-01'), {});
  for (const birthDate of ['0000-01-01', '2007-02-29', '2000-04-31', '2026-11-20', 'tomorrow']) {
    assert.match(apply.validateSupportDraft({ ...adult, birthDate }, today).birthDate, /올바른/, birthDate);
  }
  const invalidFields = {
    name: '이름123', phone: '010-000-0000', email: 'test@example', region: '미정',
    district: '성남시 분당구 42', contactTime: 'midnight', story: '가'.repeat(501),
  };
  for (const [field, value] of Object.entries(invalidFields)) {
    assert.ok(apply.validateSupportDraft({ ...adult, [field]: value }, today)[field], field);
  }
  assert.deepEqual(apply.validateSupportDraft({ ...adult, story: '🌱'.repeat(500), region: '세종', district: '세종시' }, today), {});
  assert.ok(apply.validateSupportDraft({ ...adult, region: '세종' }, today).district);
  assert.equal(apply.normalizeSupportDraft({ ...adult, phone: '+82 10 0000-0000' }).phone, '01000000000');
});

test('blocks recognizable unique identifiers in optional fields', () => {
  for (const identifier of ['000000-0000000', '0000000000000', '００００００—０００００００', '00-00-000000-00',
    'A00000000', 'A000B0000', 'AA0000000']) {
    assert.equal(apply.validateSupportDraft({ ...adult, story: identifier }, today).story, apply.SUPPORT_IDENTIFIER_WARNING);
  }
  assert.equal(apply.validateSupportDraft({ ...adult, email: 'a00000000@example.com' }, today).email, apply.SUPPORT_IDENTIFIER_WARNING);
});

test('treats any nonempty story as sensitive and keeps progress notifications optional', () => {
  assert.deepEqual(Object.keys(apply.validateSupportConsents(apply.EMPTY_SUPPORT_CONSENTS, '')), ['collection', 'sharing']);
  assert.deepEqual(apply.validateSupportConsents(consent, '  \n'), {});
  assert.ok(apply.validateSupportConsents(consent, '도움이 필요해요.').sensitive);
  assert.deepEqual(apply.validateSupportConsents({ ...consent, sensitive: true }, '도움이 필요해요.'), {});
  assert.throws(() => apply.prepareSupportSubmission('mind-center', { ...adult, story: '상담을 받고 싶어요.' }, consent));
  const prepared = apply.prepareSupportSubmission('mind-center', { ...adult, email: '  ', story: '   ' }, { ...consent, sensitive: true });
  assert.equal(prepared.form.phone, '01000000000');
  assert.equal(prepared.form.email, '');
  assert.deepEqual(prepared.consents, { version: apply.SUPPORT_CONSENT_VERSION, ...consent });
  const withStory = apply.prepareSupportSubmission('mind-center', { ...adult, story: ' 도움이 필요해요. ' }, {
    ...consent, sensitive: true, notifications: true,
  });
  assert.equal(withStory.form.story, '도움이 필요해요.');
  assert.equal(withStory.consents.sensitive, true);
  assert.equal(withStory.consents.notifications, true);
  assert.throws(() => apply.prepareSupportSubmission('invented-benefit', adult, consent));
});

test('uses needs, area and age to suggest official resources without ruling on eligibility', () => {
  const ids = (...args) => support.recommendSupportPrograms(...args).map(program => program.id);
  assert.equal(ids(['mind'], '19-39', '서울')[0], 'seoul-youth-mind');
  assert.notEqual(ids(['mind'], '40-64', '서울')[0], 'seoul-youth-mind');
  assert.ok(ids(['mind'], '40-64', '서울').includes('seoul-youth-mind'), 'age ranking leaves official exceptions visible');
  assert.ok(!ids(['mind'], '19-39', '부산').includes('seoul-youth-mind'));
  assert.equal(ids(['connection'], '', '')[0], 'mind-center');
  assert.equal(ids(['living', 'housing', 'work'], '', '')[0], 'emergency-welfare');
  assert.ok(ids(['work'], '', '').includes('employment-support'));
  assert.ok(ids(['study'], '', '').includes('national-scholarship'));
  assert.ok(ids(['study'], '', '').includes('gov24-benefits'), 'official search remains available');
});

test('local submission and retries save only a receipt, cancel it, and erase it in the current scope', async t => {
  const values = new Map();
  t.mock.method(globalThis, 'fetch', async () => new Response('{"ok":true}'));
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });
  const previousMode = process.env.NODE_ENV;
  const previousTools = process.env.NEXT_PUBLIC_DEVELOPER_TOOLS;
  t.after(() => {
    storage.setAccountScope(null);
    if (localStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', localStorageDescriptor);
    else delete globalThis.localStorage;
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    if (previousTools === undefined) delete process.env.NEXT_PUBLIC_DEVELOPER_TOOLS;
    else process.env.NEXT_PUBLIC_DEVELOPER_TOOLS = previousTools;
  });
  process.env.NODE_ENV = 'production';
  delete process.env.NEXT_PUBLIC_DEVELOPER_TOOLS;
  const id = '00000000-0000-4000-8000-000000000001';
  const draft = Object.freeze({ ...adult, email: 'test@example.com', story: '테스트 사연' });
  const consents = { ...consent, sensitive: true };
  assert.equal(storage.dataScope(), 'real');
  assert.throws(() => apply.submitLocalSupportApplication(id, 'mind-center', draft, consent));
  assert.equal(values.size, 0);
  apply.submitLocalSupportApplication(id, 'mind-center', draft, consents);
  apply.submitLocalSupportApplication(id, 'mind-center', draft, consents);
  const [receipt] = apply.listLocalSupportApplications();
  assert.deepEqual(apply.listLocalSupportApplications(), [receipt]);
  assert.deepEqual(Object.keys(receipt).sort(), ['closed_at', 'created_at', 'id', 'program_id', 'status']);
  assert.equal(receipt.status, 'received');
  assert.equal(receipt.closed_at, null);
  for (const field of ['name', 'birthDate', 'phone', 'email', 'region', 'district', 'story']) {
    assert.ok(![...values.values()].join('').includes(draft[field]), field);
  }

  process.env.NODE_ENV = 'development';
  assert.equal(storage.dataScope(), 'preview');
  assert.deepEqual(apply.listLocalSupportApplications(), []);
  apply.submitLocalSupportApplication(id, 'bokjiro-find', adult, consent);
  await storage.setDeveloperMode(true, '1234');
  assert.equal(storage.dataScope(), 'test');
  assert.deepEqual(apply.listLocalSupportApplications(), []);
  apply.submitLocalSupportApplication(id, 'gov24-benefits', adult, consent);
  apply.cancelLocalSupportApplication(id);
  const [cancelled] = apply.listLocalSupportApplications();
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(cancelled.closed_at);
  apply.cancelLocalSupportApplication(id);
  assert.deepEqual(apply.listLocalSupportApplications(), [cancelled]);
  apply.eraseLocalSupportApplication(id);
  assert.deepEqual(apply.listLocalSupportApplications(), []);

  storage.setDeveloperMode(false);
  assert.equal(apply.listLocalSupportApplications()[0].program_id, 'bokjiro-find');
  storage.setAccountScope('00000000-0000-4000-8000-000000000002');
  assert.equal(storage.dataScope(), 'account');
  assert.throws(() => apply.listLocalSupportApplications(), /서버/);
  assert.throws(() => apply.submitLocalSupportApplication(id, 'mind-center', draft, consents), /서버/);
  assert.throws(() => apply.cancelLocalSupportApplication(id), /서버/);
  assert.throws(() => apply.eraseLocalSupportApplication(id), /서버/);
  storage.setAccountScope(null);
  process.env.NODE_ENV = 'production';
  assert.deepEqual(apply.listLocalSupportApplications(), [receipt]);
});
