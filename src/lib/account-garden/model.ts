import { z } from 'zod';
import { validateGardenLayout } from '../../app/garden-layout';
import { shopItem } from '../../app/shop-catalog';

export const ACCOUNT_PROJECT = 'yhzgucbiwvizjxpzwpqg';
const owner = z.string().uuid();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// Separate wire contract: never deserialize a local ShopState or DailyCheckin here.
export const gardenSchema = z.object({
  project: z.literal(ACCOUNT_PROJECT),
  userId: owner,
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  profile: z.object({ user_id: owner, display_name: z.string(), timezone: z.literal('Asia/Seoul') }),
  garden: z.object({ user_id: owner, main_character: z.literal('sprout'), sunshine_balance: count,
    active_days: count, growth_stage: z.number().int().min(0).max(2), layout_revision: count }),
  inventory: z.array(z.object({ user_id: owner, item_id: z.string(), source: z.enum(['default', 'purchase', 'growth']), acquired_at: z.string() })),
  placements: z.array(z.object({ user_id: owner, slot_id: z.string(), item_id: z.string() })),
  growthGrants: z.array(z.object({ user_id: owner, milestone_days: z.union([z.literal(50), z.literal(100)]), active_days: count, granted_at: z.string(), seen_at: z.string().nullable() })),
  todayRecord: z.object({ user_id: owner, record_date: z.string(), plant_state: z.enum(['low', 'normal']), stage: z.enum(['checkin', 'photo', 'growth', 'care']), revision: count }).nullable(),
}).superRefine((data, ctx) => {
  const rows = [data.profile, data.garden, ...data.inventory, ...data.placements, ...data.growthGrants, ...(data.todayRecord ? [data.todayRecord] : [])];
  if (rows.some(row => row.user_id !== data.userId) || (data.todayRecord && data.todayRecord.record_date !== data.today)) {
    ctx.addIssue({ code: 'custom', message: 'Account scope mismatch' });
  }
  if (new Set(data.inventory.map(row => row.item_id)).size !== data.inventory.length ||
      new Set(data.placements.map(row => row.slot_id)).size !== data.placements.length ||
      new Set(data.placements.map(row => row.item_id)).size !== data.placements.length ||
      data.placements.some(row => !data.inventory.some(item => item.item_id === row.item_id)) ||
      !data.placements.some(row => row.slot_id === 'background')) {
    ctx.addIssue({ code: 'custom', message: 'Invalid inventory or placement' });
  }
  try {
    if (data.inventory.some(row => row.item_id !== 'sprout' && !shopItem(row.item_id))) throw new Error();
    validateGardenLayout(Object.fromEntries(data.placements.map(row => [row.slot_id, row.item_id])),
      Object.fromEntries(data.inventory.map(row => [row.item_id, 1])));
  } catch { ctx.addIssue({ code: 'custom', message: 'Unsupported garden catalog' }); }
});
export type AccountGarden = z.infer<typeof gardenSchema>;
