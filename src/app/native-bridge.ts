type NativeContact = { name: string; phone: string };
type NativeActions = { contacts: NativeContact | null; camera: { data: string } | null };
declare global {
  interface Window {
    __GARDEN_NATIVE__?: boolean;
    ReactNativeWebView?: { postMessage: (value: string) => void };
  }
}

export const nativeDevice = () => typeof window !== 'undefined' && window.__GARDEN_NATIVE__ === true && !!window.ReactNativeWebView;

export function requestNative<K extends keyof NativeActions>(action: K): Promise<NativeActions[K]> {
  return new Promise((resolve, reject) => {
    if (!nativeDevice()) { reject(new Error('휴대폰 앱에서 열어 주세요.')); return; }
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('');
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener('garden-native-result', receive);
    };
    const receive = (event: Event) => {
      const result = (event as CustomEvent<{ id: string; ok: boolean; value: NativeActions[K]; error?: string }>).detail;
      if (result?.id !== id) return;
      cleanup();
      if (result.ok) resolve(result.value); else reject(new Error(result.error || '기기의 기능을 사용할 수 없어요.'));
    };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('기기 응답이 없어요. 다시 시도해 주세요.')); }, 120_000);
    window.addEventListener('garden-native-result', receive);
    window.ReactNativeWebView!.postMessage(JSON.stringify({ id, action }));
  });
}

export async function nativePhoto() {
  const result = await requestNative('camera');
  if (!result || typeof result.data !== 'string' || result.data.length > 12_000_000) return null;
  const data = Uint8Array.from(atob(result.data), char => char.charCodeAt(0));
  return new File([data], 'camera.jpg', { type: 'image/jpeg' });
}
