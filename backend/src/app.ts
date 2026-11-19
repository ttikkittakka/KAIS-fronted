import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ExplainInput, PROMPT_VERSION, explain, type Llm } from './explain';
import type { BenefitSource } from './benefits';

const BENEFITS_WAIT_MS = 8000; // the first daily scan can take longer; the app shows its curated list meanwhile

// shortcut: /v1/explain has no rate limit or login check; add a per-IP limit or Supabase JWT check before a public deploy.
export function createApp(llm: Llm | null, benefits: BenefitSource | null = null) {
  const app = new Hono();
  app.use(async (c, next) => { await next(); c.res.headers.set('Cache-Control', 'no-store'); });
  app.get('/v1/health', c => c.json({ ok: true, llm: llm !== null, benefits: benefits !== null, promptVersion: PROMPT_VERSION }));
  app.post('/v1/explain', bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'too-large' }, 413) }), async c => {
    const input = ExplainInput.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'invalid-input' }, 400);
    return c.json(await explain(input.data, llm));
  });
  app.get('/v1/benefits', async c => {
    if (!benefits) return c.json({ source: 'none', items: [] });
    // The scan's own failure is caught here so a late rejection never goes unhandled.
    const work = benefits().then(items => ({ items }), () => undefined);
    const result = await Promise.race([work, new Promise<null>(resolve => setTimeout(() => resolve(null), BENEFITS_WAIT_MS))]);
    if (result === undefined) { console.warn('benefits: gov24 request failed'); return c.json({ source: 'error', items: [] }); }
    return c.json(result === null ? { source: 'warming', items: [] } : { source: 'gov24', items: result.items });
  });
  app.onError((error, c) => { console.error('unhandled', error.name); return c.json({ error: 'server-error' }, 500); });
  return app;
}
