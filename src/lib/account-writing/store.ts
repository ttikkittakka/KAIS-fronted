import { recordsSchema, validDate } from '../account-records/model';
import { sameText, writingFromRecords, writingPatchSchema, writingSchema, type Writing, type WritingText } from './model';

type Session = { userId: string; token: string } | null;
type Attempt = { base: Writing; sent: WritingText };
export type WritingState = { phase: 'idle' | 'loading' | 'ready' | 'saving' | 'error' | 'conflict'; date: string | null;
  saved: Writing | null; remote: Writing | null; draft: WritingText; error: string | null };
const empty = (): WritingState => ({ phase: 'idle', date: null, saved: null, remote: null, draft: { note: '', comment: '' }, error: null });
/** No persistence. Bind Auth events and dispose on unmount; no UI is mounted by this module. */
export function createAccountWritingStore(request: typeof fetch = fetch) {
  let session: Session = null, state = empty(), epoch = 0;
  let controller = new AbortController(), task: Promise<void> | null = null, attempt: Attempt | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: WritingState) => { state = next; listeners.forEach(fn => fn()); };
  const dirty = () => !!state.saved && !sameText(state.saved, state.draft);
  const clear = (date: string | null = null) => {
    epoch++; controller.abort(); controller = new AbortController(); task = null; attempt = null;
    publish({ ...empty(), date });
  };
  const context = () => {
    const generation = epoch, owner = session!.userId, date = state.date!, signal = controller.signal;
    const active = () => epoch === generation && session?.userId === owner && state.date === date && !signal.aborted;
    const send = async (body?: object) => {
      if (!active() || !session) throw new Error('context-changed');
      const response = await request(body ? '/api/account/writing' : `/api/account/records?date=${encodeURIComponent(date)}`, {
        method: body ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${session.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? 'revision-conflict' : 'writing-unavailable');
      const value = body ? writingSchema.parse(data) : writingFromRecords(recordsSchema.parse(data));
      if (value.userId !== owner || value.date !== date) throw new Error('owner-or-date-mismatch');
      return value;
    };
    return { active, send };
  };
  // Keep edits entered during an in-flight save, but use newly acknowledged values for untouched fields.
  const accept = (saved: Writing, sent: WritingText) => {
    const draft = { note: state.draft.note === sent.note ? saved.note : state.draft.note,
      comment: state.draft.comment === sent.comment ? saved.comment : state.draft.comment };
    attempt = null;
    publish({ ...state, saved, remote: null, draft, phase: 'ready', error: null });
  };
  function flush(): Promise<void> {
    if (task) return task;
    if (!session || !state.saved || state.phase !== 'ready' || !dirty()) return Promise.resolve();
    const { active, send } = context();
    const work = async () => {
      while (active() && state.phase === 'ready' && dirty()) {
        const base = state.saved!, sent = { ...state.draft };
        attempt = { base, sent };
        publish({ ...state, phase: 'saving', error: null });
        try {
          const saved = await send({ date: base.date, revision: base.revision, ...sent });
          if (!active()) return;
          if (saved.revision <= base.revision || !sameText(saved, sent)) throw new Error('invalid-writing-ack');
          const verified = await send();
          if (!active()) return;
          if (verified.revision !== saved.revision || !sameText(verified, saved)) throw new Error('writing-verification-failed');
          accept(saved, sent);
        } catch (error) {
          if (active()) publish({ ...state, phase: error instanceof Error && error.message === 'revision-conflict' ? 'conflict' : 'error', error: 'read-before-retry' });
          return;
        }
      }
    };
    // Assign before publishing, so synchronous subscribers cannot start a second request.
    task = Promise.resolve().then(work).finally(() => { if (active()) task = null; });
    return task;
  }
  function read(recover: boolean): Promise<void> {
    if (task) return task;
    if (!session || !state.date) return Promise.resolve();
    const { active, send } = context();
    task = Promise.resolve().then(async () => {
      publish({ ...state, phase: 'loading', error: null });
      try {
        const saved = await send();
        if (!active()) return;
        if (!recover || !state.saved) {
          attempt = null;
          publish({ ...state, saved, remote: null, draft: { note: saved.note, comment: saved.comment }, phase: 'ready', error: null });
        } else if (attempt && saved.revision > attempt.base.revision && sameText(saved, attempt.sent)) {
          accept(saved, attempt.sent); // Lost response, identical persisted text: no second write.
        } else if (saved.revision === state.saved.revision && sameText(saved, state.saved)) {
          attempt = null;
          publish({ ...state, saved, remote: null, phase: 'ready', error: null });
        } else {
          publish({ ...state, remote: saved, phase: 'conflict', error: 'choose-server-or-merge' });
        }
      } catch { if (active()) publish({ ...state, phase: 'error', error: 'writing-unavailable' }); }
    }).finally(() => { if (active()) task = null; });
    return task;
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    setSession(next: Session) { const changed = session?.userId !== next?.userId; session = next; if (changed) clear(); },
    dispose() { session = null; clear(); },
    async selectDate(date: string, options: { discardPending?: boolean } = {}) {
      if (!validDate(date) || !session) return false;
      if ((dirty() || task) && !options.discardPending) return false;
      clear(date); await read(false); return true;
    },
    edit(patch: Partial<WritingText>) {
      const parsed = writingPatchSchema.safeParse(patch);
      if (!parsed.success || !state.saved || state.phase === 'loading') return false;
      const draft = { ...state.draft };
      if (parsed.data.note !== undefined) draft.note = parsed.data.note;
      if (parsed.data.comment !== undefined) draft.comment = parsed.data.comment;
      publish({ ...state, draft });
      // Same-tick edits coalesce; edits during a request form the next sequential pair.
      void flush(); return true;
    },
    flush,
    recover: () => read(true),
    async retry() { const generation = epoch; await read(true); if (generation === epoch && state.phase === 'ready') await flush(); },
    // Explicit user choice after seeing remote and draft. {} accepts the server;
    // a partial merge preserves every remote field not explicitly chosen here.
    resolveConflict(patch: Partial<WritingText>) {
      if (task || state.phase !== 'conflict' || !state.remote) return false;
      const parsed = writingPatchSchema.safeParse(patch);
      if (!parsed.success) return false;
      const remote = state.remote;
      const draft = { note: parsed.data.note ?? remote.note, comment: parsed.data.comment ?? remote.comment };
      attempt = null;
      publish({ ...state, saved: remote, remote: null, draft, phase: 'ready', error: null });
      return true; // Caller explicitly flushes a user-approved merge.
    },
  };
}
