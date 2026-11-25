import { getAuthClient } from '../lib/supabase/auth-client';
import { appStorage } from './app-storage';
import { ADDITIONAL_CARE_IDS, type RecoveryId } from './mission-policy';
import { MAX_MISSION_PHOTO_BASE64, PHOTO_EVIDENCE, photoVerdict, type PhotoEvidence, type PhotoKind } from './mission-photo';
import { loadPhotoFrame } from './photo-frame';

export async function verifyPhotoWithAI(file: File, kind: PhotoKind, signal: AbortSignal) {
  const session = await getAuthClient()?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('로그인한 뒤 AI 사진 확인을 사용할 수 있어요.');

  const frame = await loadPhotoFrame(file, 1280);
  let image: string;
  try {
    image = frame.toDataURL('image/jpeg', 0.78).split(',')[1];
    if (!image || image.length > MAX_MISSION_PHOTO_BASE64) throw new Error('사진을 조금 작게 찍어서 다시 올려 주세요.');
  } finally { frame.width = 0; frame.height = 0; }
  const response = await fetch('/api/mission-photo', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ kind, image, consent: true }), cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  });
  if (response.status === 429) throw new Error('잠시 뒤에 사진을 다시 확인해 주세요.');
  if (!response.ok) throw new Error('지금은 AI 사진 확인에 연결되지 않아요. 다시 시도하거나 직접 기록할 수 있어요.');
  const result = await response.json() as { evidence: PhotoEvidence };
  if (!PHOTO_EVIDENCE.includes(result.evidence)) throw new Error('사진 결과를 읽지 못했어요.');
  return { evidence: result.evidence, verdict: photoVerdict(kind, result.evidence) };
}

const labelKey = (kind: PhotoKind) => 'little-garden.mission-photo-label.v1.' + kind;

export function readPhotoLabel(kind: PhotoKind, day: string) {
  try {
    const saved = JSON.parse(appStorage.getItem(labelKey(kind)) ?? 'null');
    return saved?.date === day && typeof saved.label === 'string' ? saved.label : '';
  } catch { return ''; }
}

export function savePhotoLabel(kind: PhotoKind, day: string, label: string) {
  appStorage.setItem(labelKey(kind), JSON.stringify({ date: day, label: label.trim().slice(0, 40) }));
}

// The server-account garden keeps device photo checks separate from the server care ledger.
const COMPLETION_KEY = 'little-garden.device-photo-completion.v1';
export function readDeviceCareCompletions(day: string): RecoveryId[] {
  try {
    const saved = JSON.parse(appStorage.getItem(COMPLETION_KEY) ?? 'null');
    return saved?.date === day && Array.isArray(saved.ids) ? ADDITIONAL_CARE_IDS.filter(id => saved.ids.includes(id)) : [];
  } catch { return []; }
}

export function saveDeviceCareCompletion(day: string, id: RecoveryId) {
  const ids = [...new Set([...readDeviceCareCompletions(day), id])];
  appStorage.setItem(COMPLETION_KEY, JSON.stringify({ date: day, ids }));
  return ids;
}
