import { serve } from '@hono/node-server';
import { createApp } from './app';
import { gov24Source } from './benefits';
import { claudeLlm } from './explain';

const llm = claudeLlm();
const benefits = gov24Source();
serve({ fetch: createApp(llm, benefits).fetch, port: Number(process.env.PORT ?? 8787) }, ({ port }) => {
  console.log(`backend http://localhost:${port} · AI ${llm ? 'on' : 'off (ANTHROPIC_API_KEY 없음, 고정 문구만 사용)'} · 정부24 ${benefits ? 'on' : 'off (GOV24_SERVICE_KEY 없음)'}`);
});
