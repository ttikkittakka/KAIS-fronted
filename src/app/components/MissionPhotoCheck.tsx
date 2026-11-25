'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@astryxdesign/core/Button';
import { dataScope } from '../app-storage';
import { localDay } from '../daily-checkin';
import { checkMissionPhoto } from '../local-vision';
import { readPhotoLabel, savePhotoLabel, verifyPhotoWithAI } from '../mission-photo-client';
import type { VisionKind } from '../mission-photo';
import MissionPhotoInput from './MissionPhotoInput';
import { Icon } from './PetIcon';

const hints: Record<VisionKind, string> = {
  cup: '컵 안에 물이 보이도록 옆 위에서 찍어 주세요.',
  book: '책 표지나 펼친 책이 사진 가운데에 오게 찍어 주세요.',
  meal: '준비한 음식이 사진 가운데에 오게 찍어 주세요.',
  music: '곡 제목과 재생 중 표시가 보이는 화면 캡처를 올려 주세요.',
  arms: '어깨와 두 팔이 보이게 찍어 주세요.',
};

export default function MissionPhotoCheck({ kind, day, onDone, onClose }: {
  kind: VisionKind; day: string; onDone: () => boolean; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [poseMatched, setPoseMatched] = useState(false);
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  const [consent, setConsent] = useState(false);
  const [label, setLabel] = useState(() => kind === 'arms' ? '' : readPhotoLabel(kind, day));
  const pending = useRef<AbortController | null>(null);
  const canUseAI = kind !== 'arms' && dataScope() === 'account';
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  function finish() {
    if (day !== localDay()) setStatus('날짜가 바뀌었어요. 오늘의 돌봄을 다시 열어 주세요.');
    else if (!onDone()) setStatus('사진은 확인했지만 완료를 저장하지 못했어요. 다시 시도해 주세요.');
  }

  async function check(file: File) {
    setPreview(undefined); setConsent(false); setUnknown(false); setPoseMatched(false);
    if (!file.type.startsWith('image/') || file.size > 15_000_000) {
      setStatus('15MB보다 작은 사진을 골라 주세요.');
      return;
    }
    if (canUseAI) setPreview({ file, url: URL.createObjectURL(file) });
    if (kind === 'music' || (kind === 'cup' && canUseAI)) {
      setStatus(canUseAI ? '사진을 검토한 뒤 AI 확인을 시작해 주세요.' : '로그인하면 AI로 재생 화면을 확인할 수 있어요.');
      return;
    }
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setBusy(true); setStatus('기기에서 사진을 확인하고 있어요.');
    try {
      const seen = await checkMissionPhoto(file, kind);
      if (controller.signal.aborted) return;
      if (seen && (kind === 'book' || kind === 'meal')) { finish(); return; }
      if (kind === 'arms') setPoseMatched(seen);
      setUnknown(!seen && kind !== 'arms');
      setStatus(seen
        ? kind === 'cup' ? '컵을 찾았어요. 컵 안의 물은 AI 사진 확인으로 살펴볼 수 있어요.' : '사진에서 두 팔이 올라간 자세를 찾았어요.'
        : '사진 속 대상을 확인하기 어려워요. 다시 찍어 볼까요?');
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : '기기에서 사진을 확인할 수 없어요.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  async function checkAI() {
    if (!preview || !canUseAI || !consent || busy) return;
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setBusy(true); setConsent(false); setUnknown(false); setStatus('AI가 사진 속 내용을 확인하고 있어요.');
    try {
      const { evidence, verdict } = await verifyPhotoWithAI(preview.file, kind, controller.signal);
      if (controller.signal.aborted) return;
      if (verdict === 'match') { finish(); return; }
      setUnknown(evidence === 'unclear' || evidence === 'other');
      setStatus(evidence === 'empty-cup' && kind === 'cup' ? '빈 컵으로 보여요. 물을 담고 다시 찍어 주세요.'
        : verdict === 'unknown' ? '사진 속 대상을 확인하기 어려워요.'
        : '이 돌봄에 맞는 사진을 확인하지 못했어요.');
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : '사진을 확인하지 못했어요. 다시 시도해 주세요.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <div className="mission-vision">
    <div className="quiet-section-head"><h3>사진으로 확인하기</h3><Button icon={<Icon name="close" size={17}/>} label="사진 확인 접기" isIconOnly onClick={onClose}/></div>
    <p>{hints[kind]}</p>
    <MissionPhotoInput label={kind === 'music' ? '화면 캡처' : '돌봄 사진'} uploadOnly={kind === 'music'} disabled={busy} onPhoto={photo => void check(photo)}/>
    {status && <p role="status" className="quiet-note">{status}</p>}
    {poseMatched && <Button label="자세 확인 완료" variant="primary" onClick={finish}/>}
    {preview && canUseAI && <div className="photo-consent">
      <Image src={preview.url} alt="선택한 돌봄 사진" width={224} height={136} unoptimized className="mission-proof-image"/>
      <label><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/>
        선택한 사진을 OpenAI에 보내 확인하는 데 동의해요. 처방전과 개인정보가 담긴 사진은 제외해 주세요.</label>
      <Button label="AI로 사진 확인" isDisabled={!consent || busy} onClick={() => void checkAI()}/>
    </div>}
    {unknown && kind !== 'arms' && <form className="photo-label-form" onSubmit={event => {
      event.preventDefault();
      try {
        if (day !== localDay()) throw new Error('날짜가 바뀌었어요.');
        savePhotoLabel(kind, day, label);
        setStatus(label.trim() ? '이름을 이 기기에 남겼어요.' : '남겨 둔 이름을 지웠어요.');
      } catch { setStatus('이름을 저장하지 못했어요. 오늘의 돌봄을 다시 열어 주세요.'); }
    }}>
      <label>이건 어떤 물건인가요?<input value={label} maxLength={40} onChange={event => setLabel(event.target.value)} placeholder="물건 이름"/></label>
      <Button label="이름 저장" type="submit" isDisabled={busy}/>
    </form>}
  </div>;
}
