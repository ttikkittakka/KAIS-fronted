import { recordsSchema, type AccountRecords } from '../account-records/model';
import { commitResponseSchema, committedDaySchema } from './commit-model';

type Session = { userId: string; token: string } | null;
export type CommitState = { phase: 'idle' | 'loading' | 'draft' | 'committing' | 'committed' | 'recover' | 'conflict';
  day: AccountRecords | null; error: string | null };
const empty = (): CommitState => ({ phase: 'idle', day: null, error: null });
/** Read-before-retry state machine. A sealed API returns a preparation state, never success. */
export function createAccountCommitStore(request: typeof fetch = fetch) {
  let session: Session = null, state = empty(), epoch = 0, busy = false;
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();
  const attempted = new Set<string>();
  const getSnapshot = () => state;
  const publish = (next: CommitState) => { state = next; listeners.forEach(fn => fn()); };
  const clear = () => { epoch++; controller?.abort(); busy = false; attempted.clear(); publish(empty()); };
  async function run(date: string | undefined, commit: boolean) {
    if (!session || busy) return;
    if (commit && (state.phase !== 'draft' || !state.day?.record || state.day.record.answers.includes('') || state.day.date !== state.day.today)) return;
    if (commit) {
      const key = `${session.userId}:${state.day!.date}:${state.day!.record!.revision}`;
      if (attempted.has(key)) { publish({ ...state, phase: 'recover', error: 'read-before-retry' }); return; }
      attempted.add(key);
    }
    const owner = session.userId, generation = ++epoch, base = state.day;
    const current = new AbortController(); controller = current; busy = true;
    const signal = AbortSignal.any([current.signal, AbortSignal.timeout(25000)]);
    const active = () => generation === epoch && session?.userId === owner && !current.signal.aborted;
    publish({ ...state, phase: commit ? 'committing' : 'loading', error: null });
    try {
      const response = await request(commit ? '/api/account/reflection/commit' : `/api/account/records${date ? `?date=${encodeURIComponent(date)}` : ''}`, {
        method: commit ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session.token}`, ...(commit ? { 'Content-Type': 'application/json' } : {}) },
        ...(commit ? { body: JSON.stringify({ date: base!.date, revision: base!.record!.revision }) } : {}),
        cache: 'no-store', credentials: 'omit', signal,
      });
      const data = await response.json();
      if (!active()) return;
      if (!response.ok) {
        publish({ ...state, phase: 'recover', error: data.error === 'reflection-commit-not-ready' ? 'reflection-commit-not-ready' : response.status === 409 ? 'conflict-read-required' : 'read-before-retry' }); return;
      }
      const day = commit ? commitResponseSchema.parse(data).day : recordsSchema.parse(data);
      if (day.userId !== owner || (date && day.date !== date) || (commit && day.date !== base!.date)) throw new Error('account-or-date-mismatch');
      if (day.record && day.record.stage !== 'checkin') {
        committedDaySchema.parse(day);
        if (commit && (day.record.stage !== 'photo' || day.record.revision !== base!.record!.revision + 1 ||
            day.sunshineBalance !== base!.sunshineBalance + 10 || JSON.stringify(day.record.answers) !== JSON.stringify(base!.record!.answers)))
          throw new Error('commit-result-mismatch');
        publish({ phase: 'committed', day, error: null });
      } else publish({ phase: day.date !== day.today ? 'conflict' : 'draft', day, error: day.date !== day.today ? 'day-changed' : null });
    } catch {
      if (active()) publish({ ...state, phase: 'recover', error: 'read-before-retry' });
    } finally { if (active()) busy = false; }
  }
  return {
    getSnapshot,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    setSession(next: Session) { const changed = session?.userId !== next?.userId; session = next; if (changed) clear(); },
    dispose() { session = null; clear(); },
    // Re-read before every completion attempt; never reuse an uncertain acknowledgement.
    async finish(date?: string) {
      if (!session || busy) return;
      const owner = session.userId, expected = epoch + 1;
      await run(date ?? state.day?.date, false);
      if (epoch !== expected || session?.userId !== owner) return;
      if (state.phase === 'draft') {
        await run(state.day?.date, true);
        if (epoch !== expected + 1 || session?.userId !== owner) return;
        // A POST acknowledgement alone must not unlock the recommendation screen.
        if (getSnapshot().phase === 'committed') {
          const acknowledged = getSnapshot().day;
          await run(acknowledged?.date, false);
          if (session?.userId !== owner) return;
          if (getSnapshot().phase === 'committed' && JSON.stringify(getSnapshot().day) !== JSON.stringify(acknowledged))
            publish({ ...state, phase: 'recover', error: 'snapshot-changed' });
        }
      }
    },
    load: (date?: string) => run(date, false),
    commit: () => run(state.day?.date, true),
    // Original date survives midnight and lost responses. Recovery itself is strictly read-only.
    recover: () => run(state.day?.date, false),
  };
}
