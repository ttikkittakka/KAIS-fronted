import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const baseline = JSON.parse(readFileSync(new URL('../supabase/releases/phase3b-ab-baseline.json', import.meta.url), 'utf8'));
const md5 = s => createHash('md5').update(s.replaceAll('\r', '')).digest('hex');
export const helper = `CREATE OR REPLACE FUNCTION onestep_private.require_reflection_test_user()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $guard$
DECLARE u uuid := auth.uid();
BEGIN
 IF u IS NULL OR (SELECT count(*) FROM onestep_private.reflection_test_allowlist) <> 2
 OR NOT EXISTS (SELECT 1 FROM onestep_private.reflection_test_allowlist WHERE user_id=u)
 THEN RAISE EXCEPTION 'Reflection access denied' USING ERRCODE='42501'; END IF;
END $guard$;`;
export const changed = baseline.map(row => {
 if (md5(row.definition) !== row.hash) throw Error('Baseline hash mismatch');
 const definition = row.definition.replace(/(\r?\nBEGIN\r?\n)/i, '$1  PERFORM onestep_private.require_reflection_test_user();\n');
 if (definition === row.definition) throw Error('Missing function entry');
 return { ...row, definition, hash: md5(definition) };
});
const configDDL = `CREATE TABLE onestep_private.reflection_test_allowlist (user_id uuid PRIMARY KEY);
ALTER TABLE onestep_private.reflection_test_allowlist OWNER TO postgres;
ALTER TABLE onestep_private.reflection_test_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE onestep_private.reflection_test_allowlist FROM PUBLIC, anon, authenticated, service_role, onestep_commit_executor;
${helper}
ALTER FUNCTION onestep_private.require_reflection_test_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION onestep_private.require_reflection_test_user() FROM PUBLIC, anon, authenticated, service_role, onestep_commit_executor;
`;
export { configDDL };
export function generate(ids) {
 if (ids.length!==2 || new Set(ids).size!==2 || ids.some(id=>! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))) throw Error('Invalid approved pair');
 const original=readFileSync(new URL('../supabase/releases/phase3b-enable-draft.execute.sql',import.meta.url),'utf8');
 const pre=original.slice(original.indexOf('DO $roles$'),original.indexOf('DO $$ BEGIN'));
 const sections=[...original.matchAll(/INTO bad FROM \((WITH[\s\S]*?)\) c WHERE NOT matches_expected;/g)].map(m=>m[1]);
 if(sections.length!==6) throw Error('Unexpected preflight source');
 const replaceHashes=q=>baseline.reduce((out,row,i)=>out.replaceAll(row.hash,changed[i].hash),q);
 const assert=(name,q)=>`DO $${name}$ BEGIN IF EXISTS(SELECT 1 FROM (${q}) checks WHERE NOT matches_expected) THEN RAISE EXCEPTION '${name} failed'; END IF; END $${name}$;\n`;
 const nonce=randomBytes(32).toString('hex'),digest=createHash('md5').update([...ids].sort().join(',')+nonce).digest('hex');
 const pair=(table,column)=>`SELECT count(*)=2 AND md5(string_agg(${column}::text,',' ORDER BY ${column}::text)||'${nonce}')='${digest}' AS matches_expected FROM ${table}`;
 const controls=`SELECT (SELECT pg_get_userbyid(c.relowner)='postgres' AND c.relrowsecurity AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=c.oid)
 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
 FROM pg_class c WHERE c.oid=to_regclass('onestep_private.reflection_test_allowlist')) IS TRUE
 AND (SELECT pg_get_userbyid(p.proowner)='postgres' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[]
 AND md5(replace(p.prosrc,chr(13),''))='${md5(helper.split('$guard$')[1])}'
 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
 FROM pg_proc p WHERE p.oid=to_regprocedure('onestep_private.require_reflection_test_user()')) IS TRUE AS matches_expected`;
 const header=`-- PRIVATE LOCAL RELEASE: contains approved identifiers. Do not commit, publish, paste into chat, or bundle.
-- Target yhzgucbiwvizjxpzwpqg. SQL Editor postgres. Separate application approval required.
-- Run whole file with no concurrent schema/permission administration; on error ROLLBACK and stop.
-- Only control-list rows are inserted; existing user records are neither created nor removed by this migration.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL search_path=pg_catalog,public;
`;
 const postChecks=assert('ab_functions',replaceHashes(sections[3]))+assert('ab_rls',sections[4])+assert('ab_effective',sections[5])+assert('ab_controls',controls)+assert('ab_pair',pair('onestep_private.reflection_test_allowlist','user_id'));
 const install=header+pre+assert('approved_auth_pair',pair('auth.users','id'))+`DO $absent$ BEGIN
 IF to_regclass('onestep_private.reflection_test_allowlist') IS NOT NULL OR to_regprocedure('onestep_private.require_reflection_test_user()') IS NOT NULL THEN RAISE EXCEPTION 'Control objects already exist; review before retry'; END IF;
 IF (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='onestep_private') IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION 'Private schema owner drift'; END IF;
END $absent$;
`+configDDL+`INSERT INTO onestep_private.reflection_test_allowlist(user_id) VALUES ${ids.map(id=>`('${id}'::uuid)`).join(',')};\n`+changed.map(r=>r.definition+';\n').join('')+`GRANT EXECUTE ON FUNCTION public.onestep_save_reflection_draft(date,text[],bigint) TO authenticated;\n`+postChecks+'COMMIT;\n';
 const restore=header+original.slice(original.indexOf('DO $roles$'),original.indexOf('DO $function_preflight$'))+postChecks+baseline.map(r=>r.definition+';\n').join('')+`REVOKE EXECUTE ON FUNCTION public.onestep_save_reflection_draft(date,text[],bigint) FROM authenticated;\n`+pre+`-- Control objects stay sealed for audit. No DROP or deletion of test records.
COMMIT;\n`;
 const before=`-- SELECT ONLY. Before install: every matches_expected must be true. No UUID output.\n${sections.slice(0,3).map(q=>q+';').join('\n')}\n${pair('auth.users','id')};\n`;
 const after=`-- SELECT ONLY. After install: every matches_expected must be true. No UUID output.\n${[replaceHashes(sections[3]),sections[4],sections[5],controls,pair('onestep_private.reflection_test_allowlist','user_id')].map(q=>q+';').join('\n')}\n`;
 return { 'phase3b-ab-draft.execute.sql':install, 'phase3b-ab-draft.restore.sql':restore,
 'phase3b-ab-draft.before.verify.sql':before, 'phase3b-ab-draft.after.verify.sql':after,
 'phase3b-ab-draft.restored.verify.sql':sections.slice(0,3).map(q=>q+';').join('\n') };
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const path=process.argv[2]; if(!path) throw Error('Provide approved ignored A/B fixture path');
 const source=readFileSync(path,'utf8'); const get=key=>source.match(new RegExp('^'+key+'=(.*)$','m'))?.[1].trim().replace(/^['"]|['"]$/g,'');
 if(get('ONESTEP_AB_APPROVED_PROJECT')!=='yhzgucbiwvizjxpzwpqg')throw Error('Unexpected project');
 const files=generate(['A','B'].map(key=>get('ONESTEP_AB_USER_ID_'+key)));
 const dir='.env.phase3b-ab'; mkdirSync(dir,{recursive:true});
 for(const [name,content] of Object.entries(files)) writeFileSync(resolve(dir,name),content,{mode:0o600});
 console.log('Prepared '+Object.keys(files).length+' private SQL files; identifiers omitted. No DB connection performed.');
}
