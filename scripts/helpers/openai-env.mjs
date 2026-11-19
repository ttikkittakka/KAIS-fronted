import nextEnv from '@next/env';

/** Next.js의 기존 우선순위를 유지합니다. 진단에는 값·길이·해시를 포함하지 않습니다. */
export function loadOpenAIEnvironment(root) {
  const name = 'OPENAI_API_KEY';
  const inherited = Object.hasOwn(process.env, name);
  let failed = false;
  const loaded = nextEnv.loadEnvConfig(root, true, { info() {}, error() { failed = true; } });
  if (failed) throw new Error('OPENAI_ENV_LOAD_FAILED');
  const local = loaded.loadedEnvFiles.find(file => file.path === '.env.local');
  const source = inherited ? 'process.env'
    : loaded.loadedEnvFiles.find(file => Object.hasOwn(file.env, name))?.path ?? 'missing';
  const key = process.env[name];
  return {
    key,
    diagnostics: {
      source, localFileLoaded: !!local,
      localDefinesKey: !!local && Object.hasOwn(local.env, name),
      testMode: process.env.NODE_ENV === 'test',
      keyPresent: key !== undefined, keyEmpty: !key?.trim(),
      containsNonAscii: /[^\x00-\x7f]/.test(key ?? ''),
      containsHangul: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(key ?? ''),
    },
  };
}
