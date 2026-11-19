-- Catalog v2: ten more decorations and two slot kinds (prop on the ground, sky above the friend).
-- Mirrors src/app/shop-catalog.ts and src/app/garden-layout.ts (checked by scripts/garden-database.test.mjs).
begin;
alter table public.onestep_item_catalog drop constraint onestep_item_catalog_slot_kind_check;
alter table public.onestep_item_catalog add constraint onestep_item_catalog_slot_kind_check
  check (slot_kind in ('core', 'character', 'flower', 'path', 'bench', 'prop', 'sky', 'background'));
insert into public.onestep_item_catalog (id,category,slot_kind,price,default_owned,reward_days) values
('pink-tulip', 'decoration', 'flower', 40, false, null),
('sunflower', 'decoration', 'flower', 50, false, null),
('tree-stump', 'decoration', 'bench', 70, false, null),
('watering-can', 'decoration', 'prop', 40, false, null),
('mushroom-lamp', 'decoration', 'prop', 80, false, null),
('garden-lantern', 'decoration', 'prop', 90, false, null),
('birdhouse', 'decoration', 'prop', 110, false, null),
('butterflies', 'decoration', 'sky', 50, false, null),
('rainbow', 'decoration', 'sky', 120, false, null),
('hot-air-balloon', 'decoration', 'sky', 150, false, null);
insert into public.onestep_slot_catalog (id,kind) values
('prop-left', 'prop'),
('prop-right', 'prop'),
('sky-left', 'sky'),
('sky-right', 'sky');
commit;
