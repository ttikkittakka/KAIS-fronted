import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTs } from './helpers/load-ts.mjs';

const { testOpenAIConnection, CONNECTION_MODEL } = loadTs(new URL('../src/lib/openai/connection.ts', import.meta.url));
const env = { OPENAI_API_KEY: 'synthetic-test-key-never-a-real-secret' };
const completed = text => new Response(JSON.stringify({ status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }));

test('실행 의사 또는 키가 없으면 네트워크를 사용하지 않는다', async () => {
  const request = async () => { assert.fail('외부 호출 금지'); };
  assert.equal((await testOpenAIConnection({}, { env, request })).status, 'not_run');
  assert.equal((await testOpenAIConnection({ execute: true }, { env: {}, request })).errorCode, 'OPENAI_API_KEY_MISSING');
  assert.equal((await testOpenAIConnection({ execute: true }, { env: { OPENAI_API_KEY: 'bad\nkey' }, request })).errorCode, 'OPENAI_KEY_HEADER_UNSAFE');
});

test('예시 문자열·프로젝트 ID·헤더에 넣을 수 없는 문자를 호출 전에 구분한다', async () => {
  const request = async () => { assert.fail('외부 호출 금지'); };
  for (const [key, expected] of [['your_openai_api_key', 'OPENAI_API_KEY_PLACEHOLDER'],
    ['<발급받은 키>', 'OPENAI_API_KEY_PLACEHOLDER'], ['sk-...', 'OPENAI_API_KEY_PLACEHOLDER'],
    ['proj_synthetic123', 'OPENAI_PROJECT_ID_NOT_API_KEY'], ['한글설명', 'OPENAI_KEY_HEADER_UNSAFE'],
    ['  ', 'OPENAI_API_KEY_MISSING']]) {
    assert.equal((await testOpenAIConnection({ execute: true }, { env: { OPENAI_API_KEY: key }, request })).errorCode, expected);
  }
});

test('접두어나 길이로 키를 거부하지 않고 유효성은 서버 응답으로 판단한다', async () => {
  for (const key of ['x', 'future-prefix-' + 'a'.repeat(400), 'sk-proj-synthetic', 'sk-svcacct-synthetic']) {
    let calls = 0;
    const result = await testOpenAIConnection({ execute: true }, { env: { OPENAI_API_KEY: key }, request: async () => {
      calls++;
      return new Response('인증 실패', { status: 401 });
    } });
    assert.equal(calls, 1);
    assert.equal(result.errorCode, 'OPENAI_AUTHENTICATION_FAILED');
  }
});

test('명시적으로 실행하면 가상 기록으로 한 번 호출하고 결과 본문을 반환하지 않는다', async () => {
  let calls = 0;
  const result = await testOpenAIConnection({ execute: true }, { env, request: async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, `Bearer ${env.OPENAI_API_KEY}`);
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.equal(body.model, CONNECTION_MODEL);
    assert.equal(JSON.parse(body.input).synthetic, true);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.tools, undefined);
    return completed('{"connection":"ok"}');
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: 'success', model: CONNECTION_MODEL, errorCode: null });
});

test('HTTP 오류와 네트워크 예외는 비밀정보 없는 코드만 반환하며 재시도하지 않는다', async () => {
  for (const [status, code] of [[401, 'OPENAI_AUTHENTICATION_FAILED'], [403, 'OPENAI_PERMISSION_DENIED'],
    [404, 'OPENAI_MODEL_UNAVAILABLE'], [429, 'OPENAI_RATE_LIMITED'], [500, 'OPENAI_UPSTREAM_ERROR'], [400, 'OPENAI_REQUEST_REJECTED']]) {
    let calls = 0;
    const result = await testOpenAIConnection({ execute: true }, { env, request: async () => {
      calls++;
      return new Response(env.OPENAI_API_KEY, { status });
    } });
    assert.equal(calls, 1);
    assert.equal(result.errorCode, code);
    assert.ok(!JSON.stringify(result).includes(env.OPENAI_API_KEY));
  }
  const result = await testOpenAIConnection({ execute: true }, { env, request: async () => { throw new Error(env.OPENAI_API_KEY); } });
  assert.equal(result.errorCode, 'OPENAI_NETWORK_ERROR');
  assert.ok(!JSON.stringify(result).includes(env.OPENAI_API_KEY));
});

test('불완전 응답과 예상하지 않은 출력은 성공으로 보고하지 않는다', async () => {
  for (const response of [completed(env.OPENAI_API_KEY), completed('{"connection":"ok","secret":"unexpected"}'),
    new Response('not-json'), new Response(JSON.stringify({ status: 'incomplete', output: [] }))]) {
    const result = await testOpenAIConnection({ execute: true }, { env, request: async () => response });
    assert.equal(result.status, 'error');
    assert.ok(!JSON.stringify(result).includes(env.OPENAI_API_KEY));
  }
});

test('CLI 기본 실행은 설정 안내만 제공한다', () => {
  const result = spawnSync(process.execPath, ['scripts/openai-connection.mjs'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /미실행/);
  assert.match(result.stdout, /--execute/);
  assert.equal(result.stderr, '');
});

test('Next.js 환경변수 우선순위와 빈 상위 값의 덮어쓰기를 진단한다', () => {
  const root = mkdtempSync(join(tmpdir(), 'onestep-openai-env-'));
  const files = ['.env.local', '.env.development.local'];
  const helper = new URL('./helpers/openai-env.mjs', import.meta.url).href;
  const childEnv = { ...process.env, NODE_ENV: 'development' };
  delete childEnv.OPENAI_API_KEY;
  delete childEnv.__NEXT_PROCESSED_ENV;
  const read = overrides => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { loadOpenAIEnvironment } from ${JSON.stringify(helper)};
       globalThis.fetch = () => { throw new Error('NETWORK_FORBIDDEN'); };
       console.log(JSON.stringify(loadOpenAIEnvironment(process.cwd()).diagnostics));`],
    { cwd: root, env: { ...childEnv, ...overrides }, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 0);
    assert.equal(child.stderr, '');
    assert.ok(!child.stdout.includes('synthetic-secret'));
    return JSON.parse(child.stdout);
  };
  try {
    writeFileSync(join(root, '.env.local'), 'OPENAI_API_KEY=synthetic-secret-local\n');
    const local = read({});
    assert.equal(local.source, '.env.local');
    assert.equal(local.localFileLoaded, true);
    assert.equal(local.localDefinesKey, true);
    writeFileSync(join(root, '.env.development.local'), 'OPENAI_API_KEY=synthetic-secret-development\n');
    assert.equal(read({}).source, '.env.development.local');
    const inherited = read({ OPENAI_API_KEY: '' });
    assert.equal(inherited.source, 'process.env');
    assert.equal(inherited.keyEmpty, true);
    assert.equal(read({ NODE_ENV: 'test' }).localFileLoaded, false);
  } finally {
    for (const file of files) { try { unlinkSync(join(root, file)); } catch {} }
    rmdirSync(root);
  }
});

test('CLI 진단은 키를 출력하지 않고 호출 없이 설정만 검사한다', () => {
  const result = spawnSync(process.execPath, ['scripts/openai-connection.mjs', '--diagnose'], {
    env: { ...process.env, OPENAI_API_KEY: 'synthetic-secret-cli' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0);
  const diagnosis = JSON.parse(result.stdout);
  assert.equal(diagnosis.status, 'not_run');
  assert.equal(diagnosis.source, 'process.env');
  assert.equal(diagnosis.errorCode, null);
  assert.ok(!result.stdout.includes('synthetic-secret-cli'));
  assert.equal(result.stderr, '');
});
