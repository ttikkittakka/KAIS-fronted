# 3C 계정별 돌아보기 초안 — 비활성 구현

3C API/데이터 계약/메모리 상태 관리 구현. 운영 및 실제 계정 쓰기 미활성. UI/질문 문구/CSS/Rive/추천 코드/Compose/로컬 저장 코드는 수정하지 않았다. 기존 AccountGarden에는 새 쓰기 진입점을 연결하지 않았다. 서버의 PRODUCTION_WRITES_ENABLED=false는 환경변수나 HTTP 입력으로 변경할 수 없다. 현재 authenticated 요청은 Auth 검증 후 503 reflection-not-ready를 반환하며 DB 쿼리/RPC는 하지 않는다. 테스트의 factory enabled 주입은 오프라인 SDK transport에만 사용한다.

## API

| 경로 | 요청 | 승인 후 호출할 RPC | 결과 |
| --- | --- | --- | --- |
| POST /api/account/day/start | JSON {} | onestep_start_day(), 인자 없음 | project,userId,date |
| POST /api/account/reflection/draft | date, answers[4], revision | onestep_save_reflection_draft(p_date,p_answers,p_revision) | project,userId,date,revision,changed |
| GET /api/account/records | 기존 계약 유지 | 기존 3A 조회 경로 | 서버에 저장된 답변/단계/revision |

모든 쓰기 요청은 기존 authenticateAccount의 getUser 및 issuer/sub/role/expiry 검증을 거친다. RPC 클라이언트는 publishable key + 검증한 사용자 JWT를 유지하여 authenticated RPC의 auth.uid 소유권을 사용한다. 3C에는 DB 직접 연결/Secret/service_role/PAT가 필요하지 않다. 3D의 server-only 확정 역할과 혼동하지 않는다.

입력은 추가 필드(userId 등 포함) 거부, 질문별 값/배열 길이/날짜/revision/JSON 크기 검사. 서울 날짜는 서버에서 사전 확인하고 DB RPC 내부 검증이 최종 권위다. start 응답은 호출 전/후 서울 날짜 중 DB가 반환한 날짜를 인정한다. 자정 중 이미 처리된 요청을 새날로 재귀속하지 않는다.

오류: 무인증/만료/다른 프로젝트 401; 잘못된 입력400; content type415/크기413; 비활성 또는 PGRST202/42883(RPC 미설치)503 reflection-not-ready; revision40001/day22023/record missing P0002는409; 권한 문제403; 조회/결과 이상502; 네트워크503. DB 메시지/detail/token을 그대로 노출하지 않는다. Cache-Control private,no-store 및 Vary Authorization 유지.

## 질문 상태 계약

createAccountReflectionStore는 로그인 이벤트마다 setSession({userId,token}) 또는 setSession(null)을 받아야 한다. 향후 질문 화면 owner가 구독하고 unmount 때 dispose한다. 현재 화면에 mount하지 않았으므로 실제 브라우저 질문 진행 검증은 하지 않았다.

- load는 기존 records GET만 수행한다. 기록이 없으면 needs-start, 자동 쓰기 없음. 명시적 start만 하루 시작 POST 후 해당 날짜 GET을 수행한다.
- 서버에 저장된 첫 빈 답변의 질문 index로 복원. 4개 모두 있으면 draft-complete이며 추천/보상/단계 확정 요청이 없다. 이미 stage가 checkin이 아니면 committed(읽기 전용)이다.
- saveAnswer(index,value)는 현재 질문만 저장한다. 요청 중 중복 클릭은 무시, 성공한 acknowledgment 뒤에만 다음 질문으로 이동한다. 입력은 저장 중에도 메모리에 보유한다.
- 실패하면 답변/date/revision 유지. retry는 같은 payload/revision 사용. 저장 성공 응답이 유실된 경우 RPC의 changed=false 재시도 응답도 수용한다.
- 409는 conflict. 자동 retry/자동 병합하지 않는다. UI가 사용자에게 설명하고 입력 폐기를 명시적으로 확인한 뒤 load({discardPending:true})로 서버 상태를 채택한다. 일반 load는 pending 답변을 버리지 않는다.
- 새로고침/재로그인 후 복원 가능한 것은 **서버 저장이 끝난 답변**이다. 실패한 메모리 답변은 현재 화면에서는 유지하지만 프로세스 종료/새로고침 후에는 복원하지 않는다. 이를 위해 기존 로컬 저장소를 이용하지 않는다.
- A→B/로그아웃/dispose 즉시 메모리 제거, AbortController 취소, generation으로 늦은 응답 차단. 같은 사용자 토큰 갱신은 답변/요청 상태를 초기화하지 않는다. 취소는 이미 DB에 도착한 트랜잭션의 rollback을 보장하지 않으며 재로그인 때 서버 조회로 확인한다.
- start 중 자정이 지나 반환된 날짜가 새 GET의 today와 다르면 conflict, 전날 답변을 오늘 화면에 표시하지 않는다. save 응답 date는 원래 date와 같아야 한다. 나중에 도착한 전날 성공은 전날 저장이며 다음날 답변으로 자동 복사하지 않는다.
- 오프라인 임시 데이터베이스/인증 우회/로컬 사진 cleanup/보상/추천 계산 없음.

## 활성화 절차 — 별도 승인 필요

1. 기존 3B checklist를 따라 승인된 RPC 적용 및 소유권/ACL 확인. 최소한 start_day, records 조회, draft RPC 계약이 실제 사용자 JWT로 준비되어야 한다. 3D executor/LOGIN은 별도 서버-only 준비사항이다.
2. 승인된 staging에서 사용자 JWT 기준 A/B, 초안 보존, 자정/충돌, missing RPC 상태 확인. 이번 모의 테스트를 운영 검증으로 대체하지 않는다.
3. 기존 질문 컴포넌트의 문구/스타일을 유지하는 계정용 연결 adapter를 리뷰. auth event→setSession, 화면 cleanup→dispose, 409 명시적 재조회, start/retry 버튼, 네 답변 후 '초안 완료'까지만 연결한다. 로컬 page/record-store를 계정 경로에 mount하지 않는다.
4. 쓰기 활성화 승인 후 server release gate를 코드 리뷰로 변경하고 UI 진입을 함께 배포한다. 환경변수 추가만으로 조용히 켜지지 않는다. 이 단계 전 실제 계정에 RPC 호출하지 않는다.
5. rollback은 gate=false/새 진입점 제거, 기존 조회 유지. 저장된 초안이나 이전 기록을 삭제하지 않는다.

## 3D 이전 준비

실제 draft 복원/오류/계정 격리 검증, server-only executor/LOGIN 및 Pooler claims/TLS 검증, 기존 추천 알고리즘의 서버 입력/최근 기록 parity, 완료 답변 수정 금지/중복 보상 계약, 성장 sync_growth 부수효과 확인. 초안 완료를 돌아보기 확정으로 취급하지 않으며 3D API가 저장 성공을 반환하기 전 Rive 보상 확정 금지.

## 검증 기록

- 모의 3C 테스트 19개 포함 관련 회귀 225개 통과. 실제 SDK의 HTTP transport를 mock하고 fake JWT만 사용했다. Auth/PKCE/계정 정원/records/추천/로컬 기록/상점/성장/Rive 회귀 포함.
- 기존 DB migration·3B PGlite·native 경쟁 suite는 변경하지 않았고 재실행하지 않았다. 원격 probe도 실행하지 않았다.
- TypeScript, ESLint, production build 수행. ESLint의 기존 세 경고는 design-output/figma-plugin/build.js, scripts/sunshine.test.mjs, scripts/supabase-ab-prepare.mjs의 unused 변수이며 변경 범위 밖이다.
- 이번 작업에서 Supabase MCP/원격 Auth·start_day·draft RPC 호출 없음. 실제 DB 불변은 수행 작업의 범위로 확인하며 원격 데이터 전체를 비교한 것은 아니다.
- 실제 계정 브라우저 쓰기/질문 UI 통합 및 운영 RPC 실행은 미검증이며 의도적으로 비활성이다.

## 3D 추가 구현 — 운영 쓰기 잠금 유지

3C의 위 검증 기록은 당시 결과다. 이후 3D에서 추가한 구성:

- `src/lib/account-reflection/recommendation-server.ts`: 기존 `ensureCareHistory` → `recommendCares`를 그대로 호출. 서버 JWT 조회로 얻은 저장 답변과 직전 3일 추천 이력만 사용한다. 이력 조회 오류/다른 소유자/알 수 없는 카탈로그를 빈 이력으로 대체하지 않는다. 당일 확정된 추천은 재계산하지 않는다. 기존 알고리즘은 사용자 ID를 난수 seed로 사용하지 않으므로 A/B의 답변과 이력이 같으면 추천이 같을 수 있다. 데이터 격리와 추천 차별화는 별개다.
- `commit-model.ts`, `commit-server.ts`, `/api/account/reflection/commit/route.ts`: POST 입력은 `{date, revision}`만 허용. 답변/추천 ID/제목/보상/사용자 ID 추가 필드는 거절한다. Auth 검증 후 기본 503 `reflection-commit-not-ready`, DB 조회와 쓰기 모두 차단. 환경변수/클라이언트 플래그로 열리지 않는다.
- 공통 `account/auth.ts`는 검증된 토큰의 만료시각을 서버 내부에 제공한다. `account-records/server.ts`의 기존 JWT/RLS 조회를 `readAccountRecords`로 공통화했다. 요청별 client/owner 필터와 기존 오류 계약을 유지한다.
- 열린 경로는 저장 답변과 revision을 확인하고 추천 계산 후 서버 executor에 전달한다. v2 ACK만으로 성공하지 않는다. 다시 조회한 확정 기록·추천 3개·반환 revision 이상·돌아보기 원장 10을 확인하고 실제 sunshineBalance를 반환한다. 잔액에 10을 클라이언트에서 더하지 않는다. 조회가 실패하면 성공으로 표시하지 않는다.
- `commit-executor.ts`: 최소 권한 풀의 구조적 node-postgres 인터페이스를 받는 서버 전용 어댑터. 실제 pg 설치/풀 생성/자격증명 설정은 하지 않았다. 같은 연결에서 BEGIN → SET LOCAL ROLE/timeouts → 두 LOCAL claims GUC → 고정 v2 SQL/파라미터 → ACK 검증 → COMMIT. 풀 대기 중 토큰 만료를 검사한다. 예외 시 ROLLBACK을 기다리며 COMMIT 결과 불명확/ROLLBACK 실패 연결은 폐기한다. 이름 있는 prepared statement 및 session claims를 사용하지 않는다. 원본 JWT를 SQL로 전달하지 않는다.
- `commit-store.ts`: 별도 계정 메모리 상태. `load()`로 서버 초안을 읽은 뒤 명시적 `commit()`만 가능하다. 실패/응답 유실/409 뒤에는 `recover()`로 원래 날짜를 읽어야 한다. 복구가 미확정 최신 초안을 반환해도 자동 재제출하지 않는다. 자정 후 전날 미확정 기록은 conflict, 확정 기록은 처리된 날짜의 committed 상태로 복원한다. 로그아웃/사용자 변경은 즉시 비우고 요청 취소/늦은 응답 무시, 동일 사용자 토큰 갱신은 상태 유지. 서버 전용 모듈은 Next의 `server-only` 경계로 표시한다.

### UI 연결 계약과 응답 유실

계정 화면에 아직 마운트하지 않았다. 3C 네 답변 저장 완료 → commit store.load → 사용자의 확정 요청 → committing → 서버 저장·원장 확인 후 committed 순서로 연결한다. 복구/새로고침에서 보이는 기존 원장은 새 보상 지급 이벤트가 아니다. Rive 보상 재생/알림의 일회성 소비는 향후 UI 연결 단계에서 구현해야 한다. 실제 계정 UI·Rive 상태 머신·로컬 개발 경로는 변경하지 않았다.

`recover()`는 원래 날짜와 계정을 유지한다. 네트워크 오류에서 POST를 자동 재시도하지 않는다. 취소된 HTTP가 DB rollback을 보장하지 않으므로 재진입 시 서버를 읽는다. 409는 사용자에게 최신 답변을 확인시킨 뒤 재확정하도록 연결한다. 자정 직전 시작한 DB 트랜잭션은 기존 3B의 트랜잭션 시작 서울 날짜 정책을 따른다. 응답의 day.date와 day.today를 구분하고, 전날 성공을 오늘 보상으로 표현하지 않는다.

### 중복 방지와 성장 부수 효과

동일 날짜의 이미 확정된 기록은 기존 추천/원장을 반환한다. 경쟁 요청은 v2의 사용자 advisory transaction lock, 행 lock, revision 검사, 완료 답변 동일 재시도 no-op에 의존한다. 원장의 사용자·날짜·이벤트 유일성과 삽입 성공 시에만 잔액 갱신하는 기존 award 계약을 유지한다. 앱 메모리 잠금만으로 중복 지급을 보장한다고 간주하지 않는다.

저장소의 기존 함수 본문을 확인했다. v2 → v1 commit_reflection → award(reflection) 및 sync_growth 호출이 있다. sync_growth는 활동일 수 갱신, 50/100일 growth_grants 및 해당 인벤토리 아이템을 멱등 삽입한다. 성장 동기화 자체가 추가 햇살을 지급하는 것은 아니다. 따라서 운영 활성화는 이 부수 효과도 승인 범위에 포함해야 하며, 확정 후 정원/인벤토리 캐시를 재조회하도록 UI를 연결해야 한다. 이번에 운영 함수 본문을 다시 조회하거나 변경하지 않았다.

### 운영 활성화 및 3E 이전 완료 기준

1. 3B SQL/권한 SQL의 별도 운영 승인과 적용, v1 직접 호출 회수 및 v2 최소 권한 실행 확인. 기존 실행 차단문/ROLLBACK은 이번에 수정하지 않았다.
2. 별도 승인된 서버 전용 LOGIN, TLS 인증서/호스트 검증, bounded pool connection wait/작은 pool 크기/전체 요청 deadline을 갖춘 실제 pg 풀 연결. 원본 JWT/DSN/답변 로그 금지, 브라우저 Secret/PAT 사용 금지. 어댑터만으로 실제 Supavisor 호환성을 검증했다고 간주하지 않는다.
3. 실제 Pooler의 A/B claims 격리, rollback/connection 폐기, 자정, 미설치 RPC, 응답 유실을 staging에서 검증. 기존 3B PostgreSQL 동시성 테스트는 반복하지 않았으며 새 어댑터 검증은 모의 SQL 연결 테스트다.
4. 3C/3D 코드 잠금 변경 및 실제 executor 주입을 별도 검토. 플래그만 바꿔서는 executor가 없어 계속 503이다. 사용자 테스트 계정 쓰기 검증은 별도 승인 필요.
5. 기존 질문/추천 UI에 메모리 상태와 Auth 이벤트를 연결하고, 서버 성공 전 완료/보상 애니메이션 금지 및 복구 시 중복 재생 방지 검증.
6. 3E는 activity_v2의 단계 전이, 참여 5/첫 돌봄 10, 일일 25 상한, 완료 돌봄 재시도, 정원/기록 캐시 갱신을 구현한다. 사진 Storage·상점·배치 등 후속 범위와 혼합하지 않는다.

### 3D 검증 범위

`scripts/account-commit.test.mjs`는 400 답변 조합 × 이력 2종의 기존 함수 일치, API 인증/입력 거절/잠금, A/B/동시 재시도/원장 중복 방지 모델, 응답 유실·revision 경쟁·자정, SQL 트랜잭션/LOCAL claims/rollback/폐기, 메모리 복구/계정 전환/로컬 저장소 접근 차단을 검증한다. 실제 SDK의 Auth HTTP는 가짜 토큰과 모의 transport만 사용한다. 실제 DB 경쟁 검증이나 실제 사용자 쓰기 검증으로 보고하지 않는다. 원격 Supabase 호출/마이그레이션/자격증명 발급은 수행하지 않았다.

최종 로컬 결과: 신규 3D 19개 포함 관련 회귀 244개 통과, TypeScript 통과, ESLint 오류 0/기존 경고 3, Next 프로덕션 빌드 통과. `server-only` 표시는 Node 테스트 로더에서만 명시적으로 대체하며 실제 Next 빌드는 원래 서버/클라이언트 모듈 경계를 검사한다. 실제 pg 드라이버·Supavisor 연결·운영 v2·계정 브라우저 쓰기는 미검증/미활성이다.

## 3E 추가 구현 — 활동 API와 일회성 성공 이벤트

추가 파일: `src/lib/account-activity/{model,server,executor,store}.ts`, `src/app/api/account/activity/route.ts`, `scripts/account-activity.test.mjs`.
수정 파일: 기존 `account-reflection/commit-executor.ts`의 트랜잭션 정리를 두 v2 RPC가 공유하도록 추출, 이 문서. 기존 UI/React 페이지/Rive/Android/SQL은 수정하지 않았다.

### API와 실행 계약

`POST /api/account/activity`는 매 요청 Auth 검증 후 기본 503 `activity-not-ready`를 반환한다. 코드 잠금과 executor 미연결 상태로 DB 읽기·쓰기 모두 차단된다. 활성화 옵션은 모의 테스트의 의존성 주입에만 사용하며 HTTP/환경변수로 열 수 없다.

입력은 `{date, revision, action, careId?}`. action은 photo_done/growth_done/care_done, careId는 care_done에서만 필수. 사용자 ID·보상액·완료시각·이벤트 키·사진 메타데이터 등 추가 필드는 거절한다. JWT/RLS 조회로 실제 추천된 care ID인지 확인한다.

| 요청 | 허용 단계 | 저장 결과 | 보상 |
|---|---|---|---|
| photo_done | photo | growth | 없음 |
| growth_done | growth | care | participation 5, 한 번 |
| care_done | care + 추천된 ID | 해당 completed_at, aggregate revision 증가 | 첫 완료 firstCare 10, 이후 없음 |

photo_done은 기존 '사진 없이 이어가기'와 동일하게 단계만 전진한다. 업로드/삭제/사진 정리/기록 글 저장을 호출하지 않는다. growth_done은 선택 사진·글이 없어도 기존 규칙대로 참여로 인정한다. 이미 완료한 단계/돌봄은 v2와 동일하게 stale revision이어도 no-op이고 이벤트는 null이다. 아직 완료되지 않은 활동은 revision 일치가 필요하다. 돌아보기 10 + 참여 5 + 첫 돌봄 10 = 일일 25이며, 잔액은 누적 보유액이므로 25로 제한하지 않는다.

executor는 기존 3D의 BEGIN/LOCAL ROLE/두 LOCAL claims/timeout/COMMIT/ROLLBACK/연결 폐기 흐름을 공유하며 고정 SQL `onestep_commit_activity_v2(date,text,text,bigint)`만 사용한다. photo/growth의 p_care는 NULL. 사용자 ID는 Auth가 검증한 GUC에만 전달한다. 새 pg 풀·네트워크·자격증명은 생성하지 않았다. 실제 v2의 사용자 transaction lock/revision/원장 유일성 계약이 최종 중복 방지 경계다.

저장 ACK 이후 JWT/RLS로 기록·추천 완료시각·원장·잔액을 다시 읽는다. 단계와 참여 원장, 완료 돌봄과 firstCare 원장의 일관성을 검증한다. ACK만으로 UI 성공이나 잔액 +5/+10을 생성하지 않는다. 응답 유실/읽기 실패는 `activity-uncertain-reload`, 충돌은 409로 원래 날짜를 다시 읽게 한다.

### 메모리 상태와 Rive 연결 계약

store의 `load → ready → submit → saving → ready/recover` 흐름만 추가했으며 실제 계정 화면에 마운트하지 않았다. loading/recover에서는 성공 이벤트를 만들지 않는다. `recover()`는 원래 날짜를 GET하고 자동 POST하지 않는다. 자정 후 전날 기록은 복원하되 새 쓰기는 막는다. 계정 변경/로그아웃은 day/effects/seen IDs를 비우고 요청을 취소한다. 같은 사용자 토큰 갱신은 진행 상태를 유지한다.

서버의 `effect`는 `{id, action, careId, reward, celebrate, thirdCompletion}`. changed=true이고 정확한 저장 revision의 후속 상태를 읽었을 때만 생성한다. 다른 요청이 먼저 진행해 더 높은 revision이 보이면 보상/세 번째 완료의 잘못된 귀속을 막기 위해 effect=null로 억제한다. 영속 완료 상태·잔액은 여전히 최신 서버 결과로 표시한다. 이후 GET/중복 no-op/응답 유실 복구는 effect를 재생성하지 않는다.

UI 연결 시 `takeEffect()`를 한 번 소비하고 careId를 기존 completedCare에, celebrate를 기존 RivePlant prop에 전달한다. thirdCompletion은 세 번째 완료 문구/완료 장면 구분용이다. 기존 구현은 모든 돌봄에 같은 `celebrate → 통통` 애니메이션을 사용한다. 새로운 돌봄별 Rive input이나 별도 세 번째 애니메이션을 발명하지 않았다. 이미 완료된 목록을 복원할 때는 completedCare를 설정하지 않는다. reward > 0일 때만 일회성 햇살 알림을 표시하고, 잔액은 day.sunshineBalance를 쓴다. 실패/복구 때 과거 보상 알림을 재생하지 않는다.

### 3E 검증과 3F 이전 조건

신규 테스트는 단계 순서/추천 ID/입력 조작/인증/비활성 잠금, 10+5+10, 같은 돌봄 동시 재시도와 다른 돌봄 revision 경쟁, 원장 누락, 응답 유실/자정, 트랜잭션 SQL/claims/rollback, 서버 성공 전 이벤트 없음, 재조회 무재생, A/B 지연 응답, 토큰 갱신, 로컬 저장소 접근 차단을 검증한다. 동시성은 기존 v2 계약을 모델링한 모의 실행이며 새 PostgreSQL/실제 Supavisor 검증이 아니다. 기존 3B 독립 연결 검증은 반복하지 않았다.

3F 전에 기록 글/사진 설명 저장의 별도 입력 제한과 revision 충돌 복구, 기존 텍스트 보존/명시적 비우기 구분, 날짜별 조회와 계정 변경 보호를 확정한다. 실제 계정 UI 연결은 3B 운영 승인·최소 권한 풀/TLS 검증·3C~3E 활성화 승인 후 수행한다. Rive 실제 브라우저 이벤트 연결, 실제 RPC 보상/실패복구, 정원/인벤토리 캐시 갱신은 아직 미검증이다. 사진 Storage는 별도 단계이며 여기서 사진 삭제/자동 이전을 활성화하지 않는다.

3E 최종 결과: 신규 18개 포함 관련 회귀 262개 통과, TypeScript 통과, ESLint 오류 0/기존 경고 3, 프로덕션 빌드 통과(`/api/account/activity` 동적 경로 포함). Supabase MCP/원격 Auth·RPC/실제 SQL 연결을 호출하지 않았다. 실제 데이터 불변은 이번 작업의 실행 범위에 근거하며 원격 데이터 전체 비교 검증을 수행했다는 의미가 아니다.

## 3F 추가 구현 — 한마디·사진 코멘트의 원자적 저장

추가 파일: `src/lib/account-writing/{text,model,server,store}.ts`, `src/app/api/account/writing/route.ts`, `scripts/account-writing.test.mjs`.
수정 파일: `account-records/model.ts`의 글 길이 검증을 같은 text schema로 공통화, 이 문서. 기존 UI/로컬 저장/Rive/Android/SQL은 수정하지 않았다.

### API·권한·날짜 계약

PUT `/api/account/writing`는 매 요청 Supabase Auth 검증 후 기본 503 `writing-not-ready`. 코드 잠금이 닫혀 있으면 DB 조회/RPC 모두 호출하지 않는다. 운영 UI에 연결하지 않았으며 HTTP/환경변수로 켤 수 없다. 서버 비밀키나 별도 DB 역할 없이 요청별 사용자 JWT client로 기존 `onestep_save_writing(p_date,p_note,p_comment,p_revision)`를 호출하도록 구현했다.

입력 `{date, revision, note?, comment?}`는 엄격한 객체이며 note/comment 중 하나 이상 필수. NULL, 사용자 ID, 기타 필드는 거절한다. 생략된 필드는 해당 revision의 최신 서버 값으로 채우고, 두 필드를 같은 p_revision으로 함께 저장한다. 빈 문자열은 명시적 글 삭제이고 공백/개행은 그대로 보존한다. 오래된 revision은 덮어쓰지 않고 HTTP 409. 동일 revision/동일 내용은 RPC를 생략한다. 오래된 revision의 중복 요청은 409 후 동일 텍스트 재조회로 복구한다.

글 길이는 PostgreSQL char_length와 같은 Unicode code point 기준 note 300/comment 100. 이모지 단일 코드 포인트는 한 글자, 결합 문자/ZWJ 시퀀스는 여러 글자로 센다. UTF-16 길이로 잘라내거나 Unicode 정규화하지 않는다. PostgreSQL text에 저장할 수 없는 NUL/짝 없는 surrogate는 거절한다. 기존 HTML 입력 UI의 maxlength는 이번에 바꾸지 않았다. 향후 UI 연결 때 같은 카운터/검증을 사용하되 기존 디자인을 유지한다.

날짜는 서버 서울 날짜와 기존 GET records 정책인 오늘~과거 365일을 사용한다. 자정이 지나도 선택한 전날 글을 오늘 기록으로 옮기지 않는다. SQL 자체는 오늘만 허용하거나 365일 범위를 강제하지 않으므로 API 범위 제한이 직접 RPC 호출까지 적용되는 DB 정책이라고 간주하지 않는다.

저장소의 기존 003 SQL과 3B 검토 문서를 확인했다. save_writing은 SECURITY DEFINER/search_path='', require_user → auth.uid(), authenticated EXECUTE이며 PUBLIC/anon/service_role 직접 EXECUTE는 회수하는 정의다. 두 필드를 `user_id=u AND record_date=p_date AND revision=p_revision` 조건으로 원자적으로 갱신하고 revision+1을 반환한다. 미일치/없는 기록은 40001. ensure_garden의 기존 사용자 advisory transaction lock을 먼저 사용해 3B와 잠금 순서가 같다. 조회는 사용자 JWT/RLS를 유지하나 SECURITY DEFINER 함수 내부의 소유권 경계는 auth.uid 필터이며 일반 호출자 RLS에만 의존하는 것은 아니다. 운영의 현재 함수/ACL은 이번에 다시 조회하지 않았으므로 배포 전 read-only 재확인이 필요하다.

기존 ensure_garden은 누락된 프로필/정원/기본 아이템/기본 배치를 on conflict do nothing으로 보충할 수 있다. 원래 RPC의 이 부수 효과를 제거하거나 새 보상 로직을 추가하지 않았다. 일반 글 변경은 note/photo_comment/revision/updated_at만 변경하고 award/sync_growth를 호출하지 않는다. API는 존재하는 기록만 저장하며 초기화를 별도로 호출하지 않는다.

### 메모리·순차 저장·충돌 복구

`selectDate`로 서버 글을 조회한 뒤 `edit({note? ,comment?})`가 비동기 순차 저장을 예약한다. 같은 tick의 편집은 합치고, 저장 중 새 입력은 다음 요청의 최신 두 필드로 병합한다. 각 PUT은 이전 성공 revision을 사용한다. 저장 응답 전 입력을 성공 상태로 확정하지 않는다. 동일 사용자 토큰 갱신은 상태를 유지하며 다음 요청에 최신 토큰을 사용한다.

저장 실패는 saved와 draft를 분리해 입력을 보존한다. `recover()`는 읽기만 수행하고 `retry()`는 먼저 읽은 뒤 안전한 경우만 저장한다. 서버의 두 필드가 전송했던 내용과 같고 revision이 증가했다면 응답 유실 성공으로 복구한다. 전송 이후 입력한 새 글은 그대로 유지해 다음 revision으로 보낸다. 서버가 원래 revision/내용 그대로이면 재시도가 가능하다. 다른 기기 또는 활동 저장으로 revision/내용이 달라지면 conflict로 멈추고 remote와 draft를 함께 제공한다.

충돌 해결은 사용자 선택이 필수다. `resolveConflict({})`는 서버 내용을 채택한다. `resolveConflict({note: 사용자선택값})`는 서버 코멘트를 보존하는 명시적 병합이다. 이후 `flush()`를 호출해야 저장되며, 그 사이 다른 기기가 수정했다면 다시 409로 멈춘다. 자동 마지막 쓰기 우선/자동 덮어쓰기는 없다.

계정 변경·로그아웃은 메모리와 요청을 초기화하고, 계정/날짜 epoch로 늦은 응답을 무시한다. 날짜 변경에 미저장 글/진행 요청이 있으면 기본 거절하며, UI의 명시적인 폐기 선택 후 `selectDate(date,{discardPending:true})`로만 이동한다. 요청 취소가 이미 수행된 서버 저장의 취소를 보장하지 않으므로 재진입하면 다시 읽는다. 새로고침·재로그인은 저장된 글만 복원하며 실패한 메모리 초안은 영구 보관하지 않는다. 사진 업로드/삭제/정리 및 localStorage/IndexedDB 접근은 없다.

### 활성화 전 남은 사항

실제 RPC 권한·함수 정의와 RLS를 읽기 전용으로 재확인하고, 별도 승인한 테스트 계정에서 JWT 소유권·글 경계값·동시 수정·응답 유실 복구를 검증해야 한다. 3F는 기존 authenticated RPC를 쓰므로 새로운 비밀키/최소 권한 LOGIN이 필요하지 않지만 3C~3E 전체 사용자 흐름 활성화는 기존 3B 적용 및 관련 승인과 함께 진행한다. 계정 UI에 날짜 전환 폐기 확인/충돌 비교·선택/재시도 상태를 연결하는 작업과 실제 브라우저 검증이 남았다. 3B 마이그레이션·SQL 차단문·ROLLBACK·정책은 이번에 변경하지 않았다.

3F 최종 검증: 신규 21개 포함 관련 회귀 283개 통과, TypeScript 및 프로덕션 빌드 통과, ESLint 전체 오류 0/기존 경고 3 및 변경 파일 검사 경고 0. 경계값/빈 문자열 삭제/필드 보존/동시 revision/순차 입력/응답 유실/늦은 응답/토큰/자정/로컬 저장소 차단은 모의 테스트다. Supabase MCP/원격 Auth·RPC/운영 SQL은 호출하지 않았고 실제 데이터 비교나 실사용자 쓰기 검증은 수행하지 않았다. 기존 독립 PostgreSQL 검증은 불필요하게 반복하지 않았다.
