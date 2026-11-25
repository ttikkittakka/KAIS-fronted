# Supabase 연결

현재 앱은 Next.js App Router를 사용합니다. `src/lib/supabase/client.ts`의
`getSupabaseClient()`는 필요할 때 클라이언트를 초기화하고 재사용합니다.
기존 기록·정원 저장 로직에서는 이 모듈을 호출하지 않습니다.
연결 확인용 클라이언트의 세션 저장, 토큰 자동 갱신, URL 기반 로그인 감지는
모두 꺼져 있습니다. 별도의 `auth-client.ts`에서만 Supabase Auth 세션을 관리합니다.

## 환경변수

프로젝트 루트의 `.env.local`에 다음 두 항목을 추가하세요. 기존 파일이나
관리자 비밀번호 설정은 덮어쓰지 마세요. `.env.example`에 대상 프로젝트 URL이 있습니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://yhzgucbiwvizjxpzwpqg.supabase.co
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
`RecordSessionBoundary`와 정원 페이지를 마운트하지 않습니다. 로그인 후에는
브라우저에서 해당 계정의 정원을 엽니다. 로그인 전 기기 기록과 기존 프로젝트 계정의
기록은 각각 원래 저장 위치에 남습니다.

`auth-client.ts`는 브라우저에서만 생성하는 singleton입니다. Supabase SDK가
Supabase SDK의 프로젝트별 저장소 키와 해당 PKCE 보조 키에 인증 세션을 관리합니다.
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
## Vercel 배포

1. Vercel의 **Add New → Project**에서 GitHub 저장소 `ttikkittakka/KAIS-fronted`를 Import합니다. Root Directory는 **저장소 루트**(`.`)를 선택합니다. 루트 `vercel.json`의 Services에서 Next.js `app`과 Hono `backend`를 빌드합니다.
2. **Settings → Environments → Production → Branch Tracking**에서 `onestepui`를 선택합니다. 이 브랜치에는 통합 일기, 나무 캐릭터와 전시 판넬이 있습니다.
3. Vercel **Settings → Environment Variables**의 **Production**에 같은 Supabase 프로젝트의 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 등록하고 다시 배포합니다. 미리보기에서 로그인하려면 **Preview**에도 설정합니다. Next.js 빌드 시 두 값이 브라우저 코드에 들어가야 회원가입 폼이 열립니다. Supabase Auth의 Site URL과 이메일 인증·재설정 허용 주소에 실제 배포 HTTPS 도메인을 등록합니다.
4. 휴대폰 브라우저에서 `https://<배포 주소>/demo`를 열어 체험합니다. `/install`에서 웹앱을 바로 열거나 홈 화면에 추가할 수 있습니다.

2026-11-23에 프로젝트 `yhzgucbiwvizjxpzwpqg`의 기존 정원 스키마를 확인한 뒤, 미적용 카탈로그·지원 신청·옷장·보호자 마이그레이션 네 개를 적용했습니다. 초기 정원 스키마는 이미 설치되어 있습니다. 마이그레이션 이력이 없는 초기 SQL을 적용할 때는 기존 스키마와 이력을 먼저 대조하세요.

`app`이 `/` 아래 공개 경로를 담당합니다. `/api/v1/health`, `/api/v1/explain`, `/api/v1/benefits`는 Next.js Route Handler에서 Hono로 전달됩니다. Vercel이 호출 서비스에 `GARDEN_BACKEND_URL`을 자동 주입합니다. Vercel 환경 변수에는 Supabase 등 실제 제공자 설정을 넣으세요. 로컬에서 두 서비스를 함께 확인하려면 저장소 루트에서 `vercel dev --local`을 실행합니다.

기존 계정 서버 설정(`ONESTEP_DB_HOST`)이 있는 배포는 서버 저장 화면을 엽니다. Supabase Auth 설정으로 시작하는 배포는 로그인 후 계정별 기기 저장을 사용하는 나무 정원을 엽니다.

[Vercel Services](https://vercel.com/kb/guide/vercel-services) · [Supabase URL 설정](https://supabase.com/docs/guides/auth/redirect-urls)

## 일기ㆍ보호자ㆍ설치 문자 연결

Vercel에 배포할 때 `.env.example`의 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 설정하고, Supabase Auth의 Site URL과 Redirect URLs에 배포한 HTTPS 오리진을 등록합니다. Hono의 정부24 조회를 활성화하려면 서버 환경 변수 `GOV24_SERVICE_KEY`를 설정합니다. 미션과 안부 제안은 Next.js의 `/api/wellbeing`이 처리합니다.

1. 기존 마이그레이션 이후 `202611200001_guardian_and_install.sql`을 적용합니다. 보호자 링크는 7일 동안 유효하며 로그인한 사용자가 갱신하거나 중단할 수 있습니다. 링크에는 14일의 상태 선택값만 들어갑니다. 서비스 역할로 `onestep_housekeeping()`을 매일 실행하도록 배포 환경에서 예약합니다.
2. AI 후보 조정에는 선택적으로 서버의 `ANTHROPIC_API_KEY`와 `ANTHROPIC_MODEL`을 설정합니다. 로그인한 사용자가 설정에서 동의했을 때만 모델에 답변 범주와 미션 후보 또는 연락 횟수를 보냅니다. 서비스 키가 없거나 응답이 늦으면 정해진 기준으로 고릅니다.
3. 설치 문자를 켜려면 `GARDEN_PUBLIC_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, 32자 이상의 임의 `INSTALL_SMS_PEPPER`를 서버에 설정합니다. Twilio 발신 서비스는 운영할 국가의 발송 요건을 충족해야 합니다. 가입자가 선택 동의 후 같은 브라우저에서 이메일 인증을 완료하면 처음 입력한 번호에 배포 도메인의 `/install` 링크를 한 번 요청합니다.
4. 프로덕션에는 예시 데이터와 실사용자를 분리합니다. 스테이징에서 실제 가입, SMS 수신, 보호자 링크 교차 기기 열람, 철회 후 접근 차단을 확인한 뒤 운영 환경에 연결합니다.

사진 미션의 AI 확인을 사용하려면 서버 환경 변수 `OPENAI_API_KEY`를 설정합니다. 로그인한 사용자가 확인할 사진마다 동의하면 크기를 줄인 JPEG를 Responses API로 전송하고 앱에는 판별 결과만 남깁니다. 약 포장 글자는 브라우저에서 읽습니다. 기기 판별과 직접 기록은 AI 환경 변수 없이도 이용할 수 있습니다.

## 계정 설문과 복약 관리

마이그레이션 `202611250001_personal_garden.sql`은 계정의 설문, 복약 목록과 알림 시간, 화분 이름 테이블을 만듭니다. 로그인한 사용자만 자기 행을 읽고 쓸 수 있습니다. 최초 로그인 후 설문을 한 번 저장하고, 설정에서 수정할 수 있습니다.

식약처 검색에는 공공데이터포털 e약은요 서비스 키를 Vercel 서버 환경 변수 `MFDS_EDRUG_SERVICE_KEY`로 설정합니다. 공개 일반의약품 정보의 제품 사진, 효능과 제공 복용법을 보여줍니다. 실제 내 복용 시간대와 안내는 사용자가 약봉투를 보고 등록합니다. 검색 키가 준비되기 전에도 약 이름과 시간대를 직접 등록할 수 있습니다. [공공데이터포털 e약은요](https://www.data.go.kr/data/15075057/openapi.do)

웹앱이 열려 있는 동안 현재 기기 시각으로 시간대별 알림을 확인합니다. 닫힌 동안에는 내보낸 `.ics` 파일을 휴대폰 캘린더에 가져와 반복 알림을 받을 수 있습니다. 가져온 일정의 변경과 삭제는 캘린더에서 관리합니다.

키와 실제 번호는 저장소에 추가하지 않습니다. 주소록과 개별 연락 기록은 기기에 남고, 실계정 공유에는 사용자가 동의한 상태 선택값만 전송됩니다.

[Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) · [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource)
