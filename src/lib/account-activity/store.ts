import { recordsSchema, type AccountRecords } from '../account-records/model';
import { activityDaySchema, activityEffect, activityInputSchema, activityResponseSchema, activityStatus, type ActivityEffect, type ActivityInput } from './model';

type Session = { userId: string; token: string } | null;
export type ActivityState = { phase: 'idle' | 'loading' | 'ready' | 'saving' | 'recover' | 'conflict';
  day: AccountRecords | null; effects: ActivityEffect[]; error: string | null };
const empty = (): ActivityState => ({ phase: 'idle', day: null, effects: [], error: null });
/** Account-only memory; persisted completion and transient animation events are separate. */
export function createAccountActivityStore(request: typeof fetch = fetch) {
  let session: Session = null, state = empty(), epoch = 0, busy = false;
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>(), seen = new Set<string>();
  const publish = (next: ActivityState) => { state = next; listeners.forEach(fn => fn()); };
  const clear = () => { epoch++; controller?.abort(); busy = false; seen.clear(); publish(empty()); };
  async function run(date?: string, input?: ActivityInput) {
    if (!session || busy) return;
    if (input && (state.phase !== 'ready' || !state.day || state.day.date !== state.day.today || activityStatus(state.day, input) !== 'available')) return;
    const owner = session.userId, generation = ++epoch, before = state.day;
    const current = new AbortController(); controller = current; busy = true;
    const signal = AbortSignal.any([current.signal, AbortSignal.timeout(25000)]);
    const active = () => generation === epoch && session?.userId === owner && !current.signal.aborted;
    publish({ ...state, phase: input ? 'saving' : 'loading', effects: input ? state.effects : [], error: null });
    try {
      const response = await request(input ? '/api/account/activity' : `/api/account/records${date ? `?date=${encodeURIComponent(date)}` : ''}`, {
        method: input ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session.token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) },
        ...(input ? { body: JSON.stringify(input) } : {}), cache: 'no-store', credentials: 'omit', signal,
      });
      const raw = await response.json();
      if (!active()) return;
      if (!response.ok) throw new Error('read-before-retry');
      const result = input ? activityResponseSchema.parse(raw) : null;
      const day = result ? result.day : recordsSchema.parse(raw);
      if (day.userId !== owner || (date && day.date !== date)) throw new Error('owner-or-date-mismatch');
      if (day.record?.stage !== 'checkin' && day.record) activityDaySchema.parse(day);
      const effect = result?.effect;
      if (effect && (!result?.changed || !input || effect.action !== input.action || effect.careId !== (input.careId ?? null) ||
          effect.id !== `${owner}:${day.date}:${day.record!.revision}:${input.action}:${input.careId ?? ''}` || activityStatus(day, input) !== 'done')) throw new Error('invalid-effect');
      if (effect && before && input && JSON.stringify(effect) !== JSON.stringify(activityEffect(before, day, input, result!.changed, day.record!.revision))) throw new Error('inconsistent-effect');
      if (input) {
        // A successful POST alone never unlocks progression or an animation.
        const verification = await request(`/api/account/records?date=${encodeURIComponent(day.date)}`, {
          method: 'GET', headers: { Authorization: `Bearer ${session!.token}` },
          cache: 'no-store', credentials: 'omit', signal,
        });
        if (!active()) return;
        if (!verification.ok) throw new Error('verification-failed');
        const fresh = activityDaySchema.parse(await verification.json());
        if (!active()) return;
        if (JSON.stringify(fresh) !== JSON.stringify(day)) throw new Error('snapshot-changed');
      }
      const effects: ActivityEffect[] = input ? [...state.effects] : [];
      if (effect && !seen.has(effect.id)) { seen.add(effect.id); effects.push(effect); }
      publish({ day, effects, phase: day.date !== day.today ? 'conflict' : 'ready', error: day.date !== day.today ? 'day-changed' : null });
    } catch {
      if (!active()) return;
      publish({ ...state, effects: [], phase: 'recover', error: 'read-before-retry' });
      if (input) {
        // One bounded read after an ambiguous write, using a fresh timeout even
        // when the POST timed out. Never resend a mutation or invent an effect.
        try {
          const verification = await request(`/api/account/records?date=${encodeURIComponent(input.date)}`, {
            method: 'GET', headers: { Authorization: `Bearer ${session!.token}` },
            cache: 'no-store', credentials: 'omit',
            signal: AbortSignal.any([current.signal, AbortSignal.timeout(10000)]),
          });
          if (!active() || !verification.ok) return;
          const fresh = activityDaySchema.parse(await verification.json());
          if (!active() || fresh.userId !== owner || fresh.date !== input.date) return;
          // Keep the explicit recovery gate closed; this read alone must not
          // replay completion animation or authorize another click.
          publish({ day: fresh, effects: [], phase: 'recover', error: 'read-before-retry' });
        } catch { /* Preserve recover state and the last known record. */ }
      }
    }
    finally { if (active()) busy = false; }
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    setSession(next: Session) { const changed = session?.userId !== next?.userId; session = next; if (changed) clear(); },
    dispose() { session = null; clear(); },
    load: () => run(),
    recover: () => run(state.day?.date),
    submit(action: ActivityInput['action'], careId?: string) {
      if (!state.day?.record) return Promise.resolve();
      const parsed = activityInputSchema.safeParse({ date: state.day.date, revision: state.day.record.revision, action, ...(careId === undefined ? {} : { careId }) });
      return parsed.success ? run(parsed.data.date, parsed.data) : Promise.resolve();
    },
    // UI consumes once, then drives existing celebrate/completedCare and sunshine notices.
    takeEffect() {
      const effect = state.effects[0] ?? null;
      if (effect) publish({ ...state, effects: state.effects.slice(1) });
      return effect;
    },
  };
}
