import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
const failures: number[] = []; // shortcut: per server process; use a shared store if the developer build runs on several instances

// Developer-version lock: it only opens a local test sandbox, so no admin session or data API is exposed.
// Available under `next dev`, or in a build made with NEXT_PUBLIC_DEVELOPER_TOOLS=on (the developer version).
export async function POST(request: Request) {
  const reply = (status: number, ok = false) => Response.json({ ok }, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  if (process.env.NODE_ENV !== 'development' && process.env.NEXT_PUBLIC_DEVELOPER_TOOLS !== 'on') return reply(404);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply(403);
  const expected = process.env.ADMIN_TEST_PASSWORD;
  if (!expected || !/^[0-9]{4}$/.test(expected)) return reply(503);
  const now = Date.now();
  while (failures.length && now - failures[0] > 10 * 60_000) failures.shift();
  if (failures.length >= 20) return reply(429);
  let password: unknown;
  try { ({ password } = await request.json()); } catch { return reply(401); }
  if (typeof password !== 'string' || !/^[0-9]{4}$/.test(password)) return reply(401);
  if (!timingSafeEqual(Buffer.from(password), Buffer.from(expected))) { failures.push(now); return reply(401); }
  return reply(200, true);
}
