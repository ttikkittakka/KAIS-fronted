'use client';

import { useEffect, useRef, useState } from 'react';
import { QUESTIONS, type AnswerValue } from '../../questions';
import { CARE_CATEGORIES } from '../../cares';
import { CASES } from '../../../lib/ai-prototype/cases';
import { EVIDENCE_LABELS, PRICE, inputSchema, prototypeCares, responseSchema, validateAnalysis, type AnalysisInput, type AnalysisResponse } from '../../../lib/ai-prototype/model';
import { mockAnalysis } from '../../../lib/ai-prototype/mock';
import styles from './prototype.module.css';

const errors: Record<string, string> = {
  OPENAI_API_KEY_MISSING: '서버의 .env.local에 OPENAI_API_KEY를 설정해 주세요. API는 호출하지 않았어요.',
  OPENAI_API_KEY_PLACEHOLDER: '서버에 예시 값 대신 발급받은 API 키를 설정해 주세요.',
  OPENAI_PROJECT_ID_NOT_API_KEY: '프로젝트 ID 대신 API 키가 필요해요.',
  OPENAI_KEY_HEADER_UNSAFE: '서버 API 키에 설명이나 줄바꿈이 섞였는지 확인해 주세요.',
  OPENAI_AUTHENTICATION_FAILED: 'OpenAI 인증을 확인하지 못했어요.',
  OPENAI_PERMISSION_DENIED: '모델 접근 권한을 확인해 주세요.',
  OPENAI_MODEL_UNAVAILABLE: '설정된 모델을 사용할 수 없어요.',
  OPENAI_RATE_LIMITED: 'OpenAI 사용 한도나 요청 제한을 확인해 주세요. 자동으로 재시도하지 않아요.',
  OPENAI_UPSTREAM_ERROR: 'OpenAI 서버에서 응답을 완료하지 못했어요.',
  OPENAI_REQUEST_REJECTED: 'OpenAI가 요청을 처리하지 못했어요.',
  OPENAI_TIMEOUT: '응답 제한 시간을 넘겼어요. 자동 재시도는 없어요.',
  OPENAI_NETWORK_ERROR: '연결을 확인하지 못했어요. 사용료 발생 여부는 Usage에서 확인해 주세요.',
  OPENAI_INVALID_RESPONSE: '응답 형식을 확인하지 못했어요.',
  OPENAI_INCOMPLETE_RESPONSE: '분석 응답이 끝까지 생성되지 않았어요.',
  ANALYSIS_VALIDATION_FAILED: '근거·미션·표현 검사를 통과하지 못해 결과를 표시하지 않았어요.',
  ANALYSIS_BUSY: '다른 분석이 진행 중이에요. 완료된 뒤 직접 다시 실행해 주세요.',
  DUPLICATE_REQUEST: '이미 처리한 요청이에요. 중복 API 호출을 막았어요.',
  PROTOTYPE_LIMIT_REACHED: '개발 서버 실행당 20회 제한에 도달했어요. 사용량을 확인한 뒤 서버를 다시 시작해 주세요.',
  LOCAL_ORIGIN_REQUIRED: 'localhost 개발 화면에서만 실행할 수 있어요.',
  INVALID_INPUT: '네 답변과 글 길이, 가상 기록 확인 여부를 확인해 주세요.',
  ANALYSIS_UNAVAILABLE: '분석 상태를 확인하지 못했어요.',
  INPUT_TOO_LARGE: '입력 크기가 허용 범위를 넘었어요.',
};
const usd = (value: number) => `$${value.toFixed(5)}`;
type Display = { mode: 'mock' | 'live'; response: AnalysisResponse; input: AnalysisInput };

export default function Prototype() {
  const [input, setInput] = useState<AnalysisInput>(CASES[0].input);
  const [caseId, setCaseId] = useState(CASES[0].id);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [display, setDisplay] = useState<Display | null>(null);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ requests: 0, calls: 0, unknown: 0, cost: 0 });
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const edit = (next: AnalysisInput) => { setInput(next); setDisplay(null); setError(''); setConfirmed(false); };
  const choose = (id: string) => { setCaseId(id); edit(CASES.find(item => item.id === id)!.input); };
  const cares = prototypeCares(input);
  const preview = () => {
    const snapshot = inputSchema.parse(input);
    setError('');
    setDisplay({ mode: 'mock', input: snapshot, response: { model: 'gpt-5.4-mini', analysis: mockAnalysis(snapshot), usage: null, estimatedUsd: null, apiCalls: 1 } });
  };
  async function execute(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed || inFlight.current) return;
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) { setError(errors.INVALID_INPUT); return; }
    inFlight.current = true; setBusy(true); setError(''); setDisplay(null);
    setStats(s => ({ ...s, requests: s.requests + 1 }));
    const current = new AbortController(); controller.current = current;
    let accounted = false;
    try {
      const response = await fetch('/api/dev/ai-mind', { method: 'POST', cache: 'no-store', credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'X-OneStep-Prototype': 'synthetic-v1' },
        body: JSON.stringify({ ...parsed.data, requestId: crypto.randomUUID() }),
        signal: AbortSignal.any([current.signal, AbortSignal.timeout(55000)]),
      });
      const raw = await response.json();
      if (!alive.current) return;
      const count = raw.apiCalls === 0 || raw.apiCalls === 1 ? raw.apiCalls : null;
      const cost = typeof raw.estimatedUsd === 'number' && Number.isFinite(raw.estimatedUsd) && raw.estimatedUsd >= 0 ? raw.estimatedUsd : null;
      setStats(s => ({ ...s, calls: s.calls + (count ?? 0), unknown: s.unknown + (count === null || (count === 1 && cost === null) ? 1 : 0), cost: s.cost + (cost ?? 0) }));
      accounted = true;
      if (!response.ok) { setError(`${errors[raw.errorCode] ?? '분석을 완료하지 못했어요.'} (${Object.hasOwn(errors, raw.errorCode) ? raw.errorCode : 'ANALYSIS_UNAVAILABLE'})`); return; }
      const value = responseSchema.parse(raw);
      validateAnalysis(value.analysis, parsed.data);
      setDisplay({ mode: 'live', response: value, input: parsed.data });
    } catch {
      if (alive.current) {
        if (!accounted) setStats(s => ({ ...s, unknown: s.unknown + 1 }));
        setError('결과를 확인하지 못했어요. 자동 재시도는 하지 않았어요. 사용량은 OpenAI Usage에서 확인해 주세요.');
      }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }

  return <main className={styles.page}>
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.brand}><span className={styles.mark} aria-hidden="true">✳</span> ONE STEP <span className={styles.badge}>개발 전용 실험실</span></div>
        <p className={styles.eyebrow}>나의 마음을, 조금 더 천천히</p>
        <h1>마음을 읽는 작은 연습</h1>
        <p className={styles.intro}>가상의 하루를 입력하고, AI가 어떤 말과 돌봄을 건네는지 살펴보세요.</p>
        <div className={styles.notice}>가상 기록만 입력해 주세요. 실제 계정 기록을 가져오지 않으며, 입력과 결과를 저장하지 않습니다.</div>
      </header>
      <section className={styles.meter} aria-label="호출 횟수와 예상 비용">
        <div><span>사용 모델</span><strong>gpt-5.4-mini</strong></div>
        <div><span>이 화면의 실행 요청 / API 전송</span><strong data-testid="call-count">{stats.requests}회 / {stats.calls}회</strong></div>
        <div><span>사용량으로 계산한 누적 추정액</span><strong>{usd(stats.cost)}</strong></div>
        <p>1회 약 ${PRICE.typicalMin}–${PRICE.typicalMax} 예상 · 입력 1,000–6,000 / 출력 700–2,400토큰 가정. 실패도 과금될 수 있어요. 확인이 필요한 요청 {stats.unknown}건.</p>
        <details><summary>비용 기준과 확인 방법</summary><p>{PRICE.checkedAt} 기준 100만 토큰당 입력 ${PRICE.inputPerMillion} / 출력 ${PRICE.outputPerMillion}. 추론 토큰도 출력 사용량에 포함될 수 있습니다. 캐시 할인을 반영하지 않은 추정이며 실제 금액은 다를 수 있어요. 횟수와 추정액은 새로고침하면 초기화됩니다. 서버 메모리 기준 최대 20회로 제한하며, 서버 재시작이나 코드 갱신 시 제한이 초기화됩니다.</p><a href="https://platform.openai.com/usage" target="_blank" rel="noreferrer">OpenAI Usage에서 실제 사용량 확인</a></details>
      </section>
      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="input-title">
          <div className={styles.sectionHead}><span className={styles.kicker}>가상의 하루</span><h2 id="input-title">오늘은 어떤 날인가요?</h2><p>사례를 고른 뒤 내용을 자유롭게 바꿀 수 있어요.</p></div>
          <form onSubmit={execute}>
            <fieldset disabled={busy} className={styles.fields}>
              <label className={styles.label} htmlFor="test-case">미리 준비한 사례</label>
              <select id="test-case" value={caseId} onChange={e => choose(e.target.value)}>{CASES.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
              <p className={styles.hint}>{CASES.find(item => item.id === caseId)?.description}</p>
              <div className={styles.questions}>{QUESTIONS.map((question, index) => <label key={question.id} className={styles.question}>
                <span>{question.title.replace('\n', ' ')}</span>
                <select aria-label={question.title.replace('\n', ' ')} value={input.answers[index]} onChange={event => { const answers = [...input.answers] as AnalysisInput['answers']; answers[index] = event.target.value as AnswerValue; edit({ ...input, answers }); }}>
                  {question.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>)}</div>
              <label className={styles.label} htmlFor="fiction-note">가상의 글 <span>선택</span></label>
              <textarea id="fiction-note" maxLength={300} rows={4} value={input.note} onChange={e => edit({ ...input, note: e.target.value })} placeholder="가상 인물의 하루를 짧게 적어 주세요." />
              <p className={styles.count}>{input.note.length} / 300자</p>
              <label className={styles.label} htmlFor="fiction-comment">가상의 사진 코멘트 <span>선택</span></label>
              <textarea id="fiction-comment" maxLength={100} rows={2} value={input.photoComment} onChange={e => edit({ ...input, photoComment: e.target.value })} placeholder="사진 이미지는 전송하지 않아요." />
              <p className={styles.count}>{input.photoComment.length} / 100자</p>
              <label className={styles.consent}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>실제 개인 기록이 아닌 가상 입력이며, 버튼을 누르면 OpenAI에 전송되어 사용료가 발생할 수 있음을 확인했어요.</span></label>
              <button className={styles.primary} type="submit" disabled={!confirmed || busy}>{busy ? '마음을 살펴보고 있어요…' : 'AI 마음 분석 1회 실행'}</button>
              <button className={styles.secondary} type="button" onClick={preview}>모의 결과 보기 · API 호출 없음</button>
            </fieldset>
            <p className={styles.hint}>자동 호출과 자동 재시도는 없습니다. 최대 45초 동안 응답을 기다립니다.</p>
          </form>
          {busy && <p role="status" className={styles.wait}>선택 답변과 허용된 미션으로 분석 중이에요. 결과는 이 화면에만 표시됩니다.</p>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </section>
        <section className={`${styles.panel} ${styles.result}`} aria-labelledby="result-title" aria-busy={busy}>
          <div className={styles.sectionHead}><span className={styles.kicker}>조심스럽게 건네는 말</span><h2 id="result-title">오늘의 마음과 작은 돌봄</h2><p>정답이나 진단이 아닌, 기록을 읽는 하나의 관점이에요.</p></div>
          {!display ? <div className={styles.empty}><span aria-hidden="true">✳</span><h3>{busy ? '서두르지 않고 살펴볼게요' : '마음을 담을 자리를 비워 두었어요'}</h3><p>{busy ? '새로운 기록을 만들거나 돌봄을 완료하지 않아요.' : '입력란에서 가상 사례를 고르거나 무료 모의 결과를 먼저 확인해 보세요.'}</p><div className={styles.chips}><span>선택 답변 우선</span><span>기존 돌봄 3개</span><span>원문 근거 확인</span></div></div>
            : <div className={styles.results} aria-live="polite">
              <p className={styles.resultBadge}>{display.mode === 'mock' ? '모의 결과 · 정해진 예시 · AI 호출 없음' : 'AI 분석 결과 · 이 화면에만 보관'}</p>
              <p className={styles.summary}>{display.response.analysis.summary}</p>
              <h3>감정 해석과 근거</h3>
              {display.response.analysis.emotions.map((emotion, index) => <div className={styles.interpretation} key={index}><p>{emotion.interpretation}</p>{emotion.evidence.map((item, i) => <blockquote key={i}><span>{EVIDENCE_LABELS[item.field]}</span> “{item.quote}”</blockquote>)}</div>)}
              <div className={styles.energy}><h3>오늘의 에너지</h3><strong>{QUESTIONS[1].options.find(o => o.value === display.response.analysis.energy.level)?.label}</strong><p>{display.response.analysis.energy.explanation}</p></div>
              <h3>지금 필요한 돌봄</h3><div className={styles.chips}>{display.response.analysis.careNeeds.map((need, i) => <span key={i}>{need}</span>)}</div>
              <h3>부담 없이 골라보는 세 가지</h3><p className={styles.hint}>기존 알고리즘이 선택한 미션 그대로예요. 이 화면에서는 완료하거나 보상을 받지 않아요.</p>
              <div className={styles.cares}>{display.response.analysis.recommendations.map((recommendation, index) => {
                const care = prototypeCares(display.input)[index];
                return <article className={styles.care} key={care.id} data-testid="care-result"><div className={styles.careMeta}>{CARE_CATEGORIES[care.category as keyof typeof CARE_CATEGORIES]} · {care.meta}</div><h4>{care.title}</h4><p>{recommendation.reason}</p><p className={styles.careHelper}>{care.helper}</p>{recommendation.evidence.map((item, i) => <blockquote key={i}><span>{EVIDENCE_LABELS[item.field]}</span> “{item.quote}”</blockquote>)}</article>;
              })}</div>
              <aside className={styles.uncertainty}><h3>이 해석에 남겨 둔 여백</h3><p>{display.response.analysis.uncertainty}</p></aside>
              {display.mode === 'live' && <p className={styles.hint}>입력 {display.response.usage?.inputTokens ?? '미확인'} / 출력 {display.response.usage?.outputTokens ?? '미확인'}토큰 · 추정액 {display.response.estimatedUsd === null ? '미확인' : usd(display.response.estimatedUsd)}</p>}
            </div>}
          <details className={styles.policy}><summary>안전 필터와 검토 기준</summary><p>현재 선택된 미션: {cares.map(care => care.title).join(', ')}. 낮은 에너지의 부담 제한과 카테고리 다양성은 기존 알고리즘을 따릅니다.</p><p>한국어의 자연스러움, 감정 단정, 기록에 없는 사건 추론은 직접 검토해 주세요. 원문 인용 검증만으로 의미상의 모든 오류를 막을 수는 없어요.</p></details>
        </section>
      </div>
      <footer className={styles.footer}>ONE STEP · 가상 기록으로만 실험하는 독립 시제품</footer>
    </div>
  </main>;
}
