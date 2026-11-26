import { gov24Source } from '../../../../backend/src/benefits';
import { parseProviderKey, PROVIDER_KEY_HEADER } from '../../../lib/provider-keys';
import { privateJson } from '../../../lib/request';

export async function GET(request: Request) {
  const key = parseProviderKey(request.headers.get(PROVIDER_KEY_HEADER));
  if (!key) return privateJson({ error: 'key-required' }, 400);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]);
  try {
    const items = await gov24Source(key, fetch, signal)!();
    return privateJson({ source: 'gov24', items });
  } catch { return privateJson({ error: 'benefits-unavailable' }, 502); }
}
