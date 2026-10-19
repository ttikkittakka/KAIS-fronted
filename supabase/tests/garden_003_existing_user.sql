-- OPTIONAL rollback-only RPC smoke test AFTER 003, run as postgres in SQL Editor.
-- Replace the UUID with an EXISTING test account from Authentication > Users.
-- No synthetic auth.users insertion and no need for 004. Run the ENTIRE file.
-- If any statement fails, run ROLLBACK before doing anything else.
begin;
select set_config('request.jwt.claim.sub','REPLACE_WITH_EXISTING_TEST_USER_UUID',true);
select set_config('request.jwt.claims',json_build_object(
  'sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
set local role authenticated;
select auth.uid() as expected_test_user;
select public.onestep_ensure_garden();
select public.onestep_ensure_garden();
select user_id,main_character,sunshine_balance,active_days,layout_revision
from public.onestep_gardens;
-- Exactly the chosen user's one garden. Existing balance/progress must be preserved.
select item_id,source from public.onestep_inventory order by item_id;
-- Must include sprout/default-sky; existing purchases/rewards remain.
select slot_id,item_id from public.onestep_placements order by slot_id;
-- Existing background remains; otherwise default-sky is added.
rollback;
-- To persist initialization later, use the signed-in user's RPC normally.
-- SQL Editor as postgres WITHOUT JWT context is not a signed-in RPC call.
