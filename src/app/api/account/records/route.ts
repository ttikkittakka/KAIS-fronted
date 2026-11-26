import { handleRecordsRequest } from '../../../../lib/account-records/server';
import { handleMonthRequest } from '../../../../lib/account-records/month-server';
import { handleDiaryEditRequest } from '../../../../lib/account-records/diary-edit-server';

export const runtime = 'nodejs';
export const GET = (request: Request) => new URL(request.url).searchParams.has('month') ? handleMonthRequest(request) : handleRecordsRequest(request);
export const PATCH = handleDiaryEditRequest;
