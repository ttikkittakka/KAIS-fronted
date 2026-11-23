import { handlePreparedCommitRequest, handleCommitCapability } from '../../../../../lib/account-reflection/commit-runtime';
export const runtime = 'nodejs';
export const POST = handlePreparedCommitRequest;
export const GET = handleCommitCapability;
