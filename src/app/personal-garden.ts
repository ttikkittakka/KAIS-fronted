import { z } from 'zod';

export const PERIODS = ['morning', 'midday', 'evening'] as const;
export type Period = typeof PERIODS[number];
export const PERIOD_LABELS: Record<Period, string> = { morning: '아침', midday: '점심', evening: '저녁' };
export const PLANT_IDS = ['bonsai', 'pine', 'oak', 'metasequoia'] as const;
export type PlantId = typeof PLANT_IDS[number];

export const displayNameSchema = z.string().trim().min(1).max(24).regex(/^[^\p{Cc}]+$/u);
export const profileSchema = z.object({
  displayName: displayNameSchema,
  temperament: z.enum(['calm', 'curious', 'balanced']),
  support: z.enum(['quiet', 'encouraging', 'either']),
  pace: z.enum(['inside', 'outside', 'any']),
}).strict();
export type GardenProfile = z.infer<typeof profileSchema>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const alarm = z.object({ time, enabled: z.boolean() }).strict();
export const remindersSchema = z.object({ morning: alarm, midday: alarm, evening: alarm }).strict();
export type Reminders = z.infer<typeof remindersSchema>;
export const DEFAULT_REMINDERS: Reminders = {
  morning: { time: '08:00', enabled: false },
  midday: { time: '12:00', enabled: false },
  evening: { time: '19:00', enabled: false },
};

export function medicineImageUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 1200) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'nedrug.mfds.go.kr' && !url.username && !url.password && !url.port ? url.href : '';
  } catch { return ''; }
}

const catalogSchema = z.object({
  code: z.string().regex(/^\d{1,15}$/),
  name: z.string().trim().min(1).max(180),
  manufacturer: z.string().max(140),
  effect: z.string().max(2600),
  howToUse: z.string().max(10000),
  image: z.string().max(1200).refine(value => !value || !!medicineImageUrl(value)),
}).strict();
export type MedicineCatalogItem = z.infer<typeof catalogSchema>;
export const medicineSchema = z.object({
  name: z.string().trim().min(1).max(180),
  strength: z.string().trim().max(50),
  directions: z.string().trim().max(400),
  periods: z.array(z.enum(PERIODS)).min(1).max(3).refine(values => new Set(values).size === values.length),
  catalog: catalogSchema.nullable(),
  ingredients: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
}).strict();
export type MedicineInput = z.infer<typeof medicineSchema>;
export type Medicine = MedicineInput & { id: string };

export const emptyMedicine = (): MedicineInput => ({ name: '', strength: '', directions: '', periods: [], catalog: null });
