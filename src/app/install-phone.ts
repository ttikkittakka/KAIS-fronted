export const INSTALL_CONSENT_VERSION = 1;
export const INSTALL_INTENT_KEY = 'little-garden.install-intent.v1';

export function koreanMobile(input: string) {
  const value = input.replace(/[\s()-]/g, '');
  const local = value.startsWith('+82') ? '0' + value.slice(3) : value;
  return /^010[0-9]{8}$/.test(local) ? '+82' + local.slice(1) : null;
}
