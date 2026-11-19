import { fileURLToPath } from 'node:url';

// --execute가 정확히 지정된 실행당 최대 한 번만 호출합니다. 키를 명령 인자로 받지 않습니다.
const args = process.argv.slice(2);
if (args.length !== 1 || !['--execute', '--diagnose'].includes(args[0])) {
  console.log('연결 테스트 미실행. 프로젝트 루트의 .env.local에 OPENAI_API_KEY를 설정하세요. 기존 Supabase 항목은 유지하세요.');
  console.log('직접 1회 실행: npm run openai:check -- --execute');
  console.log('외부 호출 없는 설정 진단: npm run openai:check -- --diagnose');
  if (args.length) process.exitCode = 1;
} else {
  try {
    const { loadOpenAIEnvironment } = await import('./helpers/openai-env.mjs');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const { key, diagnostics } = loadOpenAIEnvironment(root);
    const { loadTs } = await import('./helpers/load-ts.mjs');
    const { testOpenAIConnection, keyConfigurationError, CONNECTION_MODEL } = loadTs(new URL('../src/lib/openai/connection.ts', import.meta.url));
    const result = args[0] === '--diagnose'
      ? { status: 'not_run', model: CONNECTION_MODEL, errorCode: keyConfigurationError(key), ...diagnostics }
      : await testOpenAIConnection({ execute: true }, { env: { OPENAI_API_KEY: key } });
    console.log(JSON.stringify(result));
    if (result.errorCode === 'OPENAI_API_KEY_MISSING') {
      console.log('API를 호출하지 않았습니다. .env.local에 OPENAI_API_KEY를 설정한 뒤 직접 다시 실행하세요.');
    }
    if (result.errorCode === 'OPENAI_API_KEY_PLACEHOLDER') console.log('예시 문자열입니다. .env.local의 OPENAI_API_KEY에 발급받은 비밀키를 설정하세요.');
    if (result.errorCode === 'OPENAI_PROJECT_ID_NOT_API_KEY') console.log('프로젝트 ID는 API 키가 아닙니다. 발급받은 비밀키를 설정하세요.');
    if (result.errorCode === 'OPENAI_KEY_HEADER_UNSAFE') console.log('인증 헤더에 사용할 수 없는 문자가 있습니다. 한글 설명·줄바꿈 등이 섞이지 않았는지 로컬에서 확인하세요.');
    if (result.errorCode || (args[0] === '--execute' && result.status !== 'success')) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ status: 'not_run', model: 'gpt-5.4-mini', errorCode: 'OPENAI_LOCAL_SETUP_FAILED' }));
    process.exitCode = 1;
  }
}
