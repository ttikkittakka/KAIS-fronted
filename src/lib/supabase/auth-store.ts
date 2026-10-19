import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type AuthAction = 'login' | 'signup' | 'reset' | 'update' | 'logout';
export type AuthSnapshot = {
  phase: 'loading' | 'signed-out' | 'signed-in' | 'recovery' | 'unavailable';
  user: { id: string; email: string } | null;
  busy: boolean;
  message: string;
  error: boolean;
  epoch: number;
};
export const INITIAL_AUTH: AuthSnapshot = {
  phase: 'loading', user: null, busy: false, message: '', error: false, epoch: 0,
};

export function authErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  switch (code) {
    case 'invalid_credentials': return '이메일 또는 비밀번호를 확인해 주세요.';
    case 'email_not_confirmed': return '이메일의 인증 링크를 먼저 확인해 주세요.';
    case 'weak_password': return '더 안전한 비밀번호를 사용해 주세요. 8자 이상을 권장해요.';
    case 'same_password': return '기존 비밀번호와 다른 비밀번호를 입력해 주세요.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit': return '요청이 많아요. 잠시 후 다시 시도해 주세요.';
    default: return '요청을 완료하지 못했어요. 입력 내용과 연결 상태를 확인하고 다시 시도해 주세요.';
  }
}

/** Contains no garden storage dependencies and exposes no tokens to React. */
export function createAuthStore() {
  let state = INITIAL_AUTH;
  let client: SupabaseClient | null = null;
  let generation = 0;
  let eventRevision = 0;
  let recovery = false;
  let locked = false;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<AuthSnapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const accept = (session: Session | null) => {
    publish({
      phase: session ? (recovery ? 'recovery' : 'signed-in') : 'signed-out',
      user: session ? { id: session.user.id, email: session.user.email ?? '' } : null,
      epoch: state.epoch + 1, message: '', error: false,
    });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start(authClient: SupabaseClient | null, recoveryRequested = false) {
      const run = ++generation;
      client = authClient;
      recovery = recoveryRequested;
      publish({ ...INITIAL_AUTH, epoch: state.epoch + 1 });
      if (!client) {
        publish({ phase: 'unavailable', message: '로그인 연결을 준비하고 있어요. 잠시 후 다시 방문해 주세요.', error: true });
        return () => { generation++; };
      }
      const activeClient = client;
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (run !== generation) return;
        eventRevision++;
        if (event === 'PASSWORD_RECOVERY') recovery = true;
        if (event === 'SIGNED_OUT') recovery = false;
        accept(session);
        if (event === 'INITIAL_SESSION' && recoveryRequested && !session) {
          publish({ error: true, message: '재설정 링크를 확인하지 못했어요. 새 링크를 요청해 주세요.' });
        }
      });
      const revision = eventRevision;
      // Subscribe first; never await SDK calls inside the auth event callback.
      void (async () => {
        try {
          const initialized = await activeClient.auth.initialize();
          if (run !== generation) return;
          if (initialized.error) {
            publish({ phase: 'signed-out', user: null, error: true, message: '인증 링크를 확인하지 못했어요. 새 링크를 요청해 주세요.', epoch: state.epoch + 1 });
            return;
          }
          const { data, error } = await activeClient.auth.getSession();
          if (run !== generation || revision !== eventRevision) return;
          if (error) throw error;
          accept(data.session);
          if (recoveryRequested && !data.session) publish({ error: true, message: '재설정 링크가 만료되었거나 이 브라우저에서 시작한 요청이 아니에요. 새 링크를 요청해 주세요.' });
        } catch {
          if (run === generation && revision === eventRevision) publish({ phase: 'signed-out', user: null, error: true, message: '로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요.' });
        }
      })();
      return () => { if (run === generation) generation++; subscription.unsubscribe(); };
    },
    async submit(action: AuthAction, email = '', password = '', origin = '') {
      if (locked || !client || state.phase === 'loading') return false;
      if ((action === 'login' || action === 'signup' || action === 'reset') && state.phase !== 'signed-out') return false;
      if (action === 'update' && state.phase !== 'recovery') return false;
      if (action === 'logout' && !state.user) return false;
      locked = true;
      if (action === 'login' || action === 'signup') recovery = false;
      const run = generation;
      publish({ busy: true, message: '', error: false });
      try {
        if (action === 'logout') {
          const { error } = await client.auth.signOut({ scope: 'local' });
          if (error) throw error;
          if (run === generation) { recovery = false; accept(null); }
        } else if (action === 'update') {
          const { error } = await client.auth.updateUser({ password });
          if (error) throw error;
          if (run === generation && state.user) {
            recovery = false;
            publish({ phase: 'signed-in', message: '비밀번호를 변경했어요. 다음 로그인부터 새 비밀번호를 사용해 주세요.' });
          }
        } else {
          const redirect = new URL('/', origin);
          if (action === 'reset') {
            redirect.searchParams.set('auth', 'recovery');
            const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect.href });
            if (error) throw error;
            if (run === generation && !state.user) publish({ message: '가입된 이메일이라면 재설정 안내를 보냈어요. 이 브라우저에서 메일의 링크를 열어 주세요.' });
          } else {
            redirect.searchParams.set('auth', 'confirm');
            const { data, error } = action === 'signup'
              ? await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect.href } })
              : await client.auth.signInWithPassword({ email: email.trim(), password });
            if (error) throw error;
            if (run === generation) {
              // Auth events own session state; never replay a stale response over a newer account.
              if (!data.session && !state.user) publish({ message: '가입을 진행할 수 있다면 인증 메일을 보냈어요. 같은 브라우저에서 링크를 열어 주세요. 이미 가입했다면 로그인해 주세요.' });
            }
          }
        }
        return true;
      } catch (error) {
        if (run === generation) publish({ error: true, message: authErrorMessage(error) });
        return false;
      } finally {
        locked = false;
        if (run === generation) publish({ busy: false });
      }
    },
  };
}
