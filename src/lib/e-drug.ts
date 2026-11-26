import { medicineImageUrl, type MedicineCatalogItem } from '../app/personal-garden';

const endpoint = 'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList';
function plain(value: unknown, limit: number) {
  return typeof value === 'string' ? value.replace(/<\/?(?:p|br|div|li)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, limit) : '';
}

export type EDrugLabel = MedicineCatalogItem & { precautions: string; interactions: string };

function parseLabels(body: unknown): EDrugLabel[] {
  if (!body || typeof body !== 'object') throw new Error('invalid-catalog');
  const envelope = body as { header?: { resultCode?: string }; body?: { items?: unknown } };
  if (String(envelope.header?.resultCode) !== '00') throw new Error('catalog-unavailable');
  const items = envelope.body?.items;
  if (items === undefined || items === null || items === '') return [];
  if (!Array.isArray(items)) throw new Error('invalid-catalog');
  const found = new Map<string, EDrugLabel>();
  for (const item of items.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const code = String(item.itemSeq ?? '');
    const name = plain(item.itemName, 180);
    if (!/^\d{1,15}$/.test(code) || !name) continue;
    found.set(code, { code, name, manufacturer: plain(item.entpName, 140), effect: plain(item.efcyQesitm, 2600),
      howToUse: plain(item.useMethodQesitm, 10000), image: medicineImageUrl(item.itemImage),
      precautions: [item.atpnWarnQesitm, item.atpnQesitm, item.seQesitm].map(value => plain(value, 16000)).filter(Boolean).join('\n\n'),
      interactions: plain(item.intrcQesitm, 10000) });
  }
  return Array.from(found.values());
}

export function parseEDrug(body: unknown): MedicineCatalogItem[] {
  return parseLabels(body).map(({ code, name, manufacturer, effect, howToUse, image }) => ({ code, name, manufacturer, effect, howToUse, image }));
}

async function fetchEDrug(query: string | { code: string }, key: string, signal: AbortSignal, request: typeof fetch) {
  let serviceKey = key.trim();
  try { serviceKey = decodeURIComponent(serviceKey); } catch { /* The portal also supplies a decoded key. */ }
  const url = new URL(endpoint);
  const params = new URLSearchParams({ serviceKey, pageNo: '1', numOfRows: '8', type: 'json' });
  if (typeof query === 'string') params.set('itemName', query);
  else params.set('itemSeq', query.code);
  url.search = params.toString();
  const response = await request(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]) });
  if (!response.ok) throw new Error('catalog-unavailable');
  return response.json();
}

export async function findEDrugs(query: string | { code: string }, key: string, signal: AbortSignal, request = fetch) {
  return parseEDrug(await fetchEDrug(query, key, signal, request));
}

export async function findEDrugLabels(name: string, key: string, signal: AbortSignal, request = fetch) {
  return parseLabels(await fetchEDrug(name, key, signal, request));
}
