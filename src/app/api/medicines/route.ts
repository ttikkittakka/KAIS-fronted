import { z } from 'zod';
import { findEDrugs } from '../../../lib/e-drug';
import { privateJson, requestUser, smallJson } from '../../../lib/request';

const search = z.object({ name: z.string().trim().min(2).max(60) }).strict();

export async function POST(request: Request) {
  if (!await requestUser(request)) return privateJson({ error: 'sign-in-required' }, 401);
  const parsed = search.safeParse(await smallJson(request, 1024));
  if (!parsed.success) return privateJson({ error: 'invalid-search' }, 400);
  const key = process.env.MFDS_EDRUG_SERVICE_KEY?.trim();
  if (!key) return privateJson({ error: 'catalog-not-configured' }, 503);
  try { return privateJson({ items: await findEDrugs(parsed.data.name, key, request.signal) }); }
  catch { return privateJson({ error: 'catalog-unavailable' }, 502); }
}
