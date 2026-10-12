import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { CARES, ACTIVE_CARES, LEGACY_CARES, isCareId } = loadTs(new URL('../src/app/cares.ts', import.meta.url));
const { recommendCares } = loadTs(new URL('../src/app/recommend-cares.ts', import.meta.url));
const { ensureCareHistory, displayCareRecommendation, parseCareHistory } = loadTs(new URL('../src/app/daily-cares.ts', import.meta.url));
const { QUESTIONS } = loadTs(new URL('../src/app/questions.ts', import.meta.url));
const store = loadTs(new URL('../src/app/record-store.ts', import.meta.url));
const date = '2026-10-12';
const expectedTitles = ["물 몇 모금","간단한 것 하나 먹기","3분만 눈 감기","편안한 곳에 기대기","마시기 편한 음료 천천히 즐기기","내 몸에 필요한 것 하나 떠올리기","천천히 숨 내쉬기","아무것도 하지 않고 2분","좋아하는 노래 한 곡","휴대폰 잠깐 내려놓기","부드러운 촉감 느끼기","지금 들리는 소리 세 가지 찾기","기분 한 단어 적기","지금 필요한 것 하나 골라보기","나에게 다정한 한마디","오늘 괜찮았던 순간 떠올리기","하기 싫은 마음도 인정하기","지금의 나에게 질문 하나","하늘 바라보기","몸 한 번 펴기","어깨 내려놓기","물건 하나만 제자리로","빛과 공기 느끼기","잠깐 걷거나 몸 움직이기","좋아하는 것 하나 바라보기","짧은 안부 보내기","고마운 사람 한 명 떠올리기","안심되는 장소 떠올리기","내가 좋아하는 것 하나 적기","누군가에게 도움 요청하는 말 생각하기"];
test('catalog has exactly 30 active missions in five groups of six, preserving every historical ID', () => {
  assert.deepEqual(ACTIVE_CARES.map(c => c.title), expectedTitles);
  assert.equal(LEGACY_CARES.length, 32); assert.equal(CARES.length, 47);
  assert.equal(new Set(CARES.map(c => c.id)).size, 47);
  assert.equal(CARES.filter(c => !c.active).length, 17);
  for (const category of ['body','rest','understanding','change','connection']) assert.equal(ACTIVE_CARES.filter(c => c.category === category).length, 6);
  for (const old of LEGACY_CARES) assert.ok(isCareId(old.id));
  for (const care of ACTIVE_CARES) { assert.ok(care.instruction && care.helper && care.copy && care.similarity && care.weights); assert.ok(care.minutes >= 1 && care.minutes <= 3); }
});
test('all 32 legacy missions retain original display and completion after storage round trip', () => {
  const data = new Map(); globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value) };
  for (let i = 0; i < LEGACY_CARES.length; i++) {
    const old = [LEGACY_CARES[i], LEGACY_CARES[(i+1)%32], LEGACY_CARES[(i+2)%32]];
    const day = new Date(Date.UTC(2026, 8, 1+i)).toISOString().slice(0,10);
    const recommendation = { date: day, title: '이 날의 안내', ids: old.map(c => c.id) };
    const record = store.saveRecord({ ...store.emptyRecord(), date: day, answers: ['low','normal','normal','low'], stage: 'care', plantState: 'low', note: '기록 유지', completedCareIds: recommendation.ids, careRecommendations: [recommendation] });
    const restored = store.readRecords().find(r => r.date === day);
    assert.deepEqual(restored.completedCareIds, record.completedCareIds);
    assert.deepEqual(ensureCareHistory(day, ['good','good','good','good'], restored.careRecommendations), [recommendation]);
    const displayed = displayCareRecommendation(restored.careRecommendations[0]);
    for (let j = 0; j < 3; j++) for (const field of ['id','title','copy','meta','icon','tone']) assert.equal(displayed.cares[j][field], old[j][field]);
  }
  assert.equal(store.readRecords().length, 32);
});
test('legacy today is never rerolled; next day uses only v2 active IDs and preserves prior entry', () => {
  const previous = { date, ids: ['warm-drink','walk','emoji'], title: '기존 추천' };
  assert.deepEqual(ensureCareHistory(date, ['low','low','low','low'], [previous]), [previous]);
  const next = ensureCareHistory('2026-10-13', ['low','low','low','low'], [previous]);
  assert.equal(next[0].catalogVersion, 2); assert.deepEqual(next[1], previous);
  assert.ok(next[0].ids.every(id => ACTIVE_CARES.some(c => c.id === id)));
  assert.deepEqual(parseCareHistory(JSON.parse(JSON.stringify(next))), next);
  assert.equal(displayCareRecommendation(next[0]).cares.length, 3);
});
test('each low answer prioritizes its specified needs without forced movement or contact', () => {
  const groups = [['comfortable-lean','rest','pause','phone-down','breathe'],['water','body-need','music','comfortable-lean','choose-need'],['snack','water','body-need','choose-need'],['kind-word','texture','choose-need','accept-reluctance','safe-place','three-sounds']];
  for (let question = 0; question < 4; question++) for (const value of ['low','very_low']) for (let i = 1; i <= 28; i++) {
    const answers = ['good','good','good','good']; answers[question] = value;
    const result = recommendCares(answers, { date: '2026-10-' + String(i).padStart(2,'0') });
    assert.ok(result.cares.some(c => groups[question].includes(c.id)), question + ':' + value);
    assert.ok(result.cares.every(c => !c.comfortableOnly && c.effort !== 'active'));
  }
});
test('400 valid answer combinations over 28 dates return three active, distinct categories and distinct actions', () => {
  for (const s of QUESTIONS[0].options) for (const e of QUESTIONS[1].options) for (const m of QUESTIONS[2].options) for (const mood of QUESTIONS[3].options) for (let day = 1; day <= 28; day++) {
    const result = recommendCares([s.value,e.value,m.value,mood.value], { date: '2026-10-' + String(day).padStart(2,'0'), recentIds: day % 2 ? [] : CARES.map(c => c.id) });
    assert.equal(result.cares.length, 3); assert.ok(result.cares.every(c => c.active));
    assert.equal(new Set(result.cares.map(c => c.id)).size, 3);
    assert.equal(new Set(result.cares.map(c => c.category)).size, 3);
    assert.equal(new Set(result.cares.map(c => c.similarity)).size, 3);
  }
});
test('all-low states cover at least three needs with minimal effort across three categories', () => {
  for (let day = 1; day <= 28; day++) {
    const result = recommendCares(['very_low','very_low','very_low','very_low'], { date: '2026-10-' + String(day).padStart(2,'0') });
    const covered = new Set(result.cares.flatMap(c => Object.keys(c.weights).filter(tag => tag.startsWith('low_'))));
    assert.ok(covered.size >= 3); assert.ok(result.cares.every(c => c.effort === 'minimal'));
  }
});
test('v2 notes cannot claim retired IDs and unknown versions cannot masquerade as legacy', () => {
  const old = { date, ids: ['water','walk','emoji'], title: 'old' };
  assert.equal(parseCareHistory([old]).length, 1);
  assert.deepEqual(parseCareHistory([{...old,catalogVersion:2}]), []);
  assert.deepEqual(parseCareHistory([{...old,catalogVersion:999}]), []);
});
