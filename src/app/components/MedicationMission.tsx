'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@astryxdesign/core/Button';
import { compareMedicineLabels, MEDICINE_LIMIT, medicineLabelKey, parseMedicineLabel, readMedicineDay, updateMedicineDay, type MedicineLabel } from '../medicine-label';
import { readMedicinePhoto } from '../medicine-ocr';
import MissionPhotoInput from './MissionPhotoInput';
import { Icon } from './PetIcon';
import type { Medicine } from '../personal-garden';

export default function MedicationMission({ day, planned = [] }: { day: string; planned?: Medicine[] }) {
  const [entries, setEntries] = useState(() => readMedicineDay(day));
  const [selected, setSelected] = useState('');
  const [choices, setChoices] = useState<MedicineLabel[]>([]);
  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [photoPreview, setPhotoPreview] = useState<{ mode: 'source' | 'today'; url: string }>();
  const [comparison, setComparison] = useState<{ key: string; read: MedicineLabel[] }>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview.url); }, [photoPreview]);
  const active = entries.find(entry => medicineLabelKey(entry) === selected) ?? entries.find(entry => !entry.checked) ?? entries[0];
  const outcome = active && comparison?.key === medicineLabelKey(active) ? compareMedicineLabels(active, comparison.read) : undefined;
  const checked = entries.filter(entry => entry.checked).length;
  const remembered = planned.flatMap(medicine => {
    const label = parseMedicineLabel(medicine.name, medicine.strength);
    return label && !entries.some(entry => medicineLabelKey(entry) === medicineLabelKey(label)) ? [{ id: medicine.id, label }] : [];
  });

  async function scan(photo: File, mode: 'source' | 'today') {
    controller.current?.abort();
    const run = new AbortController();
    controller.current = run;
    setBusy(true);
    setPhotoPreview(undefined);
    setNotice('기기에서 글자를 읽고 있어요. 처음에는 언어 자료를 불러와요.');
    if (mode === 'source') {
      setChoices([]); setName(''); setStrength(''); setReviewed(false);
    } else setComparison(undefined);
    try {
      const result = await readMedicinePhoto(photo, run.signal);
      if (run.signal.aborted) return;
      setPhotoPreview({ mode, url: URL.createObjectURL(photo) });
      if (mode === 'source') {
        setChoices(result);
        if (result.length === 1) { setName(result[0].name); setStrength(result[0].strength); }
        setNotice(result.length ? '원본과 비교해 오늘 확인할 제품을 골라 주세요.' : '글자를 읽기 어려워요. 제품명과 함량을 직접 입력할 수 있어요.');
      } else if (active) {
        setComparison({ key: medicineLabelKey(active), read: result });
        setNotice('');
      }
    } catch {
      if (!run.signal.aborted) setNotice('글자 읽기에 연결되지 않았어요. 라벨이 선명한 사진으로 다시 시도해 주세요.');
    } finally { if (!run.signal.aborted) setBusy(false); }
  }

  function register() {
    const entry = parseMedicineLabel(name, strength);
    if (!entry) { setNotice('제품명과 표시 함량을 따로 입력해 주세요. 예시 함량은 250 mg이에요.'); return; }
    if (!reviewed) return;
    try {
      const key = medicineLabelKey(entry);
      setEntries(updateMedicineDay(day, current => {
        if (current.some(row => medicineLabelKey(row) === key)) throw new Error('이미 등록한 라벨이에요.');
        if (current.length >= MEDICINE_LIMIT) throw new Error('오늘은 라벨을 6개까지 등록할 수 있어요.');
        return [...current, { ...entry, checked: false }];
      }));
      setSelected(key); setComparison(undefined); setPhotoPreview(undefined); setChoices([]); setName(''); setStrength(''); setReviewed(false);
      setNotice('오늘 확인할 라벨을 등록했어요.');
    } catch (error) { setNotice(error instanceof Error ? error.message : '라벨을 저장하지 못했어요.'); }
  }

  function review(label: MedicineLabel, action: 'check' | 'remove' | 'reset') {
    const key = medicineLabelKey(label);
    try {
      setEntries(updateMedicineDay(day, current => action === 'remove'
        ? current.filter(row => medicineLabelKey(row) !== key)
        : current.map(row => medicineLabelKey(row) === key ? { ...row, checked: action === 'check' } : row)));
      setComparison(undefined);
      setPhotoPreview(undefined);
      setNotice(action === 'check' ? '원본과 포장 라벨 비교를 확인했어요.' : '');
    } catch { setNotice('라벨 상태를 저장하지 못했어요. 오늘 미션을 다시 열어 주세요.'); }
  }

  return <section className="mission-vision medicine-mission" aria-label="오늘 약 포장 확인">
    <div className="quiet-section-head"><h3>오늘 약 포장 확인</h3>{entries.length > 0 && <span>{checked}/{entries.length} 확인</span>}</div>
    <p>사진은 이 기기에서 글자로 읽어요. 복용 여부는 처방 지시와 약사 안내로 확인해 주세요.</p>
    <details open={entries.length === 0 || undefined}>
      <summary>처방전·약봉투에서 오늘 확인할 약 등록</summary>
      {remembered.length > 0 && <ul className="medicine-entries" aria-label="저장한 약에서 가져오기">{remembered.map(({ id, label }) =>
        <li key={id}><Button label={label.name + ' ' + label.strength + ' 가져오기'} isDisabled={busy} onClick={() => {
          setName(label.name); setStrength(label.strength); setReviewed(false); setChoices([]); setPhotoPreview(undefined);
        }}/></li>)}</ul>}
      <p>제품명과 함량이 한 줄에 보이도록 찍어 주세요. 개인정보 부분은 가려도 돼요.</p>
      <MissionPhotoInput label="처방전·약봉투 사진" disabled={busy || entries.length >= MEDICINE_LIMIT} onPhoto={photo => void scan(photo, 'source')}/>
      {photoPreview?.mode === 'source' && <Image src={photoPreview.url} alt="등록에 사용할 약 라벨 사진" width={224} height={136}
        unoptimized className="mission-proof-image"/>}
      {choices.length > 1 && <ul className="medicine-entries">{choices.map(choice =>
        <li key={medicineLabelKey(choice)}><Button label={choice.name + ' ' + choice.strength} isDisabled={busy} onClick={() => {
          setName(choice.name); setStrength(choice.strength); setReviewed(false);
        }}/></li>)}</ul>}
      <form className="medicine-form" onSubmit={event => { event.preventDefault(); register(); }}>
        <label>제품명<input value={name} maxLength={65} required disabled={busy} onChange={event => { setName(event.target.value); setReviewed(false); }}/></label>
        <label>표시 함량<input value={strength} maxLength={30} required disabled={busy} placeholder="250 mg" onChange={event => { setStrength(event.target.value); setReviewed(false); }}/></label>
        <label className="medicine-consent"><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)}/>
          원본의 제품명과 함량을 확인했고 오늘 목록에 추가해요.</label>
        <Button label="오늘 라벨 등록" type="submit" isDisabled={!reviewed || busy || entries.length >= MEDICINE_LIMIT}/>
      </form>
    </details>
    {entries.length > 0 && <ul className="medicine-entries">{entries.map(entry => {
      const key = medicineLabelKey(entry);
      return <li key={key}><Button label={entry.name + ' ' + entry.strength + (entry.checked ? ' · 확인함' : '')}
        variant={active === entry ? 'primary' : 'secondary'} isDisabled={busy} onClick={() => { setSelected(key); setComparison(undefined); setPhotoPreview(undefined); setNotice(''); }}/>
        <Button icon={<Icon name="close" size={16}/>} label={entry.name + ' 오늘 목록에서 삭제'} isIconOnly isDisabled={busy} onClick={() => review(entry, 'remove')}/></li>;
    })}</ul>}
    {active && (active.checked
      ? <Button label="이 라벨 다시 확인" onClick={() => review(active, 'reset')}/>
      : <>
        <p>오늘 준비한 약의 포장 라벨을 찍어요. 제품명과 함량이 모두 보여야 해요.</p>
        <MissionPhotoInput label="오늘 약 포장 사진" disabled={busy} onPhoto={photo => void scan(photo, 'today')}/>
        {photoPreview?.mode === 'today' && <Image src={photoPreview.url} alt="촬영한 오늘의 약 포장 라벨" width={224} height={136}
          unoptimized className="mission-proof-image"/>}
        {outcome && <div className="medicine-compare" role="status">
          {comparison?.read.length === 1 && <dl><dt>등록한 글자</dt><dd>{active.name} {active.strength}</dd>
            <dt>포장에서 읽은 글자</dt><dd>{comparison.read[0].name} {comparison.read[0].strength}</dd></dl>}
          <p>{outcome === 'match' ? '제품명과 함량 글자가 같아요. 실제 라벨을 한 번 더 비교해 주세요.'
            : outcome === 'mismatch' ? '제품명이나 함량 글자가 달라요. 약봉투 원본과 약사 안내를 확인해 주세요.'
            : '한 개의 라벨을 읽기 어려워요. 제품명과 함량 부분만 선명하게 다시 찍어 주세요.'}</p>
          {outcome === 'match' && <Button label="직접 비교했어요" variant="primary" onClick={() => review(active, 'check')}/>}
        </div>}
      </>)}
    {notice && <p role="status" className="quiet-note">{notice}</p>}
  </section>;
}
