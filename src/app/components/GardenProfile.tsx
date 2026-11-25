'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { companion } from '../companions';
import { newLocalId } from '../record-store';
import { PERIODS, PERIOD_LABELS, displayNameSchema, emptyMedicine, profileSchema, type GardenProfile as Profile, type Period, type PlantId } from '../personal-garden';
import GardenLoading from './GardenLoading';
import { usePersonalGarden } from './PersonalGarden';
import { Icon } from './PetIcon';

const initial: Profile = { displayName: '', temperament: 'balanced', support: 'either', pace: 'any' };

export function FirstGardenSetup({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const garden = usePersonalGarden();
  const [later, setLater] = useState(false);
  if (!garden || later || garden.profile) return children;
  return <main className="app-shell"><div className="phone-frame">
    {!garden.ready && !garden.error ? <GardenLoading/> : <section className="screen work-screen">
      <div className="work-area personal-area">
        {garden.error ? <div className="quiet-card"><h1>계정 설정을 불러오지 못했어요</h1>
          <div className="quiet-actions"><button className="primary-button" type="button" onClick={garden.reload}>다시 시도</button>
            <button className="secondary-button" type="button" onClick={() => setLater(true)}>정원 열기</button></div></div>
          : <><GardenProfileForm first/><button type="button" className="text-button" onClick={() => setLater(true)}>나중에 설문하기</button></>}
        <button type="button" className="text-button" onClick={onLogout}>다른 계정으로 로그인</button>
      </div>
    </section>}
  </div></main>;
}

export function GardenProfileForm({ first = false, onDone }: { first?: boolean; onDone?: () => void }) {
  const garden = usePersonalGarden();
  const [edited, setDraft] = useState<Profile | null>(null);
  const draft = edited ?? garden?.profile ?? initial;
  const [firstMedicine, setFirstMedicine] = useState('');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [medicineConsent, setMedicineConsent] = useState(false);
  const medicineId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!garden?.ready || busy) return;
    const parsed = profileSchema.safeParse(draft);
    if (!parsed.success) { setNotice('불리고 싶은 이름을 24자 이내로 적어 주세요.'); return; }
    if (firstMedicine.trim() && !periods.length) { setNotice('등록할 약의 복용 시간대를 직접 선택해 주세요.'); return; }
    if (firstMedicine.trim() && !medicineConsent) { setNotice('복약 정보를 저장하려면 선택 동의가 필요해요.'); return; }
    setBusy(true); setNotice('');
    try {
      if (first && firstMedicine.trim()) {
        medicineId.current ??= newLocalId();
        const alreadySaved = garden.medications.some(row => row.name === firstMedicine.trim() &&
          row.periods.length === periods.length && periods.every(period => row.periods.includes(period)));
        if (!alreadySaved) await garden.saveMedicine(medicineId.current, { ...emptyMedicine(), name: firstMedicine.trim(), periods });
      }
      await garden.saveProfile(parsed.data);
      setNotice('계정 설정을 저장했어요.');
      onDone?.();
    } catch (error) { setNotice(error instanceof Error ? error.message : '설정을 저장하지 못했어요.'); }
    finally { setBusy(false); }
  }

  if (!garden?.ready) return <div className="quiet-card" role="status">
    <p>{garden?.error ? '개인 설정을 불러오지 못했어요.' : '개인 설정을 불러오고 있어요.'}</p>
    {garden?.error && <button className="secondary-button" type="button" onClick={garden.reload}>다시 시도</button>}
  </div>;
  return <form className="quiet-card personal-form" onSubmit={event => void submit(event)}>
    {first && <header className="personal-form-heading"><Icon name="leaf" size={26}/><div><h1>나에게 맞는 정원 시작하기</h1><p>답변은 설정에서 언제든 바꿀 수 있어요.</p></div></header>}
    <label>불리고 싶은 이름<input name="displayName" value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} autoComplete="nickname" maxLength={24} required disabled={busy}/></label>
    <label>나와 가까운 성향<select value={draft.temperament} onChange={event => setDraft({ ...draft, temperament: event.target.value as Profile['temperament'] })} disabled={busy}>
      <option value="balanced">그날그날 달라요</option><option value="calm">조용한 시간을 좋아해요</option><option value="curious">새로운 활동을 좋아해요</option>
    </select></label>
    <label>선호하는 응원<select value={draft.support} onChange={event => setDraft({ ...draft, support: event.target.value as Profile['support'] })} disabled={busy}>
      <option value="either">상관없어요</option><option value="quiet">차분하게 말해 주세요</option><option value="encouraging">힘차게 응원해 주세요</option>
    </select></label>
    <label>돌봄을 하기 편한 곳<select value={draft.pace} onChange={event => setDraft({ ...draft, pace: event.target.value as Profile['pace'] })} disabled={busy}>
      <option value="any">오늘 상태에 맞춰서</option><option value="inside">실내</option><option value="outside">집 밖</option>
    </select></label>
    {first && <details className="personal-form">
      <summary>복용 중인 약 추가하기 (선택)</summary>
      <label>약 이름<input value={firstMedicine} onChange={event => setFirstMedicine(event.target.value)} maxLength={180} disabled={busy}/></label>
      <fieldset><legend>약봉투에 적힌 시간대</legend><div className="period-choices">{PERIODS.map(period => <label key={period}>
        <input type="checkbox" checked={periods.includes(period)} disabled={busy} onChange={event => setPeriods(event.target.checked
          ? [...periods, period] : periods.filter(item => item !== period))}/>{PERIOD_LABELS[period]}</label>)}</div></fieldset>
      <label className="quiet-check"><input type="checkbox" checked={medicineConsent} disabled={busy} onChange={event => setMedicineConsent(event.target.checked)}/>
        만 19세 이상이며, 입력한 약 정보를 내 계정에 저장하는 데 동의해요.</label>
    </details>}
    <button className="primary-button" type="submit" disabled={busy}>{busy ? '저장 중…' : first ? '저장하고 정원 열기' : '내 설정 저장'}</button>
    {notice && <p role="status">{notice}</p>}
  </form>;
}

export function PotNameForm({ plant, onDone }: { plant: PlantId; onDone: () => void }) {
  const garden = usePersonalGarden();
  const name = garden?.names[plant] ?? companion(plant).name;
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  return <form className="quiet-card personal-form" onSubmit={async event => {
    event.preventDefault();
    if (!garden?.ready || busy) return;
    const parsed = displayNameSchema.safeParse(draft ?? name);
    if (!parsed.success) { setNotice('화분 이름을 1~24자로 적어 주세요.'); return; }
    setBusy(true); setNotice('');
    try { await garden.saveName(plant, parsed.data); onDone(); }
    catch { setNotice('화분 이름을 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }}>
    <label>화분 이름<input value={draft ?? name} onChange={event => setDraft(event.target.value)} required maxLength={24} disabled={!garden?.ready || busy}/></label>
    {garden?.error && <button className="secondary-button" type="button" onClick={garden.reload}>이름 다시 불러오기</button>}
    <button className="primary-button" type="submit" disabled={!garden?.ready || busy}>{busy ? '저장 중…' : '이름 저장'}</button>
    {notice && <p role="alert">{notice}</p>}
  </form>;
}
