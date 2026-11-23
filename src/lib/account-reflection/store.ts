import { recordsSchema } from '../account-records/model';
import { answersSchema, draftResponseSchema, nextQuestion, startResponseSchema, type DraftAnswers } from './model';

type Session = { userId: string; token: string } | null;
type Phase = 'idle' | 'loading' | 'needs-start' | 'ready' | 'saving' | 'draft-complete' | 'committed' | 'error' | 'conflict';
export type ReflectionState = {
  phase: Phase; date: string | null; revision: number | null; answers: DraftAnswers;
  question: number; pending: boolean; error: string | null;
  completionSource?: 'saved' | 'restored';
};
const empty = (): ReflectionState => ({ phase: 'idle', date: null, revision: null, answers: ['', '', '', ''], question: 0, pending: false, error: null });
class RequestFailure extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    Object.setPrototypeOf(this, RequestFailure.prototype);
  }
}
/** No persistence. Auth integration must forward every event to setSession and dispose on unmount. */
export function createAccountReflectionStore(request: typeof fetch = fetch) {
  let session: Session = null;
  let state = empty();
  let generation = 0;
  let controller: AbortController | undefined;
  let busy = false;
  const listeners = new Set<() => void>();
  const publish = (next: ReflectionState) => { state = next; listeners.forEach(fn => fn()); };
  const clear = () => { generation++; controller?.abort(); busy = false; publish(empty()); };
  async function run(work: (send: (path: string, body?: object) => Promise<unknown>, active: () => boolean) => Promise<void>) {
    if (busy || !session) return;
    busy = true;
    const owner = session.userId, epoch = ++generation;
    controller?.abort();
    const current = new AbortController(); controller = current;
    const active = () => generation === epoch && session?.userId === owner && !current.signal.aborted;
    const send = async (path: string, body?: object) => {
      if (!active() || !session) throw new Error('session-changed');
      const response = await request(path, { method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${session.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), credentials: 'omit', cache: 'no-store', signal: current.signal });
      const data = await response.json();
      if (!response.ok) throw new RequestFailure(response.status, typeof data.error === 'string' ? data.error : 'request-failed');
      if (data.userId !== owner) throw new Error('account-mismatch');
      return data;
    };
    try { await work(send, active); }
    catch (error) {
      if (active()) publish({ ...state, phase: error instanceof RequestFailure && error.status === 409 ? 'conflict' : 'error',
        error: error instanceof RequestFailure ? error.code : 'request-failed' });
    } finally { if (active()) busy = false; }
  }
  async function load(discardPending = false, start = false) {
    if (busy || !session || (state.pending && !discardPending)) return;
    if (start && state.phase !== 'needs-start') return;
    await run(async (send, active) => {
      // Keep pending input until a replacement snapshot is actually verified.
      publish({ ...state, phase: 'loading', error: null });
      let startedDate: string | undefined;
      if (start) {
        const result = startResponseSchema.parse(await send('/api/account/day/start', {}));
        startedDate = result.date;
        if (!active()) return;
      }
      // On refresh/relogin, recover from the existing read-only API; never auto-create a day.
      const result = recordsSchema.parse(await send(`/api/account/records${startedDate ? `?date=${startedDate}` : ''}`));
      if (!active()) return;
      if (startedDate && result.date !== startedDate) throw new Error('date-mismatch');
      if (result.date !== result.today) throw new RequestFailure(409, 'day-changed');
      if (!result.record) {
        if (start) throw new Error('start-not-visible');
        publish({ ...empty(), date: result.date, phase: 'needs-start' }); return;
      }
      const answers = answersSchema.parse(result.record.answers);
      const question = nextQuestion(answers);
      publish({ phase: result.record.stage !== 'checkin' ? 'committed' : question === 4 ? 'draft-complete' : 'ready',
        date: result.date, revision: result.record.revision, answers, question, pending: false, error: null, completionSource: 'restored' });
    });
  }
  async function save(answers: DraftAnswers, question: number) {
    if (busy || !session || state.date === null || state.revision === null || ['conflict', 'committed', 'loading'].includes(state.phase)) return;
    const date = state.date, revision = state.revision;
    await run(async (send, active) => {
      publish({ ...state, answers: [...answers], question, pending: true, phase: 'saving', error: null });
      const result = draftResponseSchema.parse(await send('/api/account/reflection/draft', { date, answers, revision }));
      if (!active()) return;
      if (result.date !== date || result.revision < revision || (result.changed && result.revision !== revision + 1)) throw new Error('invalid-acknowledgement');
      const next = nextQuestion(answers);
      publish({ ...state, revision: result.revision, question: next, pending: false,
        phase: next === 4 ? 'draft-complete' : 'ready', error: null, completionSource: 'saved' });
    });
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    setSession(next: Session) { const changed = session?.userId !== next?.userId; session = next; if (changed) clear(); },
    dispose() { session = null; clear(); },
    load: (options: { discardPending?: boolean } = {}) => load(options.discardPending ?? false),
    start: () => load(false, true),
    async saveAnswer(question: number, value: string) {
      if (question !== state.question || question < 0 || question > 3 || value === '') return;
      const answers: string[] = [...state.answers]; answers[question] = value;
      const parsed = answersSchema.safeParse(answers);
      if (parsed.success) await save(parsed.data, question);
    },
    retry: () => state.pending && state.phase === 'error' ? save([...state.answers], state.question) : Promise.resolve(),
  };
}
