# Supabase 연결 준비

현재 앱은 Next.js App Router를 사용합니다. `src/lib/supabase/client.ts`의
`getSupabaseClient()`는 필요할 때 클라이언트를 초기화하고 재사용합니다.
기존 기록·정원 저장 로직에서는 이 모듈을 호출하지 않습니다.
연결 확인용 클라이언트의 세션 저장, 토큰 자동 갱신, URL 기반 로그인 감지는
모두 꺼져 있습니다. 별도의 `auth-client.ts`에서만 Supabase Auth 세션을 관리합니다.

## 환경변수

프로젝트 루트의 `.env.local`에 다음 두 항목을 추가하세요. 기존 파일이나
관리자 비밀번호 설정은 덮어쓰지 마세요. `.env.example`은 빈 설정 예시입니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Supabase 프로젝트의 Connect/API Keys에서 Project URL과 Publishable key를
확인하세요. `sb_secret_*`, `service_role`, 데이터베이스 비밀번호는 사용하지
않습니다. 이번 모듈은 새 `sb_publishable_*` 형식만 허용합니다.
`NEXT_PUBLIC_*` 값은 브라우저에 공개될 수 있으므로 비밀값을 넣으면 안 됩니다.
런타임 형식 검사는 잘못된 키의 사용을 막지만 빌드 시 공개 변수에 들어간
비밀값의 노출을 막아주지는 않습니다.

설정 후 개발 서버를 재시작하세요. `.env.development.local`에 같은 변수가
있으면 개발 환경에서 `.env.local`보다 우선합니다. 배포 시 공개 변수는
빌드 전에 설정하고, 값이 바뀌면 다시 빌드하세요.

## 안전한 초기화

```ts
import { getSupabaseClient } from '@/lib/supabase/client';

const result = getSupabaseClient();
if (!result.ok) {
  // missing-config / invalid-config / initialization-failed
  // Supabase 기능만 비활성화하고 기존 앱 기능을 계속 제공합니다.
} else {
  // result.client: 향후 승인된 서버 기능에서만 사용
}
```

모듈을 import하는 것만으로 연결하지 않습니다. 환경변수 누락·형식 오류는
예외 대신 상태를 반환합니다. 초기화 성공은 실제 프로젝트 연결 성공과 다릅니다.

## 개발 환경 연결 확인

`npm run dev` 실행 후 터미널에 표시된 현재 주소에서
`/api/developer/supabase`를 여세요. 예: 서버 포트가 3000이면
`http://localhost:3000/api/developer/supabase`입니다.

이 경로는 SDK 초기화 후 Supabase의 공개 Auth settings를 GET으로 확인합니다.
테이블 조회·생성, 로그인, 기존 사용자 데이터 전송 및 저장은 하지 않습니다.
설정 내용이나 키를 응답에 포함하지 않으며, 요청 제한 시간은 8초입니다.
서버에서의 접근 확인이므로 브라우저의 직접 연결/CORS나 데이터 권한까지
검증하지는 않습니다.

| 결과 | 의미 |
| --- | --- |
| 200, `ok: true` | SDK 초기화 및 Auth 설정 응답 확인 |
| 503, `missing-config` | URL 또는 공개 키 누락 |
| 503, `invalid-config` | HTTPS 루트 URL 또는 공개 키 형식 오류 |
| 503, `initialization-failed` | SDK 초기화 실패 |
| 502, `upstream-error` | Supabase HTTP 오류; `upstreamStatus` 확인 |
| 502, `unexpected-response` | 예상한 Auth 설정 응답이 아님 |
| 502, `connection-failed` | 네트워크·시간 초과·응답 처리 실패 |
| 404 | 개발 환경 이외에서는 사용 불가 |

## 검증과 다음 단계

```powershell
node --test scripts/*.test.mjs
npx tsc --noEmit
npm run lint
npm run build
```

자동 테스트의 Supabase 응답은 모의 응답이며 실제 프로젝트 접속을 증명하지
않습니다. 실연결은 위 개발 경로로 별도 확인합니다.
연결 확인 경로는 인증 UI와 독립적입니다. 테이블·데이터 이전은 구현하지 않습니다.
다음 단계에서는 기존 데이터 백업과 존재 확인을 먼저 마치고, 사용자 식별,
테이블 스키마, RLS 정책 및 사진 접근 정책을 설계한 뒤 별도 승인하에 적용합니다.

참고: https://supabase.com/docs/reference/javascript/initializing

## 2단계: 이메일/비밀번호 인증

앱 진입점은 `AuthBoundary`로 보호합니다. 로그인 상태를 복원하는 동안 기존
`RecordSessionBoundary`와 정원 페이지를 마운트하지 않습니다. 로그인 성공 후에도
현재는 계정 연결 완료 화면만 표시합니다. 기존 로컬 기록을 계정 기록으로 표시하거나
업로드하지 않으며, 계정 A/B 전환에도 이 원칙을 유지합니다. 운영 환경에서는
계정별 데이터 저장을 구현하기 전까지 기존 로컬 정원을 사용할 수 없습니다.

`auth-client.ts`는 브라우저에서만 생성하는 singleton입니다. Supabase SDK가
새 키 `little-garden.supabase-auth.v1` 및 해당 PKCE 보조 키에 인증 세션을 관리합니다.
기존 정원 키·사진 DB는 변경하지 않습니다. 비밀번호는 폼과 인증 요청에서만 사용하고
앱 저장소에 기록하지 않습니다. Supabase의 토큰 저장과 자동 갱신을 사용합니다.
로그아웃은 `scope: local`로 현재 브라우저 세션을 종료하고 같은 세션을 공유하는 탭에도
반영합니다. 다른 기기의 세션은 유지됩니다. 실패 시 성공으로 표시하지 않습니다.

계정 인증은 브라우저 UI의 경계이며 서버 권한 검증을 대체하지 않습니다.
향후 서버 데이터 API는 Supabase 서버 검증과 RLS로 별도로 보호해야 합니다.

### Supabase 대시보드 설정

1. Authentication의 Email provider에서 이메일/비밀번호 로그인을 활성화합니다.
2. 이메일 확인(Confirm email)을 활성화하는 것을 권장합니다. 활성화 시 가입 직후
   로그인되지 않고 인증 메일 안내가 표시됩니다. 비활성화 시 SDK 세션으로 로그인됩니다.
3. URL Configuration의 Site URL은 실제 운영 HTTPS 주소로 설정합니다.
4. Redirect URLs에 사용하는 정확한 Origin의 아래 주소를 등록합니다.
   - `http://localhost:3000/?auth=confirm`
   - `http://localhost:3000/?auth=recovery`
   - 운영 주소의 `/?auth=confirm`, `/?auth=recovery`
5. 다른 포트를 사용하면 해당 주소도 등록합니다. 127.0.0.1과 localhost는 구분됩니다.
6. 이메일 템플릿은 기본 `ConfirmationURL` 링크를 유지합니다. 자체 SiteURL 링크로
   바꾸면 전달한 redirectTo가 적용되지 않을 수 있습니다.
7. 운영용 이메일 발송은 Custom SMTP와 발신 도메인을 설정하고 발송 제한을 확인합니다.
   비밀번호 정책은 앱과 일치하도록 최소 8자 이상으로 설정하세요.

이번 작업에서 대시보드 설정은 변경하지 않았습니다. PKCE 방식이므로 가입/재설정
요청을 시작한 동일 브라우저·프로필에서 메일 링크를 열어야 합니다. 다른 기기에서
열었거나 링크가 만료되면 해당 브라우저에서 새 링크를 요청하세요. 재설정 링크는
새 비밀번호 입력 화면으로 연결되며 SDK의 `updateUser`로 변경합니다.

### 개발용 정원

개발 서버의 로그아웃 화면에서 '개발용 정원 테스트'를 열고 기존 개발용 PIN을
입력하면 보존된 테스트 정원에 들어갑니다. 기존 관리자 모드 전환과 추천 행동,
정원 기능은 이 환경에서 유지됩니다. PIN은 Supabase 비밀번호와 별개입니다.
이 진입은 기존 서버 `/api/developer/unlock` 검증을 사용하며 운영 빌드에서는
제공하지 않습니다. Supabase 로그인은 관리자 권한을 부여하지 않습니다.
테스트 종료는 문서를 다시 열어 메모리의 개발 모드 권한을 해제합니다.
실제 사용자 저장소를 조회하거나 이전하는 기능은 추가하지 않았습니다.

### 검증 범위와 수동 확인

`scripts/auth.test.mjs`는 모의 SDK로 가입·로그인·로그아웃·세션 복원·재설정,
잘못된 비밀번호, 중복 요청, 늦게 완료된 세션 조회, 계정 A/B 전환을 검증합니다.
실제 AuthBoundary 렌더 테스트로 비인가 상태에서 기존 자식 페이지를 렌더하지
않는 것도 확인합니다. 기존 정원 테스트는 모의 저장소로 실행됩니다.

실제 계정으로 다음 항목은 별도로 확인해야 합니다: 가입 인증 메일 수신 및 링크,
올바른 비밀번호와 잘못된 비밀번호 로그인, 새로고침/다른 탭의 세션 반영,
로그아웃, 재설정 이메일과 새 비밀번호 저장, 만료 링크, A/B 계정 전환,
모바일 실제 키보드 표시 중 입력창·버튼 접근. 실제 브라우저/이메일 검증을
자동 테스트 통과와 동일하게 취급하지 마세요.

### 다음 DB 설계 단계 (미구현)

- `auth.users.id`에 연결한 사용자 소유권, 모든 사용자 테이블의 RLS 정책
- 날짜별 돌아보기/추천 행동 완료 기록, 일기와 사진 메타데이터
- 비공개 Storage 버킷과 사용자별 경로·접근 정책
- 햇살 거래 원장, 구매 내역과 배치 데이터의 중복 방지·원자적 처리
- 기존 로컬 데이터의 백업, 소유자 확인과 명시적 이전 동의, 재시도 가능한 이전 절차
- 운영 관리자 권한은 서버에서 검증하는 별도 설계 (개발용 PIN과 분리)

공식 인증 흐름: https://supabase.com/docs/guides/auth/passwords
