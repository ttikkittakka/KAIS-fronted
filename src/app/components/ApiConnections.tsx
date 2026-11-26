'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_PROVIDER_KEY_LENGTH, parseProviderKey, type ApiProvider } from '../../lib/provider-keys';
import { usePersonalGarden } from './PersonalGarden';

const services = [
  { id: 'openai', name: 'OpenAI', detail: '식물의 조회 노트에서 정보를 정리해요. 로그인하면 사진 확인에도 쓸 수 있어요.' },
  { id: 'edrug', name: '식약처 e약은요', detail: '홈의 복약 확인과 복약 관리에서 제품을 조회해요.' },
  { id: 'gov24', name: '행안부 정부24', detail: '홈에서 마음·상담 지원 정책을 조회해요.' },
] as const satisfies readonly { id: ApiProvider; name: string; detail: string }[];

export default function ApiConnections() {
  const garden = usePersonalGarden();
  if (!garden) return null;
  return <details className="settings-card api-connections">
    <summary>API 연결</summary>
    <p>연결한 키는 현재 탭에서 사용해요. 새로고침하거나 로그아웃하면 연결이 해제돼요.</p>
    <div className="api-connections__list">{services.map(service =>
      <ConnectionForm key={service.id} service={service} connected={!!garden.apiKeys[service.id]} onChange={key => garden.setApiKey(service.id, key)}/>
    )}</div>
  </details>;
}

function ConnectionForm({ service, connected, onChange }: {
  service: typeof services[number]; connected: boolean; onChange: (key?: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const key = parseProviderKey(draft);
    if (!key) { setNotice('발급받은 API 키를 확인해 주세요.'); return; }
    const run = new AbortController();
    request.current = run;
    setPending(true);
    setNotice('');
    try {
      const response = await fetch('/api/connections', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: service.id, key }),
        signal: AbortSignal.any([run.signal, AbortSignal.timeout(18_000)]),
      });
      if (run.signal.aborted) return;
      if (response.ok && (await response.json()).connected === true) {
        if (!run.signal.aborted) {
          onChange(key);
          setDraft('');
          setNotice('연결됐어요.');
        }
      } else {
        setNotice(response.status === 429 ? '요청 한도에 도달했어요. 잠시 후 다시 확인해 주세요.' : '연결에 실패했어요. 키와 API 사용 권한을 확인해 주세요.');
      }
    } catch { if (!run.signal.aborted) setNotice('연결에 실패했어요. 잠시 후 다시 시도해 주세요.'); }
    finally {
      request.current = null;
      if (!run.signal.aborted) setPending(false);
    }
  }

  return <form className="api-connection" onSubmit={event => void connect(event)}>
    <div className="api-connection__heading"><h3>{service.name}</h3>{connected && <span>연결됨</span>}</div>
    <p>{service.detail}</p>
    <label>API 키
      <input type="password" aria-label={service.name + ' API 키'} value={draft} autoComplete="off" spellCheck={false}
        autoCapitalize="none" maxLength={MAX_PROVIDER_KEY_LENGTH} disabled={pending} onChange={event => { setDraft(event.target.value); setNotice(''); }}/>
    </label>
    <div className="api-connection__actions">
      <button type="submit" className="shop-secondary" aria-label={service.name + ' 연결 확인'} disabled={pending || !draft.trim()}>
        {pending ? '확인 중…' : '연결 확인'}
      </button>
      {connected && <button type="button" className="shop-secondary" aria-label={service.name + ' 연결 해제'} disabled={pending} onClick={() => {
        onChange(); setDraft(''); setNotice('개인 키 연결을 해제했어요.');
      }}>연결 해제</button>}
    </div>
    <p role="status">{notice}</p>
  </form>;
}
