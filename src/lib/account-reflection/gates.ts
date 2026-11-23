import 'server-only';

// Separate code-reviewed activation approvals. No environment flag opens these gates.
const DAY_START_ENABLED = true;
const REFLECTION_DRAFT_ENABLED = true;
export const isDayStartEnabled = () => process.env.NODE_ENV === 'development' && DAY_START_ENABLED;
export const isReflectionDraftEnabled = () => process.env.NODE_ENV === 'development' && REFLECTION_DRAFT_ENABLED;

/** API-only restriction; an authenticated SQL GRANT also permits direct Supabase RPC calls. */
export function isApprovedDraftTester(userId: string, env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'development') return false;
  const ids = (env.ONESTEP_DRAFT_TEST_USER_IDS ?? '').split(',').map(id => id.trim());
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return ids.length === 2 && new Set(ids).size === 2 && ids.every(id => uuid.test(id)) && ids.includes(userId);
}
