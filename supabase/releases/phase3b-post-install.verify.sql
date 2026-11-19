-- READ-ONLY POST-INSTALL CHECKS. No RPC invocation; SELECT from catalogs only.
-- Target yhzgucbiwvizjxpzwpqg. Expected: 6 functions, owner postgres, empty function search_path.
SELECT current_database(),current_user,now() AS observed_at;
WITH expected(signature) AS (VALUES ('public.onestep_get_day(date)'),
('public.onestep_save_reflection_draft(date,text[],bigint)'),
('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'),
('public.onestep_commit_activity_v2(date,text,text,bigint)'),
('public.onestep_commit_reflection(uuid,text[],text[],text)'),
('public.onestep_commit_activity(uuid,text,text)'))
SELECT e.signature,p.oid IS NOT NULL AS exists,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) ORDER BY e.signature;
-- Expected 24 rows, every matches_expected=true. Only executor+v2 may execute.
WITH expected(signature) AS (VALUES ('public.onestep_get_day(date)'),
('public.onestep_save_reflection_draft(date,text[],bigint)'),
('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'),
('public.onestep_commit_activity_v2(date,text,text,bigint)'),
('public.onestep_commit_reflection(uuid,text[],text[],text)'),
('public.onestep_commit_activity(uuid,text,text)')), roles(name) AS (VALUES ('anon'),('authenticated'),('service_role'),('onestep_commit_executor')),
checks AS (SELECT e.signature,r.name,p.oid,pr.oid AS role_oid,
(r.name='onestep_commit_executor' AND e.signature LIKE '%_v2(%') AS expected_execute
FROM expected e CROSS JOIN roles r LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) LEFT JOIN pg_roles pr ON pr.rolname=r.name)
SELECT signature,name,expected_execute,
CASE WHEN oid IS NOT NULL AND role_oid IS NOT NULL THEN has_function_privilege(role_oid,oid,'EXECUTE') END AS effective_execute,
CASE WHEN oid IS NULL OR role_oid IS NULL THEN false ELSE has_function_privilege(role_oid,oid,'EXECUTE')=expected_execute END AS matches_expected
FROM checks ORDER BY signature,name;
-- Expected zero rows: unexpected direct/PUBLIC grants including grant options.
SELECT p.oid::regprocedure AS function,a.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE n.nspname='public' AND p.proname IN ('onestep_get_day','onestep_save_reflection_draft','onestep_commit_reflection_v2','onestep_commit_activity_v2','onestep_commit_reflection','onestep_commit_activity')
AND a.grantee<>p.proowner AND NOT (p.proname IN ('onestep_commit_reflection_v2','onestep_commit_activity_v2') AND a.grantee=to_regrole('onestep_commit_executor') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable);
-- Expected executor only: login/super/createdb/createrole/replication/bypass/inherit all false.
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname LIKE 'onestep_%';
-- Expected false for every path. Owner implicit access and managed superusers are excluded.
SELECT rolname,pg_has_role(oid,'postgres','SET') AS can_set_owner,
CASE WHEN to_regrole('onestep_commit_executor') IS NOT NULL THEN pg_has_role(oid,'onestep_commit_executor','SET') END AS can_set_executor
FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
-- Existing 17 functions: compare body/owner with captured baseline; all matches_expected=true.
WITH expected(signature,body_hash) AS (VALUES ('public.onestep_reserve_photo(date)','5188777f5bdb5e02fed9fd232da19de8'),
('public.onestep_attach_photo(date,uuid,bigint)','db3a8c1dad1c7ed513efa6a173452d3f'),
('public.onestep_retire_photo(uuid)','e1d55f6fac82e8bff7f4fd801f639aca'),
('public.onestep_start_day()','bbce1d57a4d05a7a14d7be12a9bb5fcf'),
('onestep_private.require_user()','649ed5c684d399f703a33a52839ea908'),
('onestep_private.ensure_garden(uuid)','d5cecc2ff376edb21e9f9fb0662a64d5'),
('onestep_private.new_user()','f0098607e2057325e352970b1ea1e5ec'),
('onestep_private.today(uuid)','387faafae79fea3f2647c97ea71e8970'),
('onestep_private.award(uuid,date,text)','09e69ae9251d4ab1c4c3a803d1b651b4'),
('onestep_private.sync_growth(uuid)','00bf9d8d6664c4788e47ff519a413d07'),
('public.onestep_ensure_garden()','74062830fe68cc81a8679885839966ad'),
('public.onestep_save_writing(date,text,text,bigint)','63cbe49b150fffbf27835336a6e300fa'),
('public.onestep_buy_item(text)','037f14110567a379a390446e508ecf06'),
('public.onestep_save_layout(jsonb,bigint)','87bd81600d1431475e16b74c0340ff26'),
('public.onestep_commit_reflection(uuid,text[],text[],text)','cae9773de93265fa9744291eaee7217e'),
('public.onestep_commit_activity(uuid,text,text)','d68f6ae984445ae6fa0e02a4f1724f9d'),
('onestep_private.photo_access(text,text)','a0762a2e1b23c6e5df53d0db3162b7cd'))
SELECT e.signature,p.oid IS NOT NULL AND pg_get_userbyid(p.proowner)='postgres' AND md5(replace(pg_get_functiondef(p.oid),chr(13),''))=e.body_hash AS matches_expected
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
