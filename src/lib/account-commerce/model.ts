import { z } from 'zod';
import { gardenSchema } from '../account-garden/model';
export const commerceSchema = z.object({
  enabled: z.boolean(), garden: gardenSchema,
  catalog: z.array(z.object({ id: z.string(), price: z.number().int().nonnegative(), default_owned: z.boolean(), reward_days: z.number().nullable() })),
  purchases: z.array(z.object({ item_id: z.string(), cost: z.number().int().positive(), event_key: z.string() })),
  ledger: z.array(z.object({ item_id: z.string(), delta: z.number().int().negative(), event_key: z.string() })),
}).superRefine((v,ctx)=>{
  if(new Set(v.catalog.map(r=>r.id)).size!==v.catalog.length || new Set(v.purchases.map(r=>r.item_id)).size!==v.purchases.length ||
    v.purchases.some(p=>!v.garden.inventory.some(i=>i.item_id===p.item_id&&i.source==='purchase')||p.event_key!==`purchase:${p.item_id}`||!v.ledger.some(l=>l.item_id===p.item_id&&l.delta===-p.cost&&l.event_key===p.event_key)) || v.ledger.length!==v.purchases.length)
    ctx.addIssue({code:'custom',message:'Invalid purchase ledger'});
}).transform(value=>({
  ...value,
  // SQL row order is unspecified; equivalent snapshots must compare equally.
  garden:{...value.garden,
    inventory:[...value.garden.inventory].sort((a,b)=>a.item_id.localeCompare(b.item_id)),
    placements:[...value.garden.placements].sort((a,b)=>a.slot_id.localeCompare(b.slot_id)),
    growthGrants:[...value.garden.growthGrants].sort((a,b)=>a.milestone_days-b.milestone_days),
  },
  catalog:[...value.catalog].sort((a,b)=>a.id.localeCompare(b.id)),
  purchases:[...value.purchases].sort((a,b)=>a.item_id.localeCompare(b.item_id)),
  ledger:[...value.ledger].sort((a,b)=>a.item_id.localeCompare(b.item_id)),
}));
export type CommerceSnapshot=z.infer<typeof commerceSchema>;
export const commerceInput=z.discriminatedUnion('action',[
  z.object({action:z.literal('purchase'),item:z.string().min(1).max(80),price:z.number().int().positive(),balance:z.number().int().nonnegative(),revision:z.number().int().nonnegative()}).strict(),
  z.object({action:z.literal('layout'),layout:z.record(z.string().max(40),z.string().max(80)),balance:z.number().int().nonnegative(),revision:z.number().int().nonnegative()}).strict(),
]);
export type CommerceInput=z.infer<typeof commerceInput>;
export const sameLayout=(a:Record<string,string|undefined>,b:Record<string,string|undefined>)=>JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(b).sort());
