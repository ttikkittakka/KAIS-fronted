import Constants from 'expo-constants';

export function gardenUrl() {
  const configured = process.env.EXPO_PUBLIC_GARDEN_WEB_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  const onWeb = typeof window !== 'undefined' ? window.location?.hostname : undefined;
  const url = new URL(configured || 'http://' + (onWeb || host || 'localhost') + ':3000/demo');
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid garden URL');
  return url;
}
