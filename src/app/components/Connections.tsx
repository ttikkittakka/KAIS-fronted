'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { addPerson, clearConnections, connectionOptions, contactTrend, frequentPeople, readConnections, recentPeople, recordContact, removePerson } from '../connections';
import { gardenPreferences } from '../preferences';
import { hasContactDip } from '../mission-policy';
import { nativeDevice, requestNative } from '../native-bridge';
import { wellbeingResponse } from '../wellbeing-client';
import { Icon } from './PetIcon';

type Picker = { select: (fields: string[], config: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };
const contactPicker = () => typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { contacts?: Picker }).contacts;

export function ConnectionsScreen() {
  const [state, setState] = useState(readConnections);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [clear, setClear] = useState(false);
  const update = (change: () => ReturnType<typeof readConnections>, message = '') => {
    try { setState(change()); setNotice(message); } catch (error) { setNotice(error instanceof Error ? error.message : '연락 기록을 저장하지 못했어요.'); }
  };
  const pick = async () => {
    setNotice(''); setPending(true);
    try {
      if (nativeDevice()) {
        const person = await requestNative('contacts');
        if (person) update(() => addPerson(person.name, person.phone), '연락처를 추가했어요.');
      } else {
        const picker = contactPicker();
        if (!picker) { setNotice('이 브라우저에서는 직접 입력으로 추가할 수 있어요.'); return; }
        const [person] = await picker.select(['name', 'tel'], { multiple: false });
        if (person) update(() => addPerson(person.name?.[0] ?? '', person.tel?.[0] ?? ''), '연락처를 추가했어요.');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice(error instanceof Error ? error.message : '연락처를 가져오지 못했어요.');
    } finally { setPending(false); }
  };
  const manual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    update(() => { const next = addPerson(String(data.get('name') ?? ''), String(data.get('phone') ?? '')); form.reset(); return next; }, '연락처를 추가했어요.');
  };
  const recent = recentPeople(state.people)[0];
  const frequent = frequentPeople(state.people)[0];
  return <div className="work-area connections-area">
    <header className="quiet-intro"><div className="quiet-glyph"><Icon name="phone"/></div><h2>연락은 내 속도로</h2><p>내가 고른 연락처와 직접 남긴 연락만 이 기기에 보여줘요.</p></header>
    <section className="quiet-card">
      <label className="quiet-check"><input type="checkbox" checked={state.enabled} onChange={event => update(() => connectionOptions({ enabled: event.target.checked }))}/><span>연락처와 연락 기록 보기</span></label>
      {state.enabled && <label className="quiet-check"><input type="checkbox" checked={state.reminders} onChange={event => update(() => connectionOptions({ reminders: event.target.checked, nextCheck: 0 }))}/><span>연락이 줄어들면 가볍게 알려주기</span></label>}
    </section>
    {state.enabled && <>
      <section className="quiet-card"><div className="quiet-section-head"><h3>최근 90일의 연락</h3><Icon name="chat" size={18}/></div>
        <dl className="quiet-facts"><div><dt>가장 자주 연락한 사람</dt><dd>{frequent ? `${frequent.name} · ${frequent.dates.length}회` : '아직 없어요'}</dd></div>
          <div><dt>최근에 연락한 사람</dt><dd>{recent ? `${recent.name} · ${new Date(recent.dates.at(-1)!).toLocaleDateString('ko-KR')}` : '아직 없어요'}</dd></div></dl>
      </section>
      <section className="quiet-card">
        <div className="quiet-section-head"><h3>내 연락처</h3><Button icon={<Icon name="plus" size={19}/>} label="기기 연락처에서 선택" isIconOnly isLoading={pending} onClick={() => void pick()}/></div>
        <details className="quiet-disclosure"><summary>직접 추가</summary>
          <form className="quiet-form" onSubmit={manual}><label>이름<input name="name" maxLength={40} required/></label>
            <label>전화번호<input name="phone" type="tel" maxLength={25} required/></label><Button type="submit" label="추가" variant="primary"/></form>
        </details>
        {state.people.length === 0 && <p>안부를 전하고 싶은 사람을 골라 주세요.</p>}
        <ul className="people-list">{state.people.map(person => <li key={person.id}><span className="person-initial" aria-hidden="true">{person.name.slice(0, 1)}</span><div><strong>{person.name}</strong><small>{person.dates.length}회 기록</small></div>
          <a className="garden-icon-action" aria-label={person.name + '에게 전화'} title="전화" href={'tel:' + person.phone}><Icon name="phone" size={19}/></a>
          <Button icon={<Icon name="check" size={19}/>} label={person.name + '에게 연락했어요'} isIconOnly onClick={() => update(() => recordContact(person.id), '연락을 기록했어요.')}/>
          <Button icon={<Icon name="close" size={17}/>} label={person.name + ' 연락처 삭제'} isIconOnly onClick={() => update(() => removePerson(person.id), '연락처를 지웠어요.')}/>
        </li>)}</ul>
      </section>
    </>}
    <p className="quiet-note">휴대폰 통화 이력은 가져오지 않아요. 통화나 문자를 보낸 뒤 완료 표시로 기록해요.</p>
    {state.people.length > 0 && <>{clear ? <div className="quiet-actions"><Button label="기록 모두 지우기" onClick={() => { update(clearConnections, '연락처와 기록을 지웠어요.'); setClear(false); }}/><Button label="취소" onClick={() => setClear(false)}/></div>
      : <button type="button" className="text-button" onClick={() => setClear(true)}>연락 기록 모두 지우기</button>}</>}
    {notice && <p role="status" className="quiet-status">{notice}</p>}
  </div>;
}

export function ConnectionNudge({ onOpen }: { onOpen: () => void }) {
  const [suggest, setSuggest] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      const state = readConnections();
      if (!state.enabled || !state.reminders || state.nextCheck > Date.now()) return;
      const data = contactTrend(state.people);
      if (!hasContactDip(data)) return;
      let show = true;
      try { show = (await wellbeingResponse<{ suggest: boolean }>({ kind: 'connection', ...data }, gardenPreferences().ai, controller.signal)).suggest; }
      catch { if (controller.signal.aborted) return; }
      if (controller.signal.aborted) return;
      const current = readConnections();
      if (!current.reminders || !current.enabled) return;
      try { connectionOptions({ nextCheck: Date.now() + (show ? 7 : 1) * 86400_000 }); } catch { return; }
      setSuggest(show);
    }
    void check();
    return () => controller.abort();
  }, []);
  if (!suggest) return null;
  return <aside className="connection-nudge" aria-label="안부 제안">
    <p>생각나는 사람에게 안부 한 번 전해 볼까요?</p>
    <div className="quiet-actions"><Button label="연락처 보기" onClick={onOpen}/><Button label="아니오" onClick={() => {
      try { connectionOptions({ reminders: false }); setSuggest(false); } catch { setError('설정을 저장하지 못했어요.'); }
    }}/></div>{error && <p role="alert">{error}</p>}
  </aside>;
}
