import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('NOLOGIN release has four complete DO blocks and preserves dollar quoting', () => {
  const sql = readFileSync('supabase/releases/phase3b-server-nologin.execute.sql', 'utf8');
  assert.equal((sql.match(/^DO \$\$/gm) ?? []).length, 4);
  assert.equal((sql.match(/^END \$\$;/gm) ?? []).length, 4);
  assert.doesNotMatch(sql, /^(?:DO|END) \$(?!\$)/m);
  assert.doesNotMatch(sql, /FOR p IN SELECT p\.oid,p\.proname FROM pg_proc p/);
  // Always use a replacer function for generated SQL containing dollar quotes.
  const block = 'DO $$ BEGIN NULL; END $$;';
  assert.notEqual('MARKER'.replace('MARKER', block), block);
  assert.equal('MARKER'.replace('MARKER', () => block), block);
  assert.match(sql, /CREATE ROLE onestep_app_login_v1 NOLOGIN PASSWORD NULL/);
  assert.match(sql, /WITH ADMIN FALSE, INHERIT FALSE, SET TRUE/);
  assert.match(sql, /COMMIT;\s*$/);
  const draft = readFileSync('supabase/drafts/phase3b-server-login.prepare.sql', 'utf8');
  assert.match(draft, /RAISE EXCEPTION 'Unapproved/);
  assert.match(draft, /ROLLBACK;\s*$/);
});
