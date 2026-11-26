'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { OPENAI_KEY_HEADER, PROVIDER_KEY_HEADER } from '../../lib/provider-keys';
import {
  COLD_MEDICINE_EXAMPLE, MEDICINE_BRIEFING_LIMIT, MEDICINE_CATALOG_URL, medicineDetailUrl,
  type MedicineBriefing, type PlantBriefingRequest, type PolicyBriefing,
} from '../plant-briefing';
import { usePersonalGarden } from './PersonalGarden';
import { Icon } from './PetIcon';

type Result = PolicyBriefing | MedicineBriefing;
type Section = Result['kind'];
type Report = { phase: 'loading' | 'error' } | { phase: 'ready'; result: Result };
const labels = { policies: '지원 정책', medicines: '복약 확인' } as const;

export function ColdMedicineExample() {
  return <div className="cold-medicine-example">
    <h3>감기약 비교 예시</h3>
    <p>성분 중복을 살펴보는 체험용 목록이에요.</p>
    <ul>{COLD_MEDICINE_EXAMPLE.map(item => <li key={item.code}>
      <a href={medicineDetailUrl(item.code!)} target="_blank" rel="noreferrer">{item.name}</a>
      <small>비교 성분 · {item.ingredients?.join(', ')}</small>
    </li>)}</ul>
  </div>;
}

export default function PlantBriefing({ name }: { name?: string }) {
  const garden = usePersonalGarden();
  const apiKeys = garden?.apiKeys;
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(new Map<Section, AbortController>());
  const [section, setSection] = useState<Section>('policies');
  const [reports, setReports] = useState<Partial<Record<Section, Report>>>({});
  const [consent, setConsent] = useState(false);
  const [batch, setBatch] = useState(0);
  useEffect(() => {
    const requests = active.current;
    return () => { for (const request of requests.values()) request.abort(); };
  }, []);

  if (!apiKeys?.openai) return null;

  const load = async (work: PlantBriefingRequest) => {
    const target = work.kind === 'policies' ? 'policies' : 'medicines';
    const providerKey = apiKeys[target === 'policies' ? 'gov24' : 'edrug'];
    const openAIKey = apiKeys.openai;
    if (!openAIKey || !providerKey || active.current.has(target)) return;
    const run = new AbortController();
    active.current.set(target, run);
    setReports(values => ({ ...values, [target]: { phase: 'loading' } }));
    try {
      const response = await fetch('/api/plant-briefing', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', [OPENAI_KEY_HEADER]: openAIKey, [PROVIDER_KEY_HEADER]: providerKey },
        body: JSON.stringify(work), signal: AbortSignal.any([run.signal, AbortSignal.timeout(33_000)]),
      });
      if (!response.ok) throw new Error('briefing-unavailable');
      const result = await response.json() as Result;
      if (result.kind !== target || !Array.isArray(result.items)) throw new Error('invalid-briefing');
      if (!run.signal.aborted) setReports(values => ({ ...values, [target]: { phase: 'ready', result } }));
    } catch {
      if (!run.signal.aborted) setReports(values => ({ ...values, [target]: { phase: 'error' } }));
    } finally { active.current.delete(target); }
  };

  const select = (next: Section) => {
    setSection(next);
    if (next === 'policies' && apiKeys.gov24 && !reports.policies) void load({ kind: 'policies' });
  };
  const open = () => {
    if (!dialog.current?.open) dialog.current?.showModal();
    select(apiKeys.gov24 ? 'policies' : 'medicines');
  };
  const registered = garden?.medications ?? [];
  const start = batch * MEDICINE_BRIEFING_LIMIT;
  const selected = registered.slice(start, start + MEDICINE_BRIEFING_LIMIT);
  const report = reports[section];
  const result = report?.phase === 'ready' ? report.result : null;
  const loading = report?.phase === 'loading';
  const hasProvider = !!apiKeys[section === 'policies' ? 'gov24' : 'edrug'];

  return <>
    <button type="button" className="plant-briefing-trigger" aria-haspopup="dialog" onClick={open}>
      <Icon name="sparkle" size={17}/>식물의 조회 노트
    </button>
    <dialog className="plant-briefing-dialog" ref={dialog} aria-labelledby={titleId} onClose={() => setConsent(false)}>
      <header className="plant-briefing-head">
        <h2 id={titleId}>{name ? name + '의 조회 노트' : '식물의 조회 노트'}</h2>
        <button type="button" className="icon-button" aria-label="조회 노트 닫기" onClick={() => dialog.current?.close()}><Icon name="close" size={19}/></button>
      </header>
      <div className="plant-briefing-body">
        <div className="plant-briefing-tabs" role="group" aria-label="조회 항목">
          {(['policies', 'medicines'] as const).map(tab => <button key={tab} type="button"
            aria-pressed={section === tab} onClick={() => select(tab)}>{labels[tab]}</button>)}
        </div>
        {!hasProvider && <p>설정에서 {section === 'policies' ? '행안부 정부24' : '식약처 e약은요'} API를 연결해 주세요.</p>}
        {loading && <p role="status">식물이 {section === 'policies' ? '정부24 정책을 찾고' : '약 정보를 비교하고'} 있어요…</p>}
        {report?.phase === 'error' && <p role="alert">정보를 가져오지 못했어요. 설정에서 API 연결을 확인해 주세요.</p>}
        {section === 'policies' && hasProvider && <>
          {result?.kind === 'policies' && <PolicyResults result={result}/>}
          {report && !loading && <button className="shop-secondary plant-briefing-action" type="button" onClick={() => void load({ kind: 'policies' })}>정책 다시 조회</button>}
        </>}
        {section === 'medicines' && <>
          {result?.kind === 'medicines' ? <MedicineResults result={result}/> : <ColdMedicineExample/>}
          {hasProvider && <>
            <button className="shop-secondary plant-briefing-action" type="button" disabled={loading} onClick={() => void load({ kind: 'example' })}>감기약 예시 조회</button>
            {registered.length > 0 && <div className="plant-briefing-personal">
              {registered.length > MEDICINE_BRIEFING_LIMIT && <label>조회할 약 범위
                <select value={batch} disabled={loading} onChange={event => {
                  setBatch(Number(event.target.value)); setConsent(false);
                  setReports(values => ({ ...values, medicines: undefined }));
                }}>
                  {Array.from({ length: Math.ceil(registered.length / MEDICINE_BRIEFING_LIMIT) }, (_, index) =>
                    <option key={index} value={index}>{index * MEDICINE_BRIEFING_LIMIT + 1}–{Math.min(registered.length, (index + 1) * MEDICINE_BRIEFING_LIMIT)}번 약</option>)}
                </select>
              </label>}
              <label className="quiet-check">
                <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>
                <span>등록한 약 이름을 식약처에 조회하는 데 동의해요. GPT는 항목별 확인 상태만 받아요.</span>
              </label>
              <button className="primary-button plant-briefing-action" type="button" disabled={!consent || loading || !selected.length}
                onClick={() => void load({
                  kind: 'medicines', consent: true,
                  items: selected.map(item => ({ name: item.name, code: item.catalog?.code, ingredients: item.ingredients })),
                })}>등록한 약 {selected.length}개 확인</button>
            </div>}
          </>}
        </>}
      </div>
    </dialog>
  </>;
}

function PolicyResults({ result }: { result: PolicyBriefing }) {
  if (!result.items.length) return <p>표시할 마음·상담 지원 정책을 찾지 못했어요.</p>;
  return <>
    <p className="plant-briefing-source">정부24 마음·상담 지원 · {result.summarized ? 'GPT 요약' : '공식 설명'}</p>
    <ul className="plant-briefing-list">{result.items.map(item => <li key={item.id}>
      <h3>{item.name}</h3>
      {item.agency && <small>{item.agency}</small>}
      {item.summary && <p>{item.summary}</p>}
      <a href={item.url || 'https://www.gov.kr/'} target="_blank" rel="noreferrer">공식 안내 보기 ↗</a>
    </li>)}</ul>
  </>;
}

function MedicineResults({ result }: { result: MedicineBriefing }) {
  return <>
    <h3>{result.example ? '체험용 감기약 비교' : '등록한 약 확인 결과'}</h3>
    <p className="plant-briefing-source">식약처 e약은요 · {result.summarized ? 'GPT 정리' : '등록 정보 정리'}</p>
    <p>이 목록의 제품과 등록된 성분을 비교했어요. 함께 복용하기 전 약 목록과 포장을 약사에게 보여 주세요.</p>
    <ul className="plant-briefing-list">{result.items.map(item => <li key={item.index}>
      <h4>{item.name}</h4>
      {item.manufacturer && <small>{item.manufacturer}</small>}
      {item.sharedIngredients.length > 0 && <p className="plant-briefing-warning">겹치는 성분 · {item.sharedIngredients.join(', ')}</p>}
      {item.duplicateProduct && <p className="plant-briefing-warning">같은 제품이 목록에 들어 있어요.</p>}
      {!item.hasIngredients && <p>유효성분을 포장에서 확인해 주세요.</p>}
      {item.catalog === 'not-found' && <p>식약처에서 일치하는 제품 정보를 찾지 못했어요.</p>}
      {item.catalog === 'unavailable' && <p>식약처 제품 정보를 불러오지 못했어요.</p>}
      {item.catalogCode && <a href={medicineDetailUrl(item.catalogCode)} target="_blank" rel="noreferrer">식약처 제품 정보 ↗</a>}
    </li>)}</ul>
    <a className="plant-briefing-source" href={MEDICINE_CATALOG_URL} target="_blank" rel="noreferrer">e약은요 데이터 출처 ↗</a>
  </>;
}
