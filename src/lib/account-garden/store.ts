import { gardenSchema, type AccountGarden } from './model';

type State = { phase: 'loading' | 'ready' | 'error'; data: AccountGarden | null; message: string };
type GetToken = () => Promise<{ userId: string; token: string } | null>;
export function createAccountGardenStore(userId: string, getToken: GetToken, request: typeof fetch = fetch, initialize = true) {
  let state: State = { phase: 'loading', data: null, message: '' };
  let generation = 0;
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: State) => { state = next; listeners.forEach(listener => listener()); };
  const dispose = () => {
    generation++;
    controller?.abort();
    publish({ phase: 'loading', data: null, message: '' });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose,
    async load() {
      const retained = state.data?.userId === userId ? state.data : null;
      dispose();
      // Keep only this account's last acknowledged presentation during a refresh.
      publish({ phase: 'loading', data: retained, message: '' });
      const run = generation;
      const current = new AbortController();
      controller = current;
      const active = () => run === generation && !current.signal.aborted;
      try {
        const send = async (method: 'GET' | 'POST') => {
          const session = await getToken();
          if (!active() || !session || session.userId !== userId) throw new Error('session-changed');
          return request('/api/account/garden', { method, headers: { Authorization: `Bearer ${session.token}` },
            credentials: 'omit', cache: 'no-store', signal: current.signal });
        };
        let response = await send('GET');
        if (!active()) return;
        if (initialize && response.status === 409 && (await response.json()).error === 'initialization-required') {
          const initialized = await send('POST');
          if (!initialized.ok) throw new Error('initialization-failed');
          response = await send('GET');
        }
        if (!response.ok) throw new Error('query-failed');
        const data = gardenSchema.parse(await response.json());
        if (data.userId !== userId) throw new Error('account-mismatch');
        if (active()) publish({ phase: 'ready', data, message: '' });
      } catch {
        if (active()) publish({ phase: 'error', data: null, message: '정원을 불러오지 못했어요. 다시 시도하거나 다시 로그인해 주세요.' });
      }
    },
  };
}
