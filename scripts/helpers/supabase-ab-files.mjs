// Shared by account preparation and live tests. Never use the preserved legacy env.
export const AB_ENV_FILE = '.env.onestep-ab-run.local';
export const AB_INPUT_FILE = '.env.onestep-ab-signup.local';
export const AB_STATE_FILE = '.env.onestep-ab-signup-state.json';

// Strict IDs keep all generated paths in the ignored .env namespace.
export function abRunFiles(run) {
  if (!/^onestep-ab-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(run ?? '')) {
    throw new Error('Valid onestep-ab UUID run ID required.');
  }
  return {
    state: `.env.${run}-signup-state.json`,
    output: `.env.${run}-run.local`,
  };
}
