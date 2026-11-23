import { handleWritingRequest } from '../../../../lib/account-writing/server';
import { authenticateAccount, reply } from '../../../../lib/account/auth';
import { isApprovedDraftTester } from '../../../../lib/account-reflection/gates';
import { seoulToday } from '../../../../lib/account-records/model';
export const runtime = 'nodejs';
export const PUT = handleWritingRequest;
export async function GET(request: Request) {
  const auth = await authenticateAccount(request); if (auth instanceof Response) return auth;
  return reply(200, { enabled: isApprovedDraftTester(auth.userId), today: seoulToday() });
}
