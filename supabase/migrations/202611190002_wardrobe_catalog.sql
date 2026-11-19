-- Wardrobe (옷 입히기): nine outfits sold in the shop. They are worn by the friend, never placed in a garden slot,
-- so their slot kinds (head/face/neck) match no row in onestep_slot_catalog.
-- Mirrors src/app/shop-catalog.ts (checked by scripts/garden-database.test.mjs).
begin;
alter table public.onestep_item_catalog drop constraint onestep_item_catalog_category_check;
alter table public.onestep_item_catalog add constraint onestep_item_catalog_category_check
  check (category in ('character', 'decoration', 'background', 'outfit'));
alter table public.onestep_item_catalog drop constraint onestep_item_catalog_slot_kind_check;
alter table public.onestep_item_catalog add constraint onestep_item_catalog_slot_kind_check
  check (slot_kind in ('core', 'character', 'flower', 'path', 'bench', 'prop', 'sky', 'background', 'head', 'face', 'neck'));
insert into public.onestep_item_catalog (id,category,slot_kind,price,default_owned,reward_days) values
('straw-hat', 'outfit', 'head', 80, false, null),
('flower-crown', 'outfit', 'head', 90, false, null),
('knit-beanie', 'outfit', 'head', 70, false, null),
('party-hat', 'outfit', 'head', 60, false, null),
('round-glasses', 'outfit', 'face', 70, false, null),
('heart-sunglasses', 'outfit', 'face', 90, false, null),
('mint-scarf', 'outfit', 'neck', 80, false, null),
('red-bowtie', 'outfit', 'neck', 50, false, null),
('bell-collar', 'outfit', 'neck', 60, false, null);
commit;
