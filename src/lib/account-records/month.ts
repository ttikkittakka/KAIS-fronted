import { z } from 'zod';
import { validDate, allowedDate } from './model';
export const monthSchema = z.object({ userId: z.uuid(), today: z.string().refine(validDate), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), dates: z.array(z.string().refine(validDate)).max(31) }).strict().refine(v => new Set(v.dates).size === v.dates.length && v.dates.every(d => d.startsWith(v.month + '-') && allowedDate(d, v.today)));
export function createAccountMonthStore(request: typeof fetch = fetch) {
  let session: { userId: string; token: string } | null = null, generation = 0;
  let state: { phase: 'idle' | 'loading' | 'ready' | 'error'; data: z.infer<typeof monthSchema> | null } = { phase: 'idle', data: null };
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => { state = next; listeners.forEach(fn => fn()); };
  const clear = () => { generation++; controller?.abort(); publish({ phase: 'idle', data: null }); };
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    setSession(next: typeof session) { if (session?.userId !== next?.userId) clear(); session = next; },
    dispose() { session = null; clear(); },
    async load(month: string) {
      if (!session || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
      clear(); const epoch = generation, owner = session.userId;
      const current = new AbortController(); controller = current;
      const active = () => epoch === generation && session?.userId === owner;
      publish({ phase: 'loading', data: null });
      try {
        const response = await request(`/api/account/records?month=${month}`, { headers: { Authorization: `Bearer ${session.token}` }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([current.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw Error();
        const data = monthSchema.parse(await response.json());
        if (data.userId !== owner || data.month !== month) throw Error();
        if (active()) publish({ phase: 'ready', data });
      } catch { if (active()) publish({ phase: 'error', data: null }); }
    },
  };
}
