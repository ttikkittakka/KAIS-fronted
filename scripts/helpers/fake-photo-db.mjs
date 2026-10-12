// An explicit IndexedDB adapter, not a real browser/OS storage test.
export function installPhotoDb() {
  const state = { files: new Map(), failure: null, blocked: false, closed: 0 };
  globalThis.indexedDB = { open() {
    const request = {};
    queueMicrotask(() => {
      if (state.blocked) { request.onblocked?.(); return; }
      request.result = { close() { state.closed++; }, transaction() {
        const tx = { error: null, objectStore() {
          function operation(kind, value, id) {
            const result = {};
            queueMicrotask(() => {
              if (state.failure === kind) { state.failure = null; tx.error = new DOMException('Simulated full/aborted storage', 'QuotaExceededError'); tx.onabort?.(); return; }
              if (kind === 'write') state.files.set(id, value);
              if (kind === 'delete') state.files.delete(id);
              if (kind === 'read') result.result = state.files.get(id);
              tx.oncomplete?.();
            });
            return result;
          }
          return { get: id => operation('read', undefined, id), put: (blob,id) => operation('write', blob, id), delete: id => operation('delete', undefined, id) };
        } };
        return tx;
      } };
      request.onsuccess?.();
    });
    return request;
  } };
  return state;
}
