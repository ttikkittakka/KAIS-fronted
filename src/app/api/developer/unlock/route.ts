import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';

// MVP development lock only. No production admin session or data API is exposed.
export async function POST(request: Request) {
  const reply = (status: number, ok = false) => Response.json({ ok }, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  if (process.env.NODE_ENV !== 'development') return reply(404);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply(403);
  const expected = process.env.ADMIN_TEST_PASSWORD;
  if (!expected || !/^[0-9]{4}$/.test(expected)) return reply(503);
  let password: unknown;
  try { ({ password } = await request.json()); } catch { return reply(401); }
  if (typeof password !== 'string' || !/^[0-9]{4}$/.test(password)) return reply(401);
  if (!timingSafeEqual(Buffer.from(password), Buffer.from(expected))) return reply(401);
  return reply(200, true);
}
