-- SELECT only; no RPC invocation and no user contents.
SELECT md5(p.prosrc)='1634719e9037dbcd9f439b31c07fd0ed' AND pg_get_userbyid(p.proowner)='postgres'
    AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}' AND p.prosecdef AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
    AND p.proconfig=ARRAY['search_path=""']::text[] AS all_function_invariants_match,
 md5(p.prosrc) AS body_hash, pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef AS security_definer, p.proconfig,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute
FROM pg_proc p WHERE p.oid='public.onestep_save_reflection_draft(date,text[],bigint)'::regprocedure;
