import type { AccountRecords } from '../account-records/model';

type View = 'photo' | 'growth' | 'care';
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const steps: View[] = ['photo', 'growth', 'care'];
const key = (day: AccountRecords) => `onestep-account-view-v1:${day.userId}:${day.date}`;
function browserStorage(): Storage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}
/** A browsing bookmark only. Never changes stage, answers, activity completion or rewards. */
export function accountResumeView(day: AccountRecords, storage = browserStorage()) {
  const stage = day.record?.stage;
  if (!stage || stage === 'checkin' || day.date !== day.today || day.cares.length !== 3) return stage;
  try {
    const saved = JSON.parse(storage?.getItem(key(day)) ?? 'null');
    if (saved?.revision === day.record?.revision && steps.includes(saved.view) &&
        steps.indexOf(saved.view) >= steps.indexOf(stage)) return saved.view as View;
  } catch { /* Missing, corrupt or unavailable storage falls back to the server. */ }
  return stage;
}
export function rememberAccountView(day: AccountRecords, view: View, storage = browserStorage()) {
  const stage = day.record?.stage;
  if (!stage || stage === 'checkin' || day.date !== day.today || day.cares.length !== 3 ||
      steps.indexOf(view) < steps.indexOf(stage)) return;
  try { storage?.setItem(key(day), JSON.stringify({ revision: day.record!.revision, view })); }
  catch { /* Navigation still works without persistence. No server fallback write. */ }
}
