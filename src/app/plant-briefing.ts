import type { LiveBenefit } from './support';

export const POLICY_BRIEFING_LIMIT = 3;
export const MEDICINE_BRIEFING_LIMIT = 24;
export const MEDICINE_CATALOG_URL = 'https://www.data.go.kr/data/15075057/openapi.do';
export type MedicineForReview = { name: string; code?: string; ingredients?: string[] };

// These examples share one verified ingredient. They are never used as a dose schedule.
export const COLD_MEDICINE_EXAMPLE: readonly MedicineForReview[] = [
  { name: '판피린큐액', code: '200700547', ingredients: ['아세트아미노펜'] },
  { name: '타이레놀정500밀리그람(아세트아미노펜)', code: '202106092', ingredients: ['아세트아미노펜'] },
];

export function medicineDetailUrl(code: string) {
  return 'https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=' + encodeURIComponent(code);
}

export type MedicineFinding = { duplicateProduct: boolean; sharedIngredients: string[]; hasIngredients: boolean };
export type MedicineReviewRow = MedicineFinding & {
  index: number;
  name: string;
  catalog: 'found' | 'not-found' | 'unavailable';
  catalogCode?: string;
  manufacturer?: string;
};
export type PlantBriefingRequest = { kind: 'policies' | 'example' } | {
  kind: 'medicines'; items: MedicineForReview[]; consent: true;
};
export type PolicyBriefing = { kind: 'policies'; summarized: boolean; items: LiveBenefit[] };
export type MedicineBriefing = { kind: 'medicines'; summarized: boolean; example: boolean; items: MedicineReviewRow[] };

export const medicineNameKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

function ingredientKey(name: string) {
  const key = medicineNameKey(name).replace(/\(?\d+(?:[.,]\d+)?(?:mg|mcg|μg|g|밀리그램|밀리그람)\)?$/, '');
  return ['acetaminophen', 'paracetamol', 'apap', '아세트아미노펜'].includes(key) ? '아세트아미노펜' : key;
}

export function reviewMedicineOverlap(items: readonly MedicineForReview[]): MedicineFinding[] {
  const ingredients = items.map(item => new Map((item.ingredients ?? []).map(name => [ingredientKey(name), name])));
  return items.map((item, index) => {
    const duplicateProduct = items.some((other, otherIndex) => otherIndex !== index &&
      (item.code && other.code ? item.code === other.code : medicineNameKey(item.name) === medicineNameKey(other.name)));
    const sharedIngredients = Array.from(ingredients[index]).filter(([key]) => key &&
      ingredients.some((other, otherIndex) => otherIndex !== index && other.has(key)))
      .map(([key, value]) => key === '아세트아미노펜' ? key : value);
    return { duplicateProduct, sharedIngredients, hasIngredients: Array.from(ingredients[index].keys()).some(Boolean) };
  });
}
