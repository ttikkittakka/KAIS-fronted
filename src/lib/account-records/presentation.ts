import type { AccountRecords } from './model';
import type { AccountGarden } from '../account-garden/model';
import type { DailyCheckin } from '../../app/daily-checkin';
import type { ShopState } from '../../app/shop-store';
import type { GardenLayout } from '../../app/garden-layout';
import { parseCareHistory } from '../../app/daily-cares';

/** Display DTOs only: never pass these projections to a local persistence function. */
export function accountRecordView(data: AccountRecords): DailyCheckin | null {
  const row = data.record;
  if (!row) return null;
  const history = data.cares.length ? parseCareHistory([{ date: data.date,
    ids: [...data.cares].sort((a, b) => a.position - b.position).map(c => c.care_id),
    title: row.recommendation_title, catalogVersion: data.cares[0].catalog_version === 2 ? 2 : undefined,
  }]) : [];
  if (data.cares.length && (!history.length || data.cares.some(c => ![1, 2].includes(c.catalog_version) || c.catalog_version !== data.cares[0].catalog_version))) throw new Error('unsupported-care-catalog');
  return { version: 1, userId: data.userId, date: data.date, answers: [...row.answers],
    stage: row.stage, plantState: row.plant_state, note: row.note, photoComment: row.photo_comment,
    completedCareIds: data.cares.filter(c => c.completed_at).map(c => c.care_id), careRecommendations: history };
}

export function accountShopView(data: AccountGarden) {
  const state: ShopState = { version: 3, owner: data.userId, purchases: [],
    placed: data.placements.map(p => p.item_id),
    layout: Object.fromEntries(data.placements.map(p => [p.slot_id, p.item_id])) as GardenLayout,
    revision: data.garden.layout_revision,
    rewards: data.growthGrants.map(g => ({ id: g.milestone_days === 50 ? 'days-50' : 'days-100',
      grantedAt: g.granted_at, activeDays: g.active_days, seenAt: g.seen_at ?? undefined })),
  };
  return { state, balance: data.garden.sunshine_balance, activeDays: data.garden.active_days, unlimited: false };
}
