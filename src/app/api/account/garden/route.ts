import { handleGardenRequest } from '../../../../lib/account-garden/server';

export const runtime = 'nodejs';
export const GET = handleGardenRequest;
export const POST = handleGardenRequest;
