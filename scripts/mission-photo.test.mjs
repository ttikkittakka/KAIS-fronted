import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadTs } from './helpers/load-ts.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const { compareMedicineLabels, medicineLabelsFromText, parseMedicineLabel } = loadTs(new URL('../src/app/medicine-label.ts', import.meta.url));
const { photoVerdict } = loadTs(new URL('../src/app/mission-photo.ts', import.meta.url));

test('medicine matching compares the printed product and strength, preserving formulation and strength differences', () => {
  const reference = parseMedicineLabel('그린샘플정', '250 mg');
  assert.deepEqual(reference, { name: '그린샘플정', strength: '250 mg' });
  assert.equal(compareMedicineLabels(reference, medicineLabelsFromText('제품명: 그린 샘플정 ２５０밀리그램')), 'match');
  assert.equal(compareMedicineLabels(reference, medicineLabelsFromText('그린샘플정 500 mg')), 'mismatch');
  assert.equal(compareMedicineLabels(reference, medicineLabelsFromText('그린샘플서방정 250 mg')), 'mismatch');
  assert.equal(compareMedicineLabels(reference, medicineLabelsFromText('그린샘플정 0.25 g')), 'mismatch');
});

test('unclear labels, multiple products, and incomplete or compound strengths are never a match', () => {
  const reference = parseMedicineLabel('샘플정', '10 mg');
  for (const text of ['', '10 mg', '샘플정', '흰색 타원형', '샘플정 10 mg / 2 mL', '샘플정 10 mg + 20 mg',
    '샘플정 10 mg\n다른샘플정 20 mg']) {
    assert.equal(compareMedicineLabels(reference, medicineLabelsFromText(text)), 'unknown', text);
  }
  assert.equal(parseMedicineLabel('샘플정', '0mg'), null);
});

test('a cup is complete only with visible liquid and unrecognized evidence never completes a mission', () => {
  assert.equal(photoVerdict('cup', 'cup-with-liquid'), 'match');
  assert.equal(photoVerdict('cup', 'empty-cup'), 'mismatch');
  assert.equal(photoVerdict('cup', 'meal'), 'mismatch');
  assert.equal(photoVerdict('music', 'other'), 'mismatch');
  assert.equal(photoVerdict('music', 'music-playing'), 'match');
  assert.equal(photoVerdict('book', 'book'), 'match');
  assert.equal(photoVerdict('meal', 'meal'), 'match');
  for (const kind of ['cup', 'book', 'meal', 'music']) assert.equal(photoVerdict(kind, 'unclear'), 'unknown');
});

test('photo API needs a user and consent, sends only the validated photo, and keeps ambiguous replies incomplete', async t => {
  // The test loader transpiles TypeScript to CommonJS without default import interop.
  const defaultExport = Object.getOwnPropertyDescriptor(sharp, 'default');
  Object.defineProperty(sharp, 'default', { value: sharp, configurable: true });
  t.after(() => {
    if (defaultExport) Object.defineProperty(sharp, 'default', defaultExport);
    else delete sharp.default;
  });
  const originals = Object.fromEntries(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'OPENAI_API_KEY']
    .map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: 'https://mission-photo-tests.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_mission_test',
    OPENAI_API_KEY: 'synthetic-vision-test-key',
  });
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const { POST } = loadTs(new URL('../src/app/api/mission-photo/route.ts', import.meta.url));
  const modelRequests = [];
  let result = 'empty-cup';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    if (target.pathname === '/auth/v1/user') return Response.json({ id: '10000000-0000-4000-8000-000000000001' });
    assert.equal(target.href, 'https://api.openai.com/v1/responses');
    modelRequests.push(JSON.parse(options.body));
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [
      { type: 'output_text', text: JSON.stringify({ evidence: result }) },
    ] }] });
  });
  const image = (await sharp({ create: { width: 48, height: 48, channels: 3, background: '#f8f8f8' } }).jpeg().toBuffer()).toString('base64');
  const run = (overrides = {}, auth = true) => POST(new Request('https://garden.test/api/mission-photo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer fake.test.user' } : {}) },
    body: JSON.stringify({ kind: 'cup', image, consent: true, ...overrides }),
  }));
  assert.equal((await run({}, false)).status, 401);
  assert.equal((await run({ consent: false })).status, 400);
  assert.equal((await run({ image: Buffer.alloc(30).toString('base64') })).status, 400);
  const corruptJpeg = Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(24), Buffer.from([255, 217])]).toString('base64');
  assert.equal((await run({ image: corruptJpeg })).status, 400);
  assert.equal((await run({ kind: 'medicine' })).status, 400);
  assert.equal(modelRequests.length, 0);
  const response = await run();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { evidence: 'empty-cup', verdict: 'mismatch' });
  assert.equal(modelRequests[0].store, false);
  assert.equal(modelRequests[0].input[0].content[1].image_url, 'data:image/jpeg;base64,' + image);
  result = 'unclear';
  assert.equal((await (await run()).json()).verdict, 'unknown');
  result = 'cup-with-liquid';
  assert.equal((await (await run()).json()).verdict, 'match');
  result = 'unexpected';
  assert.equal((await run()).status, 503);
});
