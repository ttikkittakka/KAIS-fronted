import { z } from 'zod';
import { readGov24Page } from '../../../../backend/src/benefits';
import { findEDrugs } from '../../../lib/e-drug';
import { testOpenAIConnection } from '../../../lib/openai/connection';
import { API_PROVIDERS, parseProviderKey } from '../../../lib/provider-keys';
import { privateJson, smallJson } from '../../../lib/request';

const input = z.object({ provider: z.enum(API_PROVIDERS), key: z.string() }).strict();

export async function POST(request: Request) {
  const parsed = input.safeParse(await smallJson(request, 2048));
  if (!parsed.success) return privateJson({ error: 'invalid-connection' }, 400);
  const key = parseProviderKey(parsed.data.key);
  if (!key) return privateJson({ error: 'invalid-key' }, 400);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
  try {
    switch (parsed.data.provider) {
      case 'openai': {
        const result = await testOpenAIConnection({ execute: true, signal }, { env: { OPENAI_API_KEY: key } });
        if (result.errorCode === 'OPENAI_RATE_LIMITED') return privateJson({ error: 'rate-limited' }, 429);
        if (result.status !== 'success') return privateJson({ error: 'connection-failed' }, 502);
        break;
      }
      case 'edrug':
        await findEDrugs('타이레놀', key, signal);
        break;
      case 'gov24':
        await readGov24Page(key, 1, 1, signal);
        break;
    }
    return privateJson({ connected: true });
  } catch { return privateJson({ error: 'connection-failed' }, 502); }
}
