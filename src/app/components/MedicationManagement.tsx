'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { getAuthClient } from '../../lib/supabase/auth-client';
import { localDay } from '../daily-checkin';
import { allowMedicationNotifications, medicationCalendar } from '../medication-alarms';
import { emptyMedicine, medicineSchema, PERIODS, PERIOD_LABELS, type Medicine, type MedicineCatalogItem, type MedicineInput, type Reminders } from '../personal-garden';
import { newLocalId } from '../record-store';
import MedicationMission from './MedicationMission';
import { usePersonalGarden } from './PersonalGarden';
import { Icon, type IconName } from './PetIcon';

const periodIcon: Record<typeof PERIODS[number], IconName> = { morning: 'sunrise', midday: 'sun', evening: 'moon' };

function DrugPhoto({ product }: { product: MedicineCatalogItem | null }) {
  const [failed, setFailed] = useState(false);
  return <span className="drug-photo">{product?.image && !failed ? <Image src={product.image} width={52} height={52}
    alt={product.name + ' 제품 사진'} referrerPolicy="no-referrer" unoptimized onError={() => setFailed(true)}/> : <Icon name="pill" size={24}/>}</span>;
}

function MedicineForm({ medicine, onClose }: { medicine: Medicine | null; onClose: () => void }) {
  const garden = usePersonalGarden();
  const [draft, setDraft] = useState<MedicineInput>(() => {
    if (!medicine) return emptyMedicine();
    const { name, strength, directions, periods, catalog } = medicine;
    return { name, strength, directions, periods, catalog };
  });
  const [found, setFound] = useState<MedicineCatalogItem[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null);
  const rowId = useRef(medicine?.id ?? null);
  useEffect(() => () => request.current?.abort(), []);

  async function lookup() {
    const name = draft.name.trim();
    if (name.length < 2 || name.length > 60) { setNotice('검색할 제품명을 2~60자로 입력해 주세요.'); return; }
    const run = new AbortController();
    request.current?.abort();
    request.current = run;
    setLookupBusy(true); setNotice(''); setFound([]);
    try {
      const session = await getAuthClient()?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error('로그인한 뒤 식약처 정보를 검색할 수 있어요.');
      const response = await fetch('/api/medicines', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }), cache: 'no-store', signal: AbortSignal.any([run.signal, AbortSignal.timeout(10000)]),
      });
      if (run.signal.aborted) return;
      if (!response.ok) throw new Error(response.status === 503
        ? '식약처 검색 키가 아직 설정되지 않았어요. 약봉투를 보고 직접 추가할 수 있어요.'
        : '제품을 검색하지 못했어요. 다시 시도하거나 직접 추가해 주세요.');
      const result = await response.json() as { items: MedicineCatalogItem[] };
      if (run.signal.aborted) return;
      setFound(result.items);
      if (!result.items.length) setNotice('검색 결과가 없어요. 약봉투의 이름과 복약 안내를 직접 입력할 수 있어요.');
    } catch (error) { if (!run.signal.aborted) setNotice(error instanceof Error ? error.message : '검색에 연결하지 못했어요.'); }
    finally { if (!run.signal.aborted) setLookupBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!garden?.ready || saving) return;
    const parsed = medicineSchema.safeParse(draft);
    if (!parsed.success) { setNotice('약 이름을 적고, 복용하는 시간대를 하나 이상 선택해 주세요.'); return; }
    setSaving(true); setNotice('');
    try {
      rowId.current ??= newLocalId();
      await garden.saveMedicine(rowId.current, parsed.data);
      onClose();
    } catch (error) { setNotice(error instanceof Error ? error.message : '약을 저장하지 못했어요.'); }
    finally { setSaving(false); }
  }
  return <form className="quiet-card personal-form" onSubmit={event => void submit(event)}>
    <h2>{medicine ? '약 정보 수정' : '약 등록'}</h2>
    <label>약 이름<input value={draft.name} maxLength={180} required onChange={event => {
      request.current?.abort(); setLookupBusy(false); setFound([]); setNotice('');
      setDraft({ ...draft, name: event.target.value, catalog: null });
    }} disabled={saving}/></label>
    {garden?.signedIn && <button type="button" className="secondary-button" disabled={lookupBusy || saving} onClick={() => void lookup()}>
      {lookupBusy ? '식약처 정보 검색 중…' : '식약처 e약은요에서 검색'}</button>}
    {found.length > 0 && <ul className="drug-results" aria-label="식약처 검색 결과">{found.map(product =>
      <li key={product.code}><button type="button" className="drug-result" onClick={() => {
        setDraft({ ...draft, name: product.name, catalog: product }); setFound([]); setNotice('');
      }}><DrugPhoto product={product}/><span><strong>{product.name}</strong><small>{product.manufacturer}</small></span></button></li>)}</ul>}
    {draft.catalog && <p className="quiet-note">식약처 정보 연결 · {draft.catalog.manufacturer || draft.catalog.code}</p>}
    <label>표시 함량 (선택)<input value={draft.strength} maxLength={50} onChange={event => setDraft({ ...draft, strength: event.target.value })} disabled={saving}/></label>
    <fieldset><legend>복용하는 시간대</legend><div className="period-choices">{PERIODS.map(period => <label key={period}>
      <Icon name={periodIcon[period]} size={17}/><input type="checkbox" checked={draft.periods.includes(period)} disabled={saving}
        onChange={event => setDraft({ ...draft, periods: event.target.checked ? [...draft.periods, period] : draft.periods.filter(item => item !== period) })}/>
      {PERIOD_LABELS[period]}</label>)}</div></fieldset>
    <label>내 복용 안내 (선택)<textarea value={draft.directions} maxLength={400} rows={2} placeholder="약봉투나 약사 안내에서 옮겨 적어요." disabled={saving}
      onChange={event => setDraft({ ...draft, directions: event.target.value })}/></label>
    {notice && <p className="quiet-note" role="status">{notice}</p>}
    <div className="quiet-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? '저장 중…' : '약 저장'}</button>
      <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>닫기</button></div>
  </form>;
}

function ReminderForm({ initial }: { initial: Reminders }) {
  const garden = usePersonalGarden();
  const [draft, setDraft] = useState(initial);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const calendar = garden ? medicationCalendar(garden.medications, garden.reminders) : '';
  return <form className="quiet-card personal-form" onSubmit={async event => {
    event.preventDefault();
    if (!garden?.ready || busy) return;
    setBusy(true); setNotice('');
    try { await garden.saveReminders(draft); setNotice('복약 알림 시간을 저장했어요.'); }
    catch { setNotice('알림 시간을 저장하지 못했어요.'); }
    finally { setBusy(false); }
  }}>
    <h2><Icon name="bell" size={19}/> 복약 알림</h2>
    <p>해당 시간대에 등록한 약이 있으면 열린 웹앱에서 알림을 받아요.</p>
    {PERIODS.map(period => <div className="reminder-row" key={period}>
      <label><input type="checkbox" checked={draft[period].enabled} disabled={busy} onChange={event =>
        setDraft({ ...draft, [period]: { ...draft[period], enabled: event.target.checked } })}/>{PERIOD_LABELS[period]} 알림</label>
      <input aria-label={PERIOD_LABELS[period] + ' 알림 시간'} type="time" required value={draft[period].time} disabled={busy}
        onChange={event => setDraft({ ...draft, [period]: { ...draft[period], time: event.target.value } })}/>
    </div>)}
    <button className="primary-button" type="submit" disabled={busy}>알림 시간 저장</button>
    <div className="quiet-actions">
      <button type="button" className="secondary-button" onClick={async () => {
        try {
          const permission = await allowMedicationNotifications();
          setNotice(permission === 'granted' ? '기기 알림을 켰어요.' : '이 브라우저에서는 웹앱을 열어 두면 화면에서 알림을 볼 수 있어요.');
        } catch { setNotice('화면에서 알림을 볼 수 있어요. 브라우저 알림 설정도 확인해 주세요.'); }
      }}>기기 알림 허용</button>
      <button type="button" className="secondary-button" disabled={!calendar} onClick={() => {
        const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
        const download = document.createElement('a');
        download.href = url; download.download = '복약-알림.ics';
        document.body.appendChild(download); download.click(); download.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        setNotice('파일을 휴대폰 캘린더에 추가하면 웹앱을 닫은 뒤에도 캘린더 알림을 받을 수 있어요.');
      }}>캘린더 알림 파일</button>
    </div>
    <small>캘린더에 추가한 반복 알림은 캘린더에서 수정하거나 지워 주세요.</small>
    {notice && <p className="quiet-note" role="status">{notice}</p>}
  </form>;
}

export default function MedicationManagement() {
  const garden = usePersonalGarden();
  const [edit, setEdit] = useState<Medicine | 'new' | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [alarms, setAlarms] = useState(false);
  const [labels, setLabels] = useState(false);
  if (!garden?.ready) return <div className="quiet-card" role="status">
    <p>{garden?.error ? '복약 정보를 불러오지 못했어요.' : '복약 정보를 불러오고 있어요.'}</p>
    {garden?.error && <button type="button" className="secondary-button" onClick={garden.reload}>다시 시도</button>}
  </div>;
  return <>
    <div className="personal-toolbar">
      <button type="button" className="secondary-button" onClick={() => setEdit(edit === 'new' ? null : 'new')}><Icon name="plus" size={17}/>약 등록</button>
      <button type="button" className="secondary-button" aria-expanded={alarms} onClick={() => setAlarms(!alarms)}><Icon name="bell" size={17}/>알림 설정</button>
      <button type="button" className="secondary-button" aria-expanded={labels} onClick={() => setLabels(!labels)}><Icon name="camera" size={17}/>포장 확인</button>
    </div>
    <p className="quiet-note">처방과 약사 안내에 맞춰 내 복용 시간대를 등록해 주세요.</p>
    {edit && <MedicineForm key={edit === 'new' ? edit : edit.id} medicine={edit === 'new' ? null : edit} onClose={() => setEdit(null)}/>}
    {alarms && <ReminderForm initial={garden.reminders}/>}
    {labels && <MedicationMission day={localDay()} key={localDay()} planned={garden.medications}/>}
    {notice && <p role="alert" className="quiet-note">{notice}</p>}
    {PERIODS.map(period => {
      const rows = garden.medications.filter(medicine => medicine.periods.includes(period));
      const alarm = garden.reminders[period];
      return <section className="quiet-card medication-period" key={period} aria-label={PERIOD_LABELS[period] + ' 복약 목록'}>
        <div className="quiet-section-head"><h2><Icon name={periodIcon[period]} size={19}/>{PERIOD_LABELS[period]}</h2>
          {alarm.enabled && rows.length > 0 && <span className="quiet-tag"><Icon name="bell" size={14}/>{alarm.time}</span>}</div>
        {rows.length === 0 ? <p className="quiet-note">등록한 약이 없어요.</p> : <ul className="drug-list">{rows.map(medicine =>
          <li key={medicine.id} className="drug-row">
            <DrugPhoto key={medicine.catalog?.code ?? 'manual'} product={medicine.catalog}/>
            <div className="drug-details"><h3>{medicine.name}{medicine.strength && <small> · {medicine.strength}</small>}</h3>
              {medicine.directions && <p>{medicine.directions}</p>}
              {medicine.catalog && <><p className="drug-effect">{medicine.catalog.effect}</p>
                {medicine.catalog.howToUse && <details><summary>식약처 제공 복용법</summary><p>{medicine.catalog.howToUse}</p>
                  <a className="text-button" href="https://www.data.go.kr/data/15075057/openapi.do" target="_blank" rel="noreferrer">식약처 e약은요 출처</a></details>}</>}
              {remove === medicine.id && <div className="quiet-actions"><span>모든 시간대에서 이 약을 지울까요?</span>
                <button type="button" className="secondary-button" disabled={busy} onClick={async () => {
                  setBusy(true); setNotice('');
                  try { await garden.removeMedicine(medicine.id); setRemove(null); if (edit && edit !== 'new' && edit.id === medicine.id) setEdit(null); }
                  catch { setNotice('약을 지우지 못했어요.'); }
                  finally { setBusy(false); }
                }}>삭제</button><button type="button" className="text-button" onClick={() => setRemove(null)}>취소</button></div>}
            </div>
            <div className="drug-actions"><button type="button" className="icon-button" aria-label={medicine.name + ' 수정'} onClick={() => { setEdit(medicine); setRemove(null); }}><Icon name="edit" size={17}/></button>
              <button type="button" className="icon-button" aria-label={medicine.name + ' 삭제 열기'} onClick={() => setRemove(medicine.id)}><Icon name="close" size={16}/></button></div>
          </li>)}</ul>}
      </section>;
    })}
  </>;
}
