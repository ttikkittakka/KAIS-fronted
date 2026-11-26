import { medicineImageUrl, type MedicineCatalogItem } from '../app/personal-garden';

const endpoint = 'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList';
function plain(value: unknown, limit: number) {
  return typeof value === 'string' ? value.replace(/<\/?(?:p|br|div|li)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, limit) : '';
}

export function parseEDrug(body: unknown): MedicineCatalogItem[] {
  if (!body || typeof body !== 'object') throw new Error('invalid-catalog');
  const envelope = body as { header?: { resultCode?: string }; body?: { items?: unknown } };
  if (String(envelope.header?.resultCode) !== '00') throw new Error('catalog-unavailable');
  const items = envelope.body?.items;
  if (items === undefined || items === null || items === '') return [];
  if (!Array.isArray(items)) throw new Error('invalid-catalog');
  const found = new Map<string, MedicineCatalogItem>();
  for (const item of items.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const code = String(item.itemSeq ?? '');
    const name = plain(item.itemName, 180);
    if (!/^\d{1,15}$/.test(code) || !name) continue;
    found.set(code, { code, name, manufacturer: plain(item.entpName, 140), effect: plain(item.efcyQesitm, 2600),
      howToUse: plain(item.useMethodQesitm, 10000), image: medicineImageUrl(item.itemImage) });
  }
  return Array.from(found.values());
}

export async function findEDrugs(query: string | { code: string }, key: string, signal: AbortSignal, request = fetch) {
  let serviceKey = key.trim();
  try { serviceKey = decodeURIComponent(serviceKey); } catch { /* The portal also supplies a decoded key. */ }
  const url = new URL(endpoint);
  const params = new URLSearchParams({ serviceKey, pageNo: '1', numOfRows: '8', type: 'json' });
  if (typeof query === 'string') params.set('itemName', query);
  else params.set('itemSeq', query.code);
  url.search = params.toString();
  const response = await request(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]) });
  if (!response.ok) throw new Error('catalog-unavailable');
  return parseEDrug(await response.json());
}
