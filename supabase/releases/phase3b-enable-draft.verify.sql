-- SELECT ONLY; run after approved activation. All matches_expected values must be true.
-- Expected results: 5 function rows, 13 RLS rows, 20 effective-access rows.
-- No RPC invocation or Auth session creation.
WITH expected(signature,hash,definer,acl) AS (VALUES
('public.onestep_start_day()','bbce1d57a4d05a7a14d7be12a9bb5fcf',true,'{postgres=X/postgres,authenticated=X/postgres}'),
('public.onestep_get_day(date)','d6aa32ecf1b037f78c5e5d2ebb072eb8',false,'{postgres=X/postgres,authenticated=X/postgres}'),
('public.onestep_save_reflection_draft(date,text[],bigint)','d30adc647a0fab5399dd5f9c1787a00d',true,'{postgres=X/postgres,authenticated=X/postgres}'),
('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)','5e23ffc6f7fb82e5d2edaf94830a551d',true,'{postgres=X/postgres,onestep_commit_executor=X/postgres}'),
('public.onestep_commit_activity_v2(date,text,text,bigint)','b8e7c4336d883dd41d7c22b1fe110f1d',true,'{postgres=X/postgres,onestep_commit_executor=X/postgres}'))
SELECT e.signature, COALESCE(pg_get_userbyid(p.proowner)='postgres'
 AND md5(replace(pg_get_functiondef(p.oid),chr(13),''))=e.hash AND p.prosecdef=e.definer
 AND p.proconfig=ARRAY['search_path=""']::text[]
 AND p.proacl IS NOT NULL
 AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY(SELECT x::text FROM unnest(e.acl::aclitem[]) x ORDER BY x::text),false) AS matches_expected
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
WITH expected(name,hash) AS (VALUES ('onestep_care_catalog','acfe6da3932a4f79e7ff1a81dc47d2fa'),
('onestep_daily_cares','dbd51914342db8c60b715ab58fb115e4'),
('onestep_daily_records','dbd51914342db8c60b715ab58fb115e4'),
('onestep_gardens','dbd51914342db8c60b715ab58fb115e4'),
('onestep_growth_grants','dbd51914342db8c60b715ab58fb115e4'),
('onestep_inventory','dbd51914342db8c60b715ab58fb115e4'),
('onestep_item_catalog','acfe6da3932a4f79e7ff1a81dc47d2fa'),
('onestep_photos','dbd51914342db8c60b715ab58fb115e4'),
('onestep_placements','dbd51914342db8c60b715ab58fb115e4'),
('onestep_profiles','dbd51914342db8c60b715ab58fb115e4'),
('onestep_purchases','dbd51914342db8c60b715ab58fb115e4'),
('onestep_slot_catalog','acfe6da3932a4f79e7ff1a81dc47d2fa'),
('onestep_sunshine_ledger','dbd51914342db8c60b715ab58fb115e4'))
SELECT e.name, COALESCE(c.relkind='r' AND md5(jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(r::regrole::text ORDER BY r::regrole::text) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb))::text)=e.hash,false) AS matches_expected
FROM expected e LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name);
WITH funcs(signature) AS (VALUES ('public.onestep_start_day()'),('public.onestep_get_day(date)'),('public.onestep_save_reflection_draft(date,text[],bigint)'),('public.onestep_commit_reflection_v2(date,text[],text[],text,bigint)'),('public.onestep_commit_activity_v2(date,text,text,bigint)')), roles(name) AS (VALUES ('anon'),('authenticated'),('service_role'),('onestep_commit_executor'))
SELECT f.signature,r.name,COALESCE(has_function_privilege(rr.oid,p.oid,'EXECUTE') =
 ((r.name='authenticated' AND (f.signature IN ('public.onestep_start_day()','public.onestep_get_day(date)') OR f.signature='public.onestep_save_reflection_draft(date,text[],bigint)')) OR (r.name='onestep_commit_executor' AND f.signature LIKE '%_v2(%')),false) AS matches_expected
FROM funcs f CROSS JOIN roles r LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature) LEFT JOIN pg_roles rr ON rr.rolname=r.name;

-- 승인 후 A/B 검증 순서 (이 파일은 아래 작업을 자동 실행하지 않음)
-- 1. SQL Editor 대상 프로젝트/역할 확인 후 execute.sql 전체 실행. 이 파일의 38개 결과 모두 true 확인.
--    실패하면 게이트를 열지 않는다. 트랜잭션 오류 후 ROLLBACK하고 불일치 원인을 조사한다.
-- 2. 별도 앱 테스트 승인 후 서버 전용 ONESTEP_DRAFT_TEST_USER_IDS에 승인된 A/B Auth UUID 두 개만 지정.
--    이메일/사용자 metadata/브라우저 입력값을 허용 목록으로 사용하지 않는다. 실제 값은 로그에 남기지 않는다.
-- 3. gates.ts의 DAY_START_ENABLED와 REFLECTION_DRAFT_ENABLED를 각각 승인된 시점에 변경.
--    현재 둘 다 false. NODE_ENV=development만 허용하며 Snapshot 읽기도 활성화되어야 한다.
--    env만 추가해도 게이트가 열리지 않는다. 확정/활동/글/구매 게이트는 변경하지 않는다.
-- 4. 별도 브라우저 프로필 A/B로 로그인. 오늘 Snapshot과 햇살/원장/돌봄을 읽어 기준값을 기록한다.
--    이미 확정된 날은 수정하지 않는다. 테스트 목적으로 계정이나 기록을 초기화하지 않는다.
-- 5. A의 시작 요청 성공 후 질문 하나 저장 -> Snapshot 답변/revision 확인 -> 새로고침/재로그인 복원 확인.
--    네 질문 모두 저장해도 checkin 초안 상태, 추천/돌봄/원장/잔액 불변이어야 한다.
-- 6. B는 다른 답변으로 반복. A/B 교차 조회와 로그아웃/전환/늦은 응답에서 상대 데이터가 없어야 한다.
-- 7. 같은 계정 두 탭의 같은 revision으로 서로 다른 답변을 제출: 한쪽 성공, 다른 쪽 409.
--    충돌한 답변은 메모리에 보존되고 자동 덮어쓰기/보상이 없어야 한다.
-- 8. 응답 유실 후 같은 답변 재시도: 중복 보상/추천 없음, 재조회 결과와 UI가 일치해야 한다.
--    비로그인 401, 허용 목록 밖의 유효 계정은 Next.js 쓰기 API 403 및 RPC 호출 0회 확인.
-- 9. 이상 발생 시 두 앱 게이트를 닫고 중단. 기존 테스트 기록을 임의 삭제하지 않는다.
--    앱 게이트 OFF는 직접 RPC를 막지 못한다. draft EXECUTE 회수는 별도 승인/전용 복구 작업이다.
-- 주의: authenticated GRANT는 A/B 외 모든 로그인 사용자의 직접 RPC 실행도 허용한다.
-- DB 자체에서 A/B만 허용해야 한다면 이 실행본을 적용하지 말고 별도 DB 접근 제한 설계를 승인받는다.
