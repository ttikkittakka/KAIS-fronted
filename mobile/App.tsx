import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Contact, ContactField } from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import { File as NativeFile, Paths } from 'expo-file-system';
import { gardenUrl } from './garden-url';

const bootstrap = 'window.__GARDEN_NATIVE__ = true; true;';
const ID = /^[0-9a-f]{24}$/;

async function takePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('기기 설정에서 카메라를 허용한 뒤 다시 시도해 주세요.');
  const photo = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.58, base64: true, exif: false });
  if (photo.canceled) return null;
  const asset = photo.assets[0];
  try {
    if (!asset?.base64 || asset.base64.length > 12_000_000) throw new Error('사진을 읽지 못했어요. 가볍게 한 장 다시 찍어 주세요.');
    return { data: asset.base64 };
  } finally {
    if (asset?.uri.startsWith(Paths.cache.uri.replace(/\/?$/, '/'))) {
      try { new NativeFile(asset.uri).delete(); } catch { /* The OS can clear the app cache if it has already moved the file. */ }
    }
  }
}

async function pickContact() {
  const person = await Contact.presentPicker();
  if (!person) return null;
  const { givenName, familyName, phones } = await person.getDetails([ContactField.GIVEN_NAME, ContactField.FAMILY_NAME, ContactField.PHONES]);
  const phone = phones?.[0]?.number;
  if (!phone) throw new Error('이 연락처에 전화번호가 없어요.');
  return { name: [familyName, givenName].filter(Boolean).join(' ') || '선택한 연락처', phone };
}

function Garden() {
  const [url] = useState(gardenUrl);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const view = useRef<WebView<object>>(null);
  const active = useRef(false);
  const currentUrl = useRef(url.href);
  const send = (result: object, from: string) => {
    if (currentUrl.current !== from) return;
    const json = JSON.stringify(result).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    view.current?.injectJavaScript("window.dispatchEvent(new CustomEvent('garden-native-result',{detail:" + json + '})); true;');
  };
  const onMessage = async ({ nativeEvent }: WebViewMessageEvent) => {
    let request: { id?: string; action?: string };
    try {
      if (new URL(nativeEvent.url).origin !== url.origin || nativeEvent.data.length > 250) return;
      request = JSON.parse(nativeEvent.data);
    } catch { return; }
    if (!request || typeof request.id !== 'string' || !ID.test(request.id)) return;
    const from = currentUrl.current;
    if (active.current) { send({ id: request.id, ok: false, error: '이미 기기 화면이 열려 있어요.' }, from); return; }
    if (request.action !== 'contacts' && request.action !== 'camera') return;
    active.current = true;
    try {
      const value = request.action === 'camera' ? await takePhoto() : await pickContact();
      send({ id: request.id, ok: true, value }, from);
    } catch (error) {
      send({ id: request.id, ok: false, error: error instanceof Error ? error.message : '기기 권한을 확인해 주세요.' }, from);
    } finally { active.current = false; }
  };
  return <SafeAreaView style={styles.safe}>
    {error ? <View style={styles.center}><Text style={styles.title}>정원에 연결할 수 없어요</Text>
      <Text style={styles.copy}>같은 Wi-Fi에서 웹 서버가 열려 있는지 확인해 주세요.</Text>
      <Pressable accessibilityRole="button" onPress={() => { setError(false); setRetry(value => value + 1); }} style={styles.action}><Text style={styles.actionText}>다시 열기</Text></Pressable>
    </View> : <WebView<object> key={retry} ref={view} source={{ uri: url.href }} originWhitelist={['https://*', 'http://*', 'tel:*', 'sms:*']}
      javaScriptEnabled domStorageEnabled mixedContentMode="never" allowFileAccess={false} setSupportMultipleWindows={false}
      injectedJavaScriptBeforeContentLoaded={bootstrap} injectedJavaScript={bootstrap}
      startInLoadingState renderLoading={() => <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator color="#2b5346"/><Text style={styles.copy}>정원을 여는 중이에요</Text></View>}
      onError={() => setError(true)} onHttpError={event => { if (event.nativeEvent.url === url.href) setError(true); }}
      onNavigationStateChange={event => { currentUrl.current = event.url; }}
      onMessage={event => void onMessage(event)}
      onShouldStartLoadWithRequest={request => {
        if (request.url === 'about:blank') return true;
        try {
          const target = new URL(request.url);
          if (target.origin === url.origin) return true;
          if (request.isTopFrame !== false && ['https:', 'tel:', 'sms:'].includes(target.protocol)) void Linking.openURL(target.href).catch(() => {});
        } catch {}
        return false;
      }}/>
    }
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><Garden/></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#eef3ee' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12, backgroundColor: '#eef3ee' },
  title: { fontSize: 23, fontWeight: '700', color: '#213d35' },
  copy: { fontSize: 15, textAlign: 'center', color: '#405b51' },
  action: { paddingHorizontal: 24, paddingVertical: 13, backgroundColor: '#284b40', borderRadius: 14 },
  actionText: { color: '#fff', fontWeight: '600' },
});
