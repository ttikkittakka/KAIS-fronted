-- Read-only incident sampling. Run the first SELECT twice, 20-30 seconds apart;
-- rate = delta(xact_rollback) / delta(sampled_at). Do not reset statistics.
SELECT clock_timestamp() AS sampled_at, stats_reset, numbackends,
       xact_commit, xact_rollback, deadlocks
FROM pg_stat_database WHERE datname=current_database();

-- No raw SQL, JWTs, parameters or client addresses are returned.
-- PID alone is not identity: compare backend_start immediately before any
-- separately approved termination. These results are candidates, not log proof.
SELECT clock_timestamp() AS sampled_at, pid, backend_start, usename,
       application_name, state, wait_event_type, wait_event,
       extract(epoch FROM clock_timestamp()-xact_start) AS transaction_seconds,
       CASE WHEN query LIKE '%onestep_save_reflection_draft%' THEN 'draft RPC'
            WHEN query LIKE '%set_config%' THEN 'request context'
            WHEN query ILIKE 'rollback%' THEN 'rollback'
            ELSE 'other (redacted)' END AS operation
FROM pg_stat_activity
WHERE usename='authenticator' AND pid<>pg_backend_pid()
ORDER BY pid;

-- Inventory of retry-code literals: no function bodies or user data.
SELECT n.nspname,p.proname,
 (SELECT count(*) FROM regexp_matches(p.prosrc,'40001','g')) AS count_40001,
 (SELECT count(*) FROM regexp_matches(p.prosrc,'40P01','g')) AS count_40p01
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='onestep_private' OR (n.nspname='public' AND p.proname LIKE 'onestep_%'))
 AND (p.prosrc LIKE '%40001%' OR p.prosrc LIKE '%40P01%')
ORDER BY 1,2;
