// Account preparation only. Never imports app stores or uses an admin key.
import { createClient } from '@supabase/supabase-js';
import { parseEnv, parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { AB_INPUT_FILE, abRunFiles } from './helpers/supabase-ab-files.mjs';

export const PROJECT = 'yhzgucbiwvizjxpzwpqg';
const URL = `https://${PROJECT}.supabase.co`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validate(app, input) {
  if (app.NEXT_PUBLIC_SUPABASE_URL !== URL) throw new Error('Wrong target project; stopped before requests.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '')) throw new Error('Active publishable key required.');
  for (const role of ['A', 'B']) {
    const email = input[`ONESTEP_AB_EMAIL_${role}`];
    const password = input[`ONESTEP_AB_PASSWORD_${role}`];
    if (!email || email !== email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Valid test email ${role} required.`);
    // Keep dotenv serialization unambiguous; never print invalid input.
    if (!password || password.length < 8 || /[\r\n"\\]/.test(password)) throw new Error(`Password ${role}: at least 8 characters; no double quote, backslash or newline.`);
  }
  if (input.ONESTEP_AB_EMAIL_A.toLowerCase() === input.ONESTEP_AB_EMAIL_B.toLowerCase()) throw new Error('Two distinct NEW emails required.');
}

// Injectable client/checkpoint are for offline tests only. CLI always uses the real SDK.
export async function prepareAccounts({ client, input, run, createdAfter, checkpoint }) {
  const state = { project: PROJECT, run, createdAfter, outcome: 'IN_PROGRESS', accounts: [] };
  checkpoint(state);
  for (const role of ['A', 'B']) {
    const account = { role, outcome: 'REQUEST_STARTED' };
    state.accounts.push(account);
    checkpoint(state); // Persist intent BEFORE request: a lost response may still create a user.
    try {
      const { data, error } = await client.auth.signUp({
        email: input[`ONESTEP_AB_EMAIL_${role}`], password: input[`ONESTEP_AB_PASSWORD_${role}`],
        options: { data: { onestep_test_run: run, onestep_test_role: role } },
      });
      if (error) {
        account.outcome = ['user_already_exists', 'email_exists'].includes(error.code)
          ? 'DUPLICATE_REJECTED' : 'SIGNUP_ERROR_OR_UNCERTAIN';
        throw new Error('Signup stopped');
      }
      const u = data?.user;
      // Supabase may obscure duplicate signup with an empty identities array.
      // Treat every ambiguous response as a stop, never reuse it or retry automatically.
      if (!u || !uuid.test(u.id) || !Array.isArray(u.identities) || u.identities.length === 0 ||
          u.email?.toLowerCase() !== input[`ONESTEP_AB_EMAIL_${role}`].toLowerCase() ||
          u.user_metadata?.onestep_test_run !== run || u.user_metadata?.onestep_test_role !== role ||
          !(Date.parse(u.created_at) >= Date.parse(createdAfter)) || Date.parse(u.created_at) > Date.now() ||
          state.accounts.some(a => a !== account && a.uuid === u.id)) {
        account.outcome = 'DUPLICATE_OR_UNVERIFIED_RESPONSE';
        throw new Error('Unverified signup');
      }
      account.uuid = u.id;
      account.outcome = u.email_confirmed_at ? 'CREATED_CONFIRMED' : 'CREATED_CONFIRM_EMAIL';
      // Never persist the returned session, JWT, email or password in the report.
      checkpoint(state);
    } catch {
      if (account.outcome === 'REQUEST_STARTED') account.outcome = 'NETWORK_OR_RESULT_UNCERTAIN';
      state.outcome = 'STOPPED_NO_AUTOMATIC_RETRY';
      checkpoint(state);
      return state;
    }
  }
  state.outcome = 'CREATED_AWAITING_AUTH_CHECK';
  checkpoint(state);
  return state;
}

async function main() {
  const { values } = parseArgs({ options: { run: { type: 'boolean' }, 'run-id': { type: 'string' }, input: { type: 'string' } } });
  const INPUT = values.input ?? AB_INPUT_FILE;
  const run = values['run-id'] ?? `onestep-ab-${randomUUID()}`;
  const { state: STATE, output: OUTPUT } = abRunFiles(run);
  if (existsSync(`supabase/tests/results/${run}.started`)) throw new Error('Run already started; use a new run ID.');
  const app = parseEnv(readFileSync('.env.local', 'utf8'));
  const input = parseEnv(readFileSync(INPUT, 'utf8'));
  validate(app, input);
  for (const file of [INPUT, OUTPUT, STATE]) {
    execFileSync('git', ['check-ignore', '--quiet', file], { stdio: 'ignore' });
    const tracked = execFileSync('git', ['ls-files', '--', file], { encoding: 'utf8' });
    if (tracked.trim()) throw new Error('Credential/output file is tracked by Git; stop.');
  }
  if (existsSync(OUTPUT) || existsSync(STATE)) throw new Error('Previous output/state exists. Preserve and review it; no overwrite or retry allowed.');
  console.log(`Target: ${PROJECT}\nRun: ${run}\nAccounts: A and B (addresses hidden; review ${INPUT} locally)\nState: ${STATE}\nOutput: ${OUTPUT}`);
  if (!values.run) {
    console.log('READY: no remote requests or local writes. Emails must be unused; only signup can determine availability.');
    return;
  }
  if (!process.stdin.isTTY) throw new Error('Interactive confirmation required.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let confirmation;
  try { confirmation = await prompt.question(`Confirm you reviewed A/B in ${INPUT} and both are NEW. Type ${PROJECT}: `); }
  finally { prompt.close(); }
  if (confirmation !== PROJECT) throw new Error('Not confirmed; no requests made.');
  const createdAfter = new Date().toISOString();
  const client = createClient(URL, app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options) => {
      if (new globalThis.URL(url).origin !== URL) throw new Error('Wrong request origin');
      return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    } },
  });
  writeFileSync(STATE, '{}\n', { flag: 'wx', mode: 0o600 });
  const state = await prepareAccounts({ client, input, run, createdAfter,
    checkpoint: s => writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 }),
  });
  console.log(JSON.stringify(state, null, 2));
  if (state.outcome !== 'CREATED_AWAITING_AUTH_CHECK') { process.exitCode = 1; return; }
  const lines = [
    `ONESTEP_AB_APPROVED_PROJECT=${PROJECT}`, `ONESTEP_AB_RUN=${run}`, `ONESTEP_AB_CREATED_AFTER=${createdAfter}`,
  ];
  for (const a of state.accounts) {
    lines.push(`ONESTEP_AB_EMAIL_${a.role}=${input[`ONESTEP_AB_EMAIL_${a.role}`]}`,
      `ONESTEP_AB_PASSWORD_${a.role}="${input[`ONESTEP_AB_PASSWORD_${a.role}`]}"`,
      `ONESTEP_AB_USER_ID_${a.role}=${a.uuid}`);
  }
  writeFileSync(OUTPUT, lines.join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Saved ${OUTPUT}. Confirm emails normally; verify UUIDs in Dashboard. No A/B data test was run.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Never print raw SDK/filesystem exceptions or their embedded inputs.
    console.error('Preparation stopped. Check project/config, Git exclusion, existing output/state and interactive confirmation. No automatic retry or deletion.');
    process.exitCode = 1;
  });
}
