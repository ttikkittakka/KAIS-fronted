const routes = new Set(['/v1/health', '/v1/explain', '/v1/benefits']);

export const runtime = 'nodejs';

async function forward(request: Request) {
  const incoming = new URL(request.url);
  const path = incoming.pathname.slice('/api'.length);
  if (!routes.has(path)) return new Response('404 Not Found', { status: 404 });

  // Vercel injects the binding at request time. BACKEND_URL is for standalone local runs.
  const standalone = !(process.env.VERCEL || process.env.VERCEL_ENV);
  const base = process.env.GARDEN_BACKEND_URL || (standalone ? process.env.BACKEND_URL || 'http://localhost:8787' : undefined);
  if (!base) return Response.json({ error: 'backend-unavailable' }, { status: 503 });

  try {
    const target = new URL(base);
    target.pathname = target.pathname.replace(/\/$/, '') + path;
    target.search = incoming.search;
    const headers = new Headers();
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    const options = {
      method: request.method,
      headers,
      body: request.body,
      duplex: 'half' as const,
      cache: 'no-store' as const,
      redirect: 'error' as const,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    };
    const response = await fetch(target, options);
    const responseHeaders = new Headers({ 'cache-control': 'no-store' });
    const responseType = response.headers.get('content-type');
    if (responseType) responseHeaders.set('content-type', responseType);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: 'backend-unavailable' }, { status: 502 });
  }
}

export { forward as GET, forward as POST };
