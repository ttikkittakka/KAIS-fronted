'use client';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { normalizeAnswers } from '../questions';
import { PHOTO_RECOVERY_IDS, RECOVERY_MISSIONS, isRecoveryId, rankMissions, type MissionInput, type MissionResult, type RecoveryId } from '../mission-policy';
import { diaryTags, trailingDays } from '../wellbeing';
import { localDay, type DailyCheckin } from '../daily-checkin';
import { readMissionLog } from '../missions';
import { gardenPreferences, setGardenPreferences } from '../preferences';
import { wellbeingResponse } from '../wellbeing-client';
import { readDevicePhotoCompletions, saveDevicePhotoCompletion } from '../mission-photo-client';
import MissionPhotoCheck from './MissionPhotoCheck';
import { usePersonalGarden } from './PersonalGarden';
import { Icon } from './PetIcon';

const sourceLabel: Record<MissionResult['source'], string> = { ai: 'AI 맞춤', rules: '상태 맞춤', offline: '기기에서 추천' };

type RecoveryProps = { record: DailyCheckin | null; records: DailyCheckin[]; onComplete: (id: RecoveryId) => boolean; onMap: () => void; onConnections: () => void; photoOnly?: false };
type PhotoOnlyProps = { photoOnly: true; record?: never; records?: never; onComplete?: never; onMap?: never; onConnections?: never };

export default function RecoveryMissions({ record, records = [], onComplete, onMap, onConnections, photoOnly = false }: RecoveryProps | PhotoOnlyProps) {
  const today = localDay();
  const profile = usePersonalGarden()?.profile;
  const [log] = useState(readMissionLog);
  const [prefs, setPrefs] = useState(gardenPreferences);
  const [server, setServer] = useState<{ key: string; result: MissionResult }>();
  const [vision, setVision] = useState<RecoveryId | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [deviceDone, setDeviceDone] = useState(() => photoOnly ? readDevicePhotoCompletions(today) : []);
  const [error, setError] = useState('');
  const hour = new Date().getHours();
  const done = photoOnly ? deviceDone : [...(record?.completedMissionIds ?? []), ...(log.done[today] ?? [])];
  const recentDays = trailingDays(8, today).slice(0, -1);
  const input: MissionInput = {
    answers: normalizeAnswers(record?.answers).map(value => value ?? null),
    tags: diaryTags(record?.note, record?.photoComment),
    outing: record?.outing,
    part: hour < 11 ? 'morning' : hour < 19 ? 'afternoon' : 'evening',
    pace: profile ? profile.pace !== 'any' ? profile.pace : profile.temperament === 'calm' ? 'inside'
      : profile.temperament === 'curious' ? 'outside' : 'any' : prefs.pace,
    recent: Array.from(new Set([
      ...recentDays.flatMap(day => log.done[day] ?? []),
      ...records.filter(row => recentDays.includes(row.date)).flatMap(row => row.completedMissionIds ?? []),
    ])).filter(isRecoveryId),
    skipped: prefs.skipped?.date === today ? prefs.skipped.ids : [],
  };
  const key = JSON.stringify(input);
  const ranked = rankMissions(input);
  const result = server?.key === key ? server.result : { ...ranked, ids: ranked.ids.slice(0, 3), source: 'offline' as const };
  const availablePhotos = PHOTO_RECOVERY_IDS.filter(id => !input.skipped.includes(id) || photoOnly);
  const visibleIds = photoOnly ? availablePhotos : showPhotos ? [...new Set([...result.ids, ...availablePhotos])] : result.ids;
  useEffect(() => {
    if (photoOnly) return;
    const controller = new AbortController();
    const request = JSON.parse(key) as MissionInput;
    void wellbeingResponse<MissionResult>({ kind: 'missions', ...request }, prefs.ai, controller.signal).then(response => {
      if (controller.signal.aborted || !Array.isArray(response.ids) || !response.ids.every(isRecoveryId) ||
          !['ai', 'rules'].includes(response.source) || typeof response.reason !== 'string') return;
      setServer({ key, result: response });
    }, () => {});
    return () => controller.abort();
  }, [key, prefs.ai, photoOnly]);

  const complete = (id: RecoveryId) => {
    if (done.includes(id)) return true;
    try {
      if (today !== localDay()) throw new Error('날짜가 바뀌었어요. 오늘 미션을 다시 열어 주세요.');
      if (photoOnly) setDeviceDone(saveDevicePhotoCompletion(today, id));
      else if (!onComplete?.(id)) throw new Error('미션을 저장하지 못했어요.');
      setVision(null); setError('');
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : '미션을 저장하지 못했어요.');
      return false;
    }
  };
  const skip = (id: RecoveryId) => {
    try {
      setPrefs(setGardenPreferences({ skipped: { date: today, ids: [...new Set([...input.skipped, id])] } }));
      setVision(null); setError('');
    } catch { setError('미션을 바꾸지 못했어요.'); }
  };

  return <section className="recovery-missions" aria-labelledby="recovery-title">
    <div className="quiet-section-head"><h2 id="recovery-title">{photoOnly ? '사진 미션' : '오늘의 미션'}</h2>{!photoOnly && <span className="quiet-tag"><Icon name="sparkle" size={15}/>{sourceLabel[result.source]}</span>}</div>
    <p className="quiet-note">{photoOnly ? '사진 미션 결과는 이 기기에 저장해요.' : profile?.support === 'quiet'
      ? '편한 미션 하나만 골라도 괜찮아요.' : profile?.support === 'encouraging' ? '해볼 만한 미션 하나를 골라 시작해 봐요!' : result.reason}</p>
    {!photoOnly && <div className="quiet-actions">
      <Button icon={<Icon name="camera" size={17}/>} label={showPhotos ? '사진 미션 접기' : '사진 미션 보기'} onClick={() => {
        setShowPhotos(!showPhotos); setVision(null);
      }}/>
    </div>}
    <ul className="recovery-list">{visibleIds.map(id => {
      const mission = RECOVERY_MISSIONS.find(item => item.id === id)!;
      const completed = done.includes(id);
      return <li className={'quiet-card mission-card' + (completed ? ' mission-completed' : '')} key={id}>
        <div className="mission-row"><span className="mission-symbol"><Icon name={mission.icon} size={23}/></span><div><h3>{mission.title}</h3><small>{completed ? '완료했어요' : mission.minutes + '분'}</small></div>
          {!completed && <div className="quiet-actions">
            <Button icon={<Icon name="check" size={18}/>} label={mission.title + ' 완료'} isIconOnly variant="primary" onClick={() => complete(id)}/>
            {!photoOnly && <Button icon={<Icon name="close" size={17}/>} label={mission.title + ' 대신 다른 미션'} isIconOnly onClick={() => skip(id)}/>}
          </div>}
        </div>
        {!completed && <><p>{mission.detail}</p><div className="quiet-actions">
          {'camera' in mission && <Button icon={<Icon name={mission.camera === 'music' ? 'upload' : 'camera'} size={17}/>} label={mission.title + (mission.camera === 'music' ? ' 캡처 올리기' : ' 카메라 열기')} isIconOnly onClick={() => setVision(vision === id ? null : id)}/>}
          {id === 'outdoor-visit' && <Button icon={<Icon name="map" size={17}/>} label="산책 장소 보기" isIconOnly onClick={onMap}/>}
          {id === 'send-hello' && <Button icon={<Icon name="phone" size={17}/>} label="연락처 보기" isIconOnly onClick={onConnections}/>}
        </div></>}
        {vision === id && !completed && 'camera' in mission && <MissionPhotoCheck kind={mission.camera} day={today} onDone={() => complete(id)} onClose={() => setVision(null)}/>}
      </li>;
    })}</ul>
    {visibleIds.length === 0 && <p className="quiet-note">오늘은 쉬어 가도 괜찮아요.</p>}
    {error && <p role="alert" className="quiet-status">{error}</p>}
  </section>;
}
