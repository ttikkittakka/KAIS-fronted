import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './helpers/load-ts.mjs';

test('garden SQL migrations execute and isolate A/B/anonymous users under PostgreSQL RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync(new URL('./helpers/supabase-db-fixture.sql', import.meta.url), 'utf8'));
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
      try { await db.exec(readFileSync(new URL(file, directory), 'utf8')); }
      catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }); }
    }
    const { ALL_GARDEN_ITEMS } = loadTs(new URL('../src/app/shop-catalog.ts', import.meta.url));
    const { ACTIVE_CARES, LEGACY_CARES } = loadTs(new URL('../src/app/cares.ts', import.meta.url));
    const { GARDEN_SLOTS } = loadTs(new URL('../src/app/garden-layout.ts', import.meta.url));
    const { rows: items } = await db.query("select id,price,default_owned,reward_days from onestep_item_catalog where id <> 'sprout' order by id");
    assert.deepEqual(items, ALL_GARDEN_ITEMS.map(x => ({ id:x.id, price:x.price, default_owned:!!x.defaultOwned, reward_days:x.rewardDays ?? null })).sort((a,b)=>a.id.localeCompare(b.id)));
    const { rows: cares } = await db.query('select id,catalog_version,title from onestep_care_catalog order by catalog_version,id');
    assert.deepEqual(cares, [...LEGACY_CARES.map(x=>({ id:x.id, catalog_version:1, title:x.title })), ...ACTIVE_CARES.map(x=>({ id:x.id, catalog_version:2, title:x.title }))].sort((a,b)=>a.catalog_version-b.catalog_version || a.id.localeCompare(b.id)));
    assert.deepEqual((await db.query('select id,kind from onestep_slot_catalog order by id')).rows, GARDEN_SLOTS.map(x=>({id:x.id,kind:x.kind})).sort((a,b)=>a.id.localeCompare(b.id)));
    try { await db.exec(readFileSync(new URL('../supabase/tests/garden_isolation.sql', import.meta.url), 'utf8')); }
    catch (error) { throw new Error(`Isolation SQL: ${error.message}; context: ${error.where ?? ''}`, { cause: error }); }
    assert.equal((await db.query('select count(*)::integer as count from auth.users')).rows[0].count, 0, 'SQL fixtures must roll back');
  } finally { await db.close(); }
});
