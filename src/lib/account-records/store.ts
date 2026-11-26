import { recordsSchema, type AccountRecords } from './model';
import type { DiaryEdit } from '../../app/diary-edit';

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
    async editCompleted(date: string, revision: number, { answers, note, photoComment }: DiaryEdit) {
      if (!session || state.phase !== 'ready' || state.data?.date !== date || state.data.userId !== session.userId)
        throw new Error('수정할 날짜의 기록을 먼저 다시 불러와 주세요.');
      const owner = session.userId;
      const run = generation;
      const response = await request('/api/account/records', {
        method: 'PATCH', credentials: 'omit', cache: 'no-store',
        headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, revision, answers, note, photoComment }), signal: AbortSignal.timeout(25_000),
      });
      if (response.status === 409) throw new Error('기록이 바뀌었어요. 일기를 다시 열어 최신 내용을 확인해 주세요.');
      if (!response.ok) throw new Error('수정 내용을 저장하지 못했어요. 다시 시도해 주세요.');
      const data = recordsSchema.parse(await response.json());
      if (run !== generation || session?.userId !== owner || data.userId !== owner || data.date !== date || data.record?.stage !== 'care')
        throw new Error('수정한 기록을 확인하지 못했어요. 일기를 다시 열어 주세요.');
      publish({ phase: 'ready', data });
      return data;
    },
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
