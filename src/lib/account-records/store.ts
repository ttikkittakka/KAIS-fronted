import { recordsSchema, type AccountRecords } from './model';

type Session = { userId: string; token: string } | null;
type State = { phase: 'idle' | 'loading' | 'ready' | 'error'; data: AccountRecords | null };
/** Memory only. Auth owner must call setSession on every auth event and dispose on unmount. */
export function createAccountRecordsStore(request: typeof fetch = fetch) {
  let session: Session = null;
  let state: State = { phase: 'idle', data: null };
  let generation = 0;
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: State) => { state = next; listeners.forEach(fn => fn()); };
  const clear = () => { generation++; controller?.abort(); publish({ phase: 'idle', data: null }); };
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    setSession(next: Session) {
      const changed = next?.userId !== session?.userId;
      session = next;
      if (changed) clear(); // Same-account token refresh preserves loaded state and current request.
    },
    dispose() { session = null; clear(); },
    async load(date?: string) {
      const retained = state.data?.userId === session?.userId && state.data?.date === (date ?? state.data?.today) ? state.data : null;
      clear();
      if (!session) return;
      const owner = session.userId;
      const run = generation;
      const current = new AbortController(); controller = current;
      const active = () => run === generation && session?.userId === owner && !current.signal.aborted;
      publish({ phase: 'loading', data: retained });
      try {
        const response = await request(`/api/account/records${date === undefined ? '' : `?date=${encodeURIComponent(date)}`}`, {
          method: 'GET', headers: { Authorization: `Bearer ${session.token}` }, credentials: 'omit', cache: 'no-store', signal: current.signal,
        });
        if (!response.ok) throw new Error('query-failed');
        const data = recordsSchema.parse(await response.json());
        if (data.userId !== owner || (date !== undefined && data.date !== date)) throw new Error('response-mismatch');
        if (active()) publish({ phase: 'ready', data });
      } catch {
        if (active()) publish({ phase: 'error', data: null });
      }
    },
  };
}
