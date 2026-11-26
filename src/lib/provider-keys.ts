export const API_PROVIDERS = ['openai', 'edrug', 'gov24'] as const;
export type ApiProvider = typeof API_PROVIDERS[number];

export const PROVIDER_KEY_HEADER = 'X-Onestep-Provider-Key';
export const OPENAI_KEY_HEADER = 'X-Onestep-OpenAI-Key';
export const MAX_PROVIDER_KEY_LENGTH = 512;

export function parseProviderKey(value: string | null | undefined) {
  const key = value?.trim();
  return key && key.length <= MAX_PROVIDER_KEY_LENGTH && /^[!-~]+$/.test(key) ? key : null;
}
