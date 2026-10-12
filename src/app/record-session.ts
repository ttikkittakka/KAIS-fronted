// A document-wide exclusive writer: includes metadata, photo transactions and cleanup.
// Keep the lock until document destruction, including while backgrounded. A timeout
// or visibility-based lease could let a suspended photo write race another tab.
export const RECORD_SESSION_LOCK = 'little-garden.record-writer.v1';
export function acquireRecordSession(manager?: Pick<LockManager, 'request'>): Promise<void> {
  if (!manager) return Promise.reject(new Error('기록을 안전하게 저장하려면 HTTPS 주소에서 최신 Safari 또는 Chrome으로 열어주세요. 이 환경에서는 여러 탭의 저장 충돌을 막을 수 없어 기록을 열지 않았어요.'));
  return new Promise<void>((resolve, reject) => {
    manager.request(RECORD_SESSION_LOCK, { mode: 'exclusive' }, async () => {
      resolve();
      // The browser releases this lock when this document closes or reloads.
      await new Promise<void>(() => {});
    }).catch(reject);
  });
}
