import 'server-only';
import { createActivityHandler } from './server';
import { createSharedPhotoTrialExecutor, CURRENT_PHOTO_TRIAL_ID } from './photo-trial';
import { isApprovedDraftTester } from '../account-reflection/gates';

const PHOTO_TRIAL_ENABLED = false;
const handle = createActivityHandler({
  enabled: () => PHOTO_TRIAL_ENABLED && process.env.NODE_ENV === 'development' && process.env.ONESTEP_ACTIVITY_TRIAL_APPROVAL === CURRENT_PHOTO_TRIAL_ID,
  allowedUser: id => isApprovedDraftTester(id) && id === process.env.ONESTEP_ACTIVITY_APPROVED_A_ID,
  execute: (command, signal, before) => {
    if (!before) throw new Error('photo-trial-snapshot-required');
    return createSharedPhotoTrialExecutor(async () => before, CURRENT_PHOTO_TRIAL_ID)(command, signal);
  },
});
export async function handlePhotoTrial(request: Request) {
  // Reject all other actions before even the handler's idempotent return path.
  try {
    const input = await request.clone().json();
    if (input.action !== 'photo_done' || input.date !== '2026-11-17' || input.revision !== 5 || input.careId !== undefined)
      return Response.json({ error: 'photo-trial-scope' }, { status: 403 });
  } catch { return Response.json({ error: 'invalid-input' }, { status: 400 }); }
  return handle(request);
}
