import { getPhoto, savePhoto } from '../../../../lib/account-photos/server';
export const runtime = 'nodejs';
export const GET = getPhoto;
export const POST = savePhoto;
