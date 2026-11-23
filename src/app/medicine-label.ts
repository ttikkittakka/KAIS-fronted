import { appStorage } from './app-storage';
import { localDay } from './daily-checkin';

export type MedicineLabel = { name: string; strength: string };
export type MedicineEntry = MedicineLabel & { checked: boolean };

const DAY_KEY = 'little-garden.medicine-labels.v1';
export const MEDICINE_LIMIT = 6;
const amount = String.raw`(\d{1,6}(?:\.\d{1,5})?)\s*(밀리그램|마이크로그램|그램|mcg|[μµ]g|mg|g|iu|%)`;
const strengthPattern = new RegExp('^' + amount + '$', 'iu');
const linePattern = new RegExp('^(.+?[^\\d.,])\\s*' + amount + '$', 'iu');
const units: Record<string, string> = { 밀리그램: 'mg', 마이크로그램: 'mcg', 그램: 'g', 'μg': 'mcg', 'µg': 'mcg' };

export function parseMedicineLabel(name: string, strength: string): MedicineLabel | null {
  const cleaned = name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const match = strength.normalize('NFKC').trim().toLowerCase().match(strengthPattern);
  if (!match || Number(match[1]) <= 0 || cleaned.length > 65 || !/^[\p{L}\p{N}][\p{L}\p{N} .()-]*$/u.test(cleaned) ||
      !/\p{L}/u.test(cleaned) || new RegExp(amount, 'iu').test(cleaned)) return null;
  return { name: cleaned, strength: match[1] + ' ' + (units[match[2]] ?? match[2]) };
}

export const medicineLabelKey = (label: MedicineLabel) => label.name.toLowerCase().replace(/\s+/gu, '') + ':' + label.strength;

export function medicineLabelsFromText(text: string) {
  const entries = new Map<string, MedicineLabel>();
  for (const line of text.normalize('NFKC').split(/\r?\n/).slice(0, 80)) {
    const match = line.trim().replace(/^(?:제품|약품)명\s*[:：]\s*/u, '').match(linePattern);
    if (!match) continue;
    const label = parseMedicineLabel(match[1], match[2] + ' ' + match[3]);
    if (label) entries.set(medicineLabelKey(label), label);
  }
  return Array.from(entries.values());
}

export function compareMedicineLabels(expected: MedicineLabel, observed: MedicineLabel[]) {
  if (observed.length !== 1) return 'unknown';
  return medicineLabelKey(expected) === medicineLabelKey(observed[0]) ? 'match' : 'mismatch';
}

export function readMedicineDay(day: string): MedicineEntry[] {
  try {
    const saved = JSON.parse(appStorage.getItem(DAY_KEY) ?? 'null');
    if (saved?.date !== day || !Array.isArray(saved.entries)) return [];
    return saved.entries.slice(0, MEDICINE_LIMIT).flatMap((row: Partial<MedicineEntry> | null) => {
      const label = typeof row?.name === 'string' && typeof row.strength === 'string' && parseMedicineLabel(row.name, row.strength);
      return label ? [{ ...label, checked: row?.checked === true }] : [];
    });
  } catch { return []; }
}

export function updateMedicineDay(day: string, update: (entries: MedicineEntry[]) => MedicineEntry[]) {
  if (day !== localDay()) throw new Error('날짜가 바뀌었어요. 오늘 미션을 다시 열어 주세요.');
  const entries = update(readMedicineDay(day));
  appStorage.setItem(DAY_KEY, JSON.stringify({ date: day, entries }));
  return entries;
}
