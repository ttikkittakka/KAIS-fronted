'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { normalizeAnswers } from '../questions';
import { RECOVERY_MISSIONS, isRecoveryId, rankMissions, type MissionInput, type MissionResult, type RecoveryId, type VisionKind } from '../mission-policy';
import { diaryTags, trailingDays } from '../wellbeing';
import { localDay, type DailyCheckin } from '../daily-checkin';
import { readMissionLog } from '../missions';
import { gardenPreferences, setGardenPreferences } from '../preferences';
import { wellbeingResponse } from '../wellbeing-client';
import { nativeDevice, nativePhoto } from '../native-bridge';
import { checkMissionPhoto } from '../local-vision';
import CameraCapture, { cameraSupported } from './CameraCapture';
import { Icon } from './PetIcon';

function PhotoCheck({ kind, done, onDone, onClose }: { kind: VisionKind; done: boolean; onDone: () => void; onClose: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [shooting, setShooting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [match, setMatch] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function check(photo: File | undefined) {
    if (!photo) return;
    setBusy(true); setMatch(false); setStatus('기기에서 사진을 확인하고 있어요.');
    try {
      const seen = await checkMissionPhoto(photo, kind);
      if (!mounted.current) return;
      setMatch(seen);
      setStatus(seen ? kind === 'cup' ? '사진에서 컵을 찾았어요.' : '사진에서 두 팔이 올라간 자세를 찾았어요.'
        : '사진에서 확인하기 어려웠어요. 다시 찍거나 직접 완료해도 돼요.');
    } catch { if (mounted.current) setStatus('사진 분석을 사용할 수 없어요. 직접 완료해도 돼요.'); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function capture() {
    if (!nativeDevice()) {
      if (cameraSupported()) setShooting(true);
      else file.current?.click();
      return;
    }
    setBusy(true); setMatch(false); setStatus('');
    try { await check(await nativePhoto() ?? undefined); }
    catch (error) { if (mounted.current) setStatus(error instanceof Error ? error.message : '카메라를 열지 못했어요.'); }
    finally { if (mounted.current) setBusy(false); }
  }

  return <div className="mission-vision">
    <div className="quiet-section-head"><h3>카메라로 확인하기</h3><Button icon={<Icon name="close" size={17}/>} label="카메라 확인 접기" isIconOnly onClick={onClose}/></div>
    <p>{kind === 'cup' ? '물컵이 보이도록 찍어 보세요.' : '어깨와 두 팔이 보이게 찍어 보세요.'} 사진은 기기에서만 확인하고 저장하지 않아요.</p>
    <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={event => { const photo = event.target.files?.[0]; event.target.value = ''; void check(photo); }}/>
    <div className="quiet-actions">
      <Button label="촬영" icon={<Icon name="camera" size={17}/>} isLoading={busy} isDisabled={done} onClick={() => void capture()}/>
      <Button label={match ? '도전을 마쳤어요' : '직접 완료'} variant={match ? 'primary' : 'secondary'} isDisabled={busy || done} onClick={onDone}/>
    </div>
    {shooting && <CameraCapture onShot={photo => void check(photo)} onClose={() => setShooting(false)}/>}
    {status && <p role="status" className="quiet-note">{status}</p>}
  </div>;
}

const sourceLabel: Record<MissionResult['source'], string> = { ai: 'AI 맞춤', rules: '상태 맞춤', offline: '기기에서 추천' };

export default function RecoveryMissions({ record, records, onComplete, onMap, onConnections }: {
  record: DailyCheckin | null; records: DailyCheckin[]; onComplete: (id: RecoveryId) => boolean; onMap: () => void; onConnections: () => void;
}) {
  const today = localDay();
  const [log] = useState(readMissionLog);
  const [prefs, setPrefs] = useState(gardenPreferences);
  const [server, setServer] = useState<{ key: string; result: MissionResult }>();
  const [vision, setVision] = useState<RecoveryId | null>(null);
  const [error, setError] = useState('');
  const hour = new Date().getHours();
  const done = [...(record?.completedMissionIds ?? []), ...(log.done[today] ?? [])];
  const recentDays = trailingDays(8, today).slice(0, -1);
  const input: MissionInput = {
    answers: normalizeAnswers(record?.answers).map(value => value ?? null),
    tags: diaryTags(record?.note, record?.photoComment),
    outing: record?.outing,
    part: hour < 11 ? 'morning' : hour < 19 ? 'afternoon' : 'evening',
    pace: prefs.pace,
    recent: Array.from(new Set([
      ...recentDays.flatMap(day => log.done[day] ?? []),
      ...records.filter(row => recentDays.includes(row.date)).flatMap(row => row.completedMissionIds ?? []),
    ])).filter(isRecoveryId),
    skipped: prefs.skipped?.date === today ? prefs.skipped.ids : [],
  };
  const key = JSON.stringify(input);
  const ranked = rankMissions(input);
  const result = server?.key === key ? server.result : { ...ranked, ids: ranked.ids.slice(0, 3), source: 'offline' as const };
  useEffect(() => {
    const controller = new AbortController();
    const request = JSON.parse(key) as MissionInput;
    void wellbeingResponse<MissionResult>({ kind: 'missions', ...request }, prefs.ai, controller.signal).then(response => {
      if (controller.signal.aborted || !Array.isArray(response.ids) || !response.ids.every(isRecoveryId) ||
          !['ai', 'rules'].includes(response.source) || typeof response.reason !== 'string') return;
      setServer({ key, result: response });
    }, () => {});
    return () => controller.abort();
  }, [key, prefs.ai]);

  const complete = (id: RecoveryId) => {
    if (done.includes(id)) return;
    if (onComplete(id)) { setVision(null); setError(''); }
    else setError('미션을 저장하지 못했어요.');
  };
  const skip = (id: RecoveryId) => {
    try {
      setPrefs(setGardenPreferences({ skipped: { date: today, ids: [...new Set([...input.skipped, id])] } }));
      setVision(null); setError('');
    } catch { setError('미션을 바꾸지 못했어요.'); }
  };

  return <section className="recovery-missions" aria-labelledby="recovery-title">
    <div className="quiet-section-head"><h2 id="recovery-title">오늘의 미션</h2><span className="quiet-tag"><Icon name="sparkle" size={15}/>{sourceLabel[result.source]}</span></div>
    <p className="quiet-note">{result.reason}</p>
    <ul className="recovery-list">{result.ids.map(id => {
      const mission = RECOVERY_MISSIONS.find(item => item.id === id)!;
      const completed = done.includes(id);
      return <li className={'quiet-card mission-card' + (completed ? ' mission-completed' : '')} key={id}>
        <div className="mission-row"><span className="mission-symbol"><Icon name={mission.icon} size={23}/></span><div><h3>{mission.title}</h3><small>{completed ? '완료했어요' : mission.minutes + '분'}</small></div>
          {!completed && <div className="quiet-actions">
            <Button icon={<Icon name="check" size={18}/>} label={mission.title + ' 완료'} isIconOnly variant="primary" onClick={() => complete(id)}/>
            <Button icon={<Icon name="close" size={17}/>} label={mission.title + ' 대신 다른 미션'} isIconOnly onClick={() => skip(id)}/>
          </div>}
        </div>
        {!completed && <><p>{mission.detail}</p><div className="quiet-actions">
          {'camera' in mission && <Button icon={<Icon name="camera" size={17}/>} label={mission.title + ' 카메라 열기'} isIconOnly onClick={() => setVision(vision === id ? null : id)}/>}
          {id === 'outdoor-visit' && <Button icon={<Icon name="map" size={17}/>} label="산책 장소 보기" isIconOnly onClick={onMap}/>}
          {id === 'send-hello' && <Button icon={<Icon name="phone" size={17}/>} label="연락처 보기" isIconOnly onClick={onConnections}/>}
        </div></>}
        {vision === id && 'camera' in mission && <PhotoCheck kind={mission.camera} done={completed} onDone={() => complete(id)} onClose={() => setVision(null)}/>}
      </li>;
    })}</ul>
    {result.ids.length === 0 && <p className="quiet-note">오늘은 쉬어 가도 괜찮아요.</p>}
    {error && <p role="alert" className="quiet-status">{error}</p>}
  </section>;
}
