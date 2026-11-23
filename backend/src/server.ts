import { serve } from '@hono/node-server';
import app from './app';

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) }, ({ port }) => {
  console.log(`backend http://localhost:${port} · AI ${process.env.ANTHROPIC_API_KEY ? 'on' : 'off (고정 문구 사용)'} · 정부24 ${process.env.GOV24_SERVICE_KEY ? 'on' : 'off'}`);
});
