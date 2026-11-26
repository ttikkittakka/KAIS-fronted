'use client';

import { useEffect, useState } from 'react';
import { normalizeAnswers } from '../questions';
import { isDemo } from '../app-storage';

const OFFLINE_REASON = '오늘 답해 준 상태에 맞춰, 가볍게 해볼 수 있는 돌봄을 골랐어요.';
type Reason = { text: string; ai: boolean };
// One request per answers+cares per page load; the backend keeps nothing.
const cache = new Map<string, Reason>();

export default function CareReason({ answers, careIds }: { answers: string[]; careIds: string[] }) {
  const key = JSON.stringify([normalizeAnswers(answers), careIds]);
  const [loaded, setLoaded] = useState<Reason | null>(null);
  useEffect(() => {
    if (isDemo() || cache.has(key)) return;
    let active = true;
    const [values, ids] = JSON.parse(key);
    fetch('/api/v1/explain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: values, careIds: ids }),
      cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(12000),
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then(data => ({ text: typeof data?.reason === 'string' ? data.reason : OFFLINE_REASON, ai: data?.source === 'ai' }))
      .catch(() => ({ text: OFFLINE_REASON, ai: false }))
      .then(reason => { cache.set(key, reason); if (active) setLoaded(reason); });
    return () => { active = false; };
  }, [key]);
  const reason = isDemo() ? { text: OFFLINE_REASON, ai: false } : cache.get(key) ?? loaded;
  return <div className="care-reason" aria-live="polite">
    {reason ? <><p>{reason.text}</p>{reason.ai && <small>AI가 쓴 설명이에요. 틀릴 수 있어요.</small>}</> : <p className="care-reason-loading">왜 이 돌봄인지 정리하고 있어요…</p>}
  </div>;
}
