// 정부24 공공서비스(혜택) 정보 via 공공데이터포털 (https://www.data.go.kr/data/15113968/openapi.do).
const BASE = 'https://api.odcloud.kr/api/gov24/v3/serviceList';
const KEYWORDS = ['마음', '심리', '정신건강', '상담', '우울', '고립', '은둔', '자살'];
const PAGES = 20, PER_PAGE = 500; // ~10k services; one full scan per day stays far below the 10,000/day dev quota
const DAY_MS = 24 * 60 * 60 * 1000;

export type Benefit = { id: string; name: string; summary: string; target: string; how: string; agency: string; url: string };
export type BenefitSource = () => Promise<Benefit[]>;
type Row = Record<string, unknown>;
const text = (value: unknown, max = 200) => (typeof value === 'string' ? value.trim() : '').slice(0, max);

/** Keeps mental-health and counselling services and only the fields the app shows. */
export function pickBenefits(rows: Row[]): Benefit[] {
  return rows
    .filter(row => KEYWORDS.some(k => `${text(row['서비스명'])} ${text(row['서비스목적요약'], 400)}`.includes(k)))
    .map(row => ({
      id: text(row['서비스ID'], 40), name: text(row['서비스명'], 80), summary: text(row['서비스목적요약']),
      target: text(row['지원대상']), how: text(row['신청방법'], 120), agency: text(row['소관기관명'], 60),
      url: /^https:\/\//.test(text(row['상세조회URL'], 300)) ? text(row['상세조회URL'], 300) : '',
    }))
    .filter(b => b.id && b.name)
    .slice(0, 30);
}

export async function readGov24Page(key: string, page: number, perPage: number, signal?: AbortSignal, fetcher = fetch) {
  let serviceKey = key.trim();
  try { serviceKey = decodeURIComponent(serviceKey); } catch { /* Accept a decoded key as well. */ }
  const url = new URL(BASE);
  url.search = new URLSearchParams({ page: String(page), perPage: String(perPage), returnType: 'JSON', serviceKey }).toString();
  const timeout = AbortSignal.timeout(10_000);
  const options = { cache: 'no-store' as const, redirect: 'error' as const, signal: signal ? AbortSignal.any([signal, timeout]) : timeout };
  const response = await fetcher(url, options);
  if (!response.ok) throw new Error('gov24 ' + response.status);
  const result = await response.json() as { data?: Row[]; totalCount?: number };
  if (!Array.isArray(result?.data)) throw new Error('invalid-gov24-response');
  return { rows: result.data, totalCount: result.totalCount ?? result.data.length };
}

export function gov24Source(key = process.env.GOV24_SERVICE_KEY, fetcher: typeof fetch = fetch, signal?: AbortSignal, limit = 30): BenefitSource | null {
  if (!key) return null;
  let cache: { at: number; items: Benefit[] } | null = null;
  let pending: Promise<Benefit[]> | null = null;
  const scan = async () => {
    const matches = new Map<string, Benefit>();
    let visited = 0;
    for (let page = 1; page <= PAGES; page++) {
      const result = await readGov24Page(key, page, PER_PAGE, signal, fetcher);
      visited += result.rows.length;
      for (const item of pickBenefits(result.rows)) if (!matches.has(item.id)) matches.set(item.id, item);
      if (matches.size >= limit || !result.rows.length || visited >= result.totalCount) break;
    }
    cache = { at: Date.now(), items: Array.from(matches.values()).slice(0, limit) };
    return cache.items;
  };
  return () => {
    if (cache && Date.now() - cache.at < DAY_MS) return Promise.resolve(cache.items);
    pending ??= scan().finally(() => { pending = null; });
    return pending;
  };
}
