import 'server-only';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAccountSnapshot } from '../account-records/snapshot';

const stopFile = () => join(process.cwd(), '.env.phase3b-ab', 'commit-test.stop');
let stopped = false;
let busy = false;
export function assertCommitTestHealthy() {
  if (stopped || existsSync(stopFile())) throw new Error('commit-test-stopped');
}
export function stopCommitTest() {
  stopped = true;
  try { writeFileSync(stopFile(), 'stopped\n', { flag: 'wx', mode: 0o600 }); } catch { /* in-process latch remains closed */ }
}
/** Conservative local signal, not a substitute for Supabase CPU/connection monitoring. */
export const readCommitSnapshot: typeof readAccountSnapshot = async (...args) => {
  assertCommitTestHealthy();
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([readAccountSnapshot(...args), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { stopCommitTest(); reject(new Error('commit-test-slow-read')); }, 2000);
    })]);
    if (performance.now() - started > 2000) { stopCommitTest(); throw new Error('commit-test-slow-read'); }
    assertCommitTestHealthy();
    return result;
  } catch { stopCommitTest(); throw new Error('commit-test-read-stopped'); }
  finally { clearTimeout(timer); }
};
export function serializeCommitTest(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    if (busy) return Response.json({ error: 'commit-test-busy' }, { status: 429 });
    try { assertCommitTestHealthy(); } catch { return Response.json({ error: 'commit-test-stopped' }, { status: 503 }); }
    busy = true;
    try { return await handler(request); } finally { busy = false; }
  };
}
