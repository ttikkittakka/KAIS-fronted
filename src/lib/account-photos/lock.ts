import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
export const photoDirectory = (owner: string, date: string) => join(process.cwd(), '.env.phase3b-ab', 'photo-uploads', createHash('sha256').update(owner + ':' + date).digest('hex'));
export async function withPhotoDayLock<T>(owner: string, date: string, work: () => Promise<T>) {
  const dir = photoDirectory(owner, date); await mkdir(dir, { recursive: true });
  const path = join(dir, 'operation.lock'); const lock = await open(path, 'wx', 0o600);
  try { return await work(); } finally { await lock.close(); await unlink(path); }
}
