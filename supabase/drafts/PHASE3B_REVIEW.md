# Phase 3A implementation and phase 3B review draft

최종 배포 연결 설계: [PHASE3B_SERVER_CONNECTION.md](PHASE3B_SERVER_CONNECTION.md). 운영 호스팅 미정, Edge Functions 목록 접근 권한 제한으로 외부 호출 의존성 미검증, 실제 shared pooler LOGIN/claims 확인 전 운영 승인 보류. 역할 skeleton은 `phase3b-login.sql`을 참조하며 비밀번호/키를 포함하지 않는다. 아래 문서의 과거 상태와 다른 경우 이 최종 설계의 배포 순서와 남은 게이트가 우선한다.

후속 검증 업데이트: [PHASE3B_DEPLOYMENT_GATES.md](PHASE3B_DEPLOYMENT_GATES.md)에 Windows native PostgreSQL 17.12의 독립 연결 경쟁 검증 통과와 v1 권한 차단 실험을 기록했다. 아래의 "다중 연결 미검증"은 이전 검토 시점 기록이며 후속 문서의 구체적인 통과/미검증 범위를 우선한다. 실제 자정 횡단 RPC 및 운영 pool/LOGIN 검증은 여전히 남아 있다. 운영 적용은 계속 미승인이다.

Status: 3A read-only code implemented. `phase3b.sql` is deliberately non-executable (exception guard, final ROLLBACK), outside `migrations/`. No draft SQL has been applied to Supabase. The safety review below executes an in-memory-only copy in isolated PGlite. Do not remove the guard until the approvals and staging tests below are complete.

## 3A contract

`GET /api/account/records?date=YYYY-MM-DD`; omitted date means the Next.js server's current Asia/Seoul date. Exactly one day per request; today and the preceding 365 calendar days inclusive. Duplicate/unknown parameters, impossible dates, future dates and older dates return 400. No user ID input. The 365-day bound is an explicit API policy, not data deletion; changing the history window requires a deliberate product/API change.

Every valid request verifies the bearer token using Supabase Auth `getUser`, then checks issuer, subject, authenticated role and expiration. Each request creates a publishable-key client carrying the same user JWT. All table queries also filter the verified subject, preserving RLS. No privileged credential or cookie fallback. Responses are private/no-store and vary by Authorization.

Response: project, userId, today, date, current `sunshineBalance`, nullable `record`, ordered `cares` (ID + catalog version + position + completed_at), day reward ledger `rewards`. Balance is the current garden balance, NOT a historical date closing balance. Recommendations are the stored IDs/order/title, never recalculated. Titles for individual cares remain catalog-version-resolved by a future presentation adapter. Photos/blob IDs are deliberately excluded from 3A's record projection. A missing day is `record:null` with empty cares/rewards; missing garden is 409; database/validation errors are 502; network/configuration errors 503; Auth rejection 401. Failures never become empty success or zero balance.

Ownership, real dates, question-specific answer values, integer bounds, revision, care positions/duplicates, completion stage, reward reasons/amounts/event keys and cross-row consistency are validated. Reward sum can be at most 25 by three unique exact amounts. This does not prove the complete historical balance from a one-day ledger.

Four REST reads are NOT an atomic database snapshot. Concurrent v1 writes can produce a 502 inconsistency, or a structurally valid mixed-time snapshot. 3A exposes no writes; do not describe this as transactional consistency. After 3B approval, `onestep_get_day` replaces these reads with a single-statement snapshot and DB-derived Seoul date. No automatic RPC fallback or initialization occurs in records reads.

The memory store is intentionally not connected to the existing read-only garden UI. Future integration must call `setSession` for every Auth event and `dispose` on unmount. Identity changes clear data synchronously and cancel/invalidate pending responses; same-user token refresh only replaces the token. Each load clears the prior day and ignores superseded responses. There is no persistent cache, localStorage, IndexedDB, photo cleanup or migration. UI, Rive, recommendation code and local development garden are unchanged.

## Actual database evidence (read-only MCP, target yhzgucbiwvizjxpzwpqg)

Inspected current column metadata and actual `pg_get_functiondef`/ACL, not merely migration files:

| Existing function | Current behavior / consequence |
| --- | --- |
| `onestep_start_day()` -> date | authenticated; ensure garden then insert today's record on conflict do nothing. Do not call from 3A. |
| `onestep_save_writing(date,text,text,bigint)` -> bigint | authenticated; user ownership, note <=300/comment <=100, expected revision update; 40001 on conflict. |
| `onestep_commit_reflection(uuid,text[],text[],text)` -> void | service_role only; complete answers, 3 distinct active v2 cares, nonblank title; upsert can overwrite completed answers and bump revision, existing care set retained; awards reflection and synchronizes growth. |
| `onestep_commit_activity(uuid,text,text)` -> void | service_role only; photo->growth; growth->care awards participation but repeated growth_done bumps revision; care_done is timestamp-idempotent and awards firstCare but does not bump record revision. |
| private `ensure_garden(uuid)` | user advisory transaction lock `hashtextextended(user::text,0)` BEFORE inserts. Reentrant inside nested calls. |
| private `today(uuid)` | `(now() at time zone profile.timezone)::date`; transaction-start time. |
| private `award` | unique day/reason event; balance increment only on new ledger insertion; 10 reflection +5 participation +10 firstCare. |

Relevant functions are postgres-owned, SECURITY DEFINER, empty search_path; private helpers have no authenticated/service EXECUTE. Three inspected record tables match the draft's fields. Existing 13 tables and RLS are retained, not recreated.

## Why wrapping alone is insufficient

Nested PL/pgSQL calls are in the caller's transaction; existing bodies contain no independent commit. An unhandled downstream exception rolls back all updates and rewards. This supplies atomicity, not semantic safety: v1 can refinalize answers, lacks expected revision input, uses its own current day and has inconsistent activity revision increments.

Wrappers first take EXACTLY the existing advisory lock, validate SQL-side date, then select the record FOR UPDATE, check completed/no-op state and expected revision, and only then call v1. Never lock a record before acquiring the advisory lock. `onestep_save_writing` and other existing writers take ensure_garden's advisory lock first, so the order remains compatible. Changing v1 or introducing any writer that skips this lock requires a new audit.

No-op retries bypass stale revision only when the requested state is already satisfied. Completed reflection with identical answers returns unchanged and preserves the first recommendation set; different answers raise 40001. Draft retries with identical answers do not increment revision. Activity retries do not bump revision or award again; a first care completion explicitly increments the record revision that v1 omits. This is state-based idempotence, not a durable request-ID ledger: a delayed superseded draft will conflict and must not be silently replayed.

Draft saving updates only answers, revision and updated_at on a pre-existing checkin record. It does not initialize a garden/day, award sunshine, count activity, set plant state, persist recommendations, or touch growth. `start_day` is a separate future authorized command. Completion still intentionally invokes existing growth synchronization; its inventory/grant effects require staging regression coverage before enabling completion.

Date checks use transaction-start `now()` and require both literal Asia/Seoul and existing profile-based today to agree. A request accepted before midnight may finish for the previous day, including after waiting for a lock. A transaction started after midnight with the old date is rejected, including retries. This preserves v1 compatibility. If wall-clock-at-lock-time semantics are required instead, these wrappers are insufficient: the private today/award chain must be redesigned under separate approval. Client must refetch on day-change and never relabel an old pending command as the new day.

## RPC draft contracts and privilege gate

| New RPC | Input / output | Proposed privilege |
| --- | --- | --- |
| get_day | optional date; JSON with own garden/record/cares/rewards | SECURITY INVOKER, authenticated only, RLS |
| save_reflection_draft | date, 4-answer array (blanks allowed), revision; changed/revision/date | SECURITY DEFINER, auth.uid(), authenticated only |
| commit_reflection_v2 | date, complete answers, 3 server-selected cares, title, revision; changed/revision/date | SECURITY DEFINER, auth.uid(); sealed owner-only |
| commit_activity_v2 | date, action, nullable care ID, revision; changed/revision/date | SECURITY DEFINER, auth.uid(); sealed owner-only |

All new functions revoke PUBLIC, anon, authenticated, service_role first, then grant only the two explicit user-safe functions. No function accepts a browser-supplied user ID. Empty search_path, qualified table/helper names, no dynamic SQL. CREATE rather than CREATE OR REPLACE prevents overwriting a pre-existing function; inspect ALL same-name overloads before approval, not just these signatures.

**Unresolved deployment gate:** an authenticated JWT RPC cannot distinguish server calls from direct browser calls. Granting reflection_v2 to authenticated would allow client-selected recommendations; validating catalog membership alone does not establish the unchanged recommendation algorithm was used. A service key also does not automatically make `auth.uid()` the verified end user.

Preferred strict-auth.uid option to review separately: a narrowly privileged backend-only DB login/role with EXECUTE on just the two v2 functions, no table writes or bypass-RLS, trusted TLS/pool access. In a single server transaction, set transaction-local JWT subject claims derived exclusively from `getUser`, invoke a fixed parameterized RPC, commit/rollback; never reuse claims across pooled requests, never accept raw claims from HTTP. This requires new infrastructure/credential/role approval and staging tests, none supplied here. The four-function draft deliberately does NOT create this role or grant its permissions. Owner-only v2 is unusable by the current app until that gate is resolved.

Alternative requiring explicit contract approval: service-only wrappers taking a server-verified user ID, matching existing v1. This would abandon strict auth.uid ownership inside those wrappers and widen key blast radius; no such key or implementation is added. Another alternative is moving the exact recommendation algorithm into a trusted DB function, then allowing user-JWT completion; algorithm parity and a larger SQL review would be required.

Existing v1 EXECUTE privileges are unchanged. A privileged legacy caller can still bypass the new revision/refinalization contract. Before rollout, inventory all backend callers and route every new completion through v2; retiring legacy privileges is a separate approval, not part of this draft.

## Implementation order after separate approval

1. Approve server privilege mechanism, transaction-start date semantics and 365-day history window. Snapshot current function definitions/ACL/schema for review; confirm deployed hashes match this evidence, no conflicting overloads, postgres owner and exact lock sequence.
2. Execute draft-derived migration only in disposable staging after explicit approval. Remove guard only in the reviewed promotion copy, replace final ROLLBACK with COMMIT. Verify 13 existing tables, RLS, grants, policies and row values unchanged by DDL.
3. Adopt get_day for atomic reads and add an adapter to the existing 3A DTO (raw SQL JSON is not identical to the API projection). Validate schema and ownership before returning.
4. Introduce start_day + per-question draft commands. Serialize saves per account/day, send expected revision, retain failed draft only in memory, refetch on 409, do not overwrite newer tab state. No rewards on draft requests.
5. Compute the unchanged recommendation algorithm on the trusted server using persisted history, same ordering/seed/input normalization as existing code. Commit the three IDs/title exactly once. Network retries restore stored recommendations rather than rerolling.
6. Add activity commands, then writing revision conflict UI. Return committed day state and reward event identity; refresh authoritative balance. Trigger existing completion/Rive effects only after success. A retry with changed=false must not replay a reward animation. Reload restores final state without replaying old effects. Photos remain separate.

## Required staging validation (remaining gates; see isolated results below)

- Anonymous/no-subject and A->B access attempts; missing/forged/expired/other-project tokens at the server; direct authenticated invocation of sealed v2 must fail; backend role must not execute v1 or write tables directly.
- Empty/partial/malformed answer arrays, null date/revision, wrong enums, negative/stale revisions; draft does not alter any ledger, garden, inventory, cares, growth grants, stage or title. Repeated identical draft is no-op.
- Reflection commit twice, changed answers after completion, changed recommendation inputs on replay, race between two tabs, writing versus draft versus completion. At most one expected-revision transition; loser refetches.
- All activity orders, nonrecommended/other-user care, repeats of each action, 3 concurrent care completions: one firstCare award. Daily earned total <=25; ledger and garden balance change exactly together. Growth thresholds retain original behavior.
- Two independent DB connections: simultaneous v1/v2 and writing calls, lock timeout, deadlock check, network response lost after commit, injected exception after award. Assert whole transaction rollback on exception. PGlite alone is insufficient for genuine multi-session lock testing.
- Seoul midnight before/after transaction creation and during advisory-lock waits; correct old-date rejection, no previous-day payload accidentally applied today. Clock skew of Next host versus DB is eliminated by get_day.
- A->logout->B with delayed A response, same-user token refresh during load, two dates resolving out of order, HTTP error and retry. No localStorage/IndexedDB/photo cleanup access; compare isolated browser test fixtures byte-for-byte. Never use real user records as destructive test fixtures.
- Migration collision or forced failure after CREATE/REVOKE: whole DDL transaction rolls back, original function definitions/ACL and all existing objects unchanged. Validate syntax/ACL in disposable Postgres before production; draft syntax and execution are now covered by isolated PGlite tests below; native multi-connection PostgreSQL validation is still required.

## Rollback

3A: stop using the new records endpoint/store and revert only the files in this change; existing garden API keeps its original behavior via common auth. No database rollback or local-data recovery is needed.

3B deployment failure: single transaction abort preserves previous DB state. After a future successful deployment, disable newly enabled app writes first; return to read-only UI and leave additive functions unused. Removing only the four new functions/grants requires a separately reviewed rollback migration. Never delete committed records, reverse genuine rewards, reset gardens or overwrite existing v1 functions to simulate rollback.

## Verification boundaries

Current tests use the real SDK with a mocked HTTP transport for account A/B, tokens and responses. Existing DB regression tests execute prior approved migrations in an isolated in-memory database, not on Supabase. The original regression suites do not execute this draft; the new phase3b-draft suite executes only a guarded-source-derived memory copy in a fresh in-memory engine. MCP checks inspected schema/functions only, not authenticated A/B application reads. Actual signed-in `/api/account/records` success, two-browser lifecycle, multi-connection DB races and native multi-session 3B behavior remain to be verified separately. Earlier user-reported successful A/B garden reads do not establish records API verification.

Executed validation:

- Full regression run: 222/222 passed (Auth/PKCE, recommendation, garden, Rive and existing isolated DB tests included).
- After the response-tuple typing correction and one extra race test: records + garden suite 25/25 passed, including same-user refresh during a pending load and superseded requests.
- `npx.cmd tsc --noEmit`: passed. `npm.cmd run build`: passed; `/api/account/records` appears as a dynamic route.
- `npm.cmd run lint`: zero errors, three pre-existing unused-variable warnings in design-output/figma-plugin/build.js, scripts/sunshine.test.mjs and scripts/supabase-ab-prepare.mjs.
- Actual localhost:3000 calls: missing token 401 authentication-required; invalid synthetic token 401 authentication-failed; private/no-store headers. No real credentials used or printed.
- Actual read-only MCP metadata: 13 onestep public tables, all with RLS enabled and one policy each. No policy/table/data changes performed.
- Browser storage access traps passed for the new memory path; no real local records or IndexedDB photos were read, modified or deleted. Real-browser before/after storage comparison remains unperformed.

## 3B 안전성 재검토 결과 — 2026-11-13

결론: 보완된 초안은 정적 검토와 격리 PGlite 실행 검증을 통과했다. 운영 적용 승인으로 간주하면 안 된다. 실제 다중 연결 경쟁 검증과 서버 전용 호출 권한 설계는 남아 있다.

### 이번 변경 및 실행 경계

- 수정: `supabase/drafts/phase3b.sql`, 이 검토 문서. 추가: `scripts/phase3b-draft.test.mjs`.
- SQL 파일의 첫 BEGIN/실행 차단 예외/마지막 ROLLBACK을 유지했다. 테스트는 파일을 읽어 메모리 문자열에서만 차단문을 제외하고 마지막 문장을 COMMIT으로 바꾼다. 실행 가능한 마이그레이션 파일을 생성하지 않는다.
- 테스트 DB는 `new PGlite()`로 만든 메모리 전용 PostgreSQL 엔진이다. URL, 환경변수, 네트워크 클라이언트, 실제 A/B 계정, 디스크 DB를 사용하지 않는다. 테스트 종료 시 폐기한다.
- 운영 MCP에서는 SELECT로 함수 시그니처·본문 해시·ACL·RLS·트리거 메타데이터만 조회했다. 운영에 DDL/DML/RPC를 실행하지 않았다. 실제 계정, 데이터, RLS, Storage 변경 없음.

### 정적 SQL 검토 통과

- 네 함수의 CREATE 시그니처와 REVOKE/GRANT 시그니처가 일치한다. 모든 함수는 JSONB를 반환한다. get_day만 기본 날짜 인자를 허용한다.
- auth.uid, today, ensure_garden, award, sync_growth, 두 v1 commit 의존성 존재를 preflight에서 확인한다. 하위 함수의 본문/권한/제약조건 드리프트는 존재 검사만으로 탐지할 수 없으므로 배포 전 별도 비교가 필수다.
- 같은 이름의 어떤 overload라도 있으면 DDL 이전에 실패하도록 보완했다. 기존 함수나 테이블을 교체하지 않는다.
- get_day는 SECURITY INVOKER + RLS이고, 세 쓰기 함수는 SECURITY DEFINER + auth.uid 소유권 명시 필터다. definer에서는 RLS가 보안의 마지막 장벽이라고 가정하지 않는다. 소유권 필터와 실행 권한이 핵심이다.
- search_path는 모두 빈 문자열이다. 테이블, auth.uid 및 private/public 함수 참조는 스키마를 지정한다. 일반 SQL 내장 함수는 암묵적으로 우선 검색되는 pg_catalog에서 해석된다. 동적 SQL 없음.
- PUBLIC/anon/service_role EXECUTE 차단, authenticated에는 조회/초안 두 개만 부여. v2 두 개는 postgres 소유자만 실행 가능. 예상 밖 기본 권한이 다른 역할에 남으면 트랜잭션 전체를 실패시키는 ACL 검사를 추가했다. 향후 역할 상속/멤버십/슈퍼유저 권한까지 이 검사로 통제하는 것은 아니다.
- 사용자별 advisory lock을 먼저 얻고 기록 행을 잠근다. v1 내부 ensure_garden의 동일 advisory lock 재획득은 같은 트랜잭션에서 가능하다. v1/writing의 잠금 순서와 호환된다. 직접 DML 또는 규칙을 지키지 않는 새 writer는 이 보장의 대상이 아니다.
- 반환 행 전체를 JSON화하던 코드를 명시적 컬럼 목록으로 교체했다. 향후 추가되는 비공개 컬럼, photo_id, 생성/수정 시각은 자동 노출되지 않는다. 질문 답변/글은 본인에게 반환하는 의도된 사용자 데이터다. 토큰, 키, 이메일, SQL 정의는 반환하지 않는다. API는 실패 시 원본 DB error/detail을 그대로 전달하지 않아야 한다.

### 함수별 권한·변경 범위

| 함수 | 허용 호출자 | 데이터 변경 및 예외 |
| --- | --- | --- |
| get_day | authenticated | 본인 날짜 조회만. 날짜 범위 위반은 22023, 사용자 없음 42501. 오늘 잔액은 과거 날짜의 마감 잔액이 아니다. |
| save_reflection_draft | authenticated | 이미 존재하는 본인 checkin 기록의 answers/revision/updated_at만. 하루 생성, 정원 초기화, 햇살, 활동일, 식물 상태, 추천 변경 없음. 완료 후 40001. |
| commit_reflection_v2 | 소유자만; 앱 호출 불가 | v1을 통해 answers/stage/plant_state/title/revision, 추천 3개, 돌아보기 10, 활동일·성장·마일스톤 재화 반영. 완료 답변 동일 재시도는 무변경, 다른 답변은 40001. |
| commit_activity_v2 | 소유자만; 앱 호출 불가 | 단계 진행, 돌봄 completed_at, 참여 5/첫 돌봄 10. 신규 돌봄 완료 시 누락된 aggregate revision 증가 보완. 이미 완료된 동작은 무변경. |

### 격리된 테스트 DB 실행 통과

실행: `node --test scripts/phase3b-draft.test.mjs` (상위 4개 + 하위 5개 = 9개 테스트). 테스트 파일 ESLint 통과.

- 원본 차단문이 실제로 실패하고 신규 함수가 설치되지 않음. 메모리 복사본의 DDL 및 네 함수의 실행 경로가 PostgreSQL 엔진에서 성공.
- 설치 전후 13개 기존 테이블의 값, RLS·ACL·정책, 기존 함수 정의·ACL, 기존 트리거 비교 일치. 기존 기록이 있는 fixture에서도 보존.
- 운영 SELECT 결과와 로컬 의존 함수 7개의 CR 정규화 정의 MD5 일치: award, ensure_garden, today, sync_growth, commit_reflection, commit_activity, save_writing. 이는 검토 시점 드리프트 확인용이며 암호학적 배포 서명은 아니다. 운영의 13개 테이블 RLS/SELECT 정책과 Auth 생성 트리거도 별도로 확인.
- anon/service_role 조회 거부, 사용자 없는 authenticated 거부, authenticated/service_role의 sealed v2 실행 거부. 알려진 세 역할의 네 함수 권한 행렬 12개 검사.
- 본인 초안 저장, B 기록 불변, 빈 배열/NULL/잘못된 값/오래된 revision 거부. 초안 전후 보상·재화·활동일·추천 불변.
- 동일 돌아보기 재시도 무변경, 다른 답변 재확정 차단, 잘못된 추천으로 부분 저장/부분 지급 없음, 추천 3개 유지.
- photo/growth/care 순차 실행, 같은 돌봄 재시도 무변경, 다른 돌봄의 오래된 revision 충돌, writing과 revision 공유. 세 돌봄 모두 완료해도 보상 ledger 3개와 햇살 25만 존재.
- get_day A/B 응답 분리, 명시적 반환 필드 검사, READ ONLY 트랜잭션에서 호출 성공, 조회 후 DB 값 불변.
- 365일 경계/미래 날짜 거부, 과거 날짜 쓰기 거부, 서울 23:59:59 → 00:00:00 날짜 변환 검사.
- 같은 이름 overload 충돌, 예상 밖 기본 EXECUTE grant, DDL 후반 강제 실패 시 전체 설치 롤백.
- nested reflection의 award 이후 sync_growth에 강제 예외를 넣은 격리 실험에서 기록·추천·ledger·잔액 모두 원상태로 롤백.
- 위험 재현: service_role의 기존 v1 직접 호출은 완료된 답변을 바꿀 수 있다. 중복 보상은 발생하지 않지만 v2 완료 불변성은 우회된다.

### 실제 다중 연결 검증 통과 항목

없음. 이 환경 PATH에서 psql/postgres/pg_ctl/docker를 찾지 못했다. PGlite 테스트는 단일 세션이며 순차 재시도·revision 충돌 검사다. Promise 병렬 실행을 실제 PostgreSQL 다중 연결 경쟁으로 취급하지 않았다.

### 미검증 및 남은 위험 / 적용 전 준비

1. **높음 — 서버 호출 권한 미완성:** 두 v2 함수는 의도적으로 외부 호출 불가다. 기존 추천 알고리즘을 서버에서 실행하고 Auth 검증된 subject만 전달하는 최소 DB 역할/연결·풀링 구조를 별도로 승인해야 한다. 이번에는 키·역할·GRANT를 추가하지 않았다. authenticated로 단순 개방하면 안 된다.
2. **높음 — v1 우회 경로:** 모든 completion caller를 목록화하고 v2 사용으로 전환해야 한다. v1 권한 회수나 변경은 별도 승인 대상이다. 기존 서비스 역할의 직접 DML 권한 역시 이 초안으로 제한되지 않는다.
3. **중간 — 실제 경쟁 미검증:** 별도 native PostgreSQL staging에서 두 연결로 v1/v2/writing/사진 첨부 동시 실행, lock_timeout, serialization failure, deadlock, 응답 유실 뒤 재시도를 검증해야 한다. READ COMMITTED를 기준으로 하며 REPEATABLE READ/SERIALIZABLE에서는 40001 전체 트랜잭션 재시도 정책이 필요하다. 현재 오류 코드는 stale revision과 serialization failure가 겹치므로 무조건 자동 재시도하지 말고 재조회 후 판단한다.
4. **중간 — 자정 정책 승인:** now()는 트랜잭션 시작 시각이다. 자정 전 시작한 요청이 잠금 대기 후 자정을 지나도 전날에 기록할 수 있다. 고정 시각 변환 테스트는 통과했지만 실제 자정 횡단·대기 실험은 미수행이다. 벽시계 기준을 원하면 기존 today/award까지 재설계해야 한다. statement/lock timeout 설정도 서버 역할 설계에서 정한다.
5. **중간 — 기존 데이터 전제:** no-op은 이미 완료된 상태의 보상/추천이 정상이라는 전제이며 손상된 기존 데이터를 복구하지 않는다. 실사용 행을 조회하지 않았으므로 기존 행의 정합성/추천 누락 여부는 미검증이다. 배포 전 승인된 읽기 전용 정합성 검사 필요.
6. **후속 검증:** 실제 Auth JWT/connection pool claims 전달·초기화, PostgREST 캐시/함수 노출, 성장 50/100일 경계의 v2 경유 실행, 사진 첨부와 revision 경쟁, 실제 네트워크 실패/애니메이션 중복 방지는 별도 staging/app 검증 대상이다. fixture auth.uid는 단일 sub GUC를 읽으므로 실제 플랫폼의 JWT claims 형식 전체를 검증한 것은 아니다.
7. **배포 승인:** 운영 metadata/본문/ACL/의존성 해시 재확인 → 별도 staging 경쟁 테스트 → 최소 역할·자정 정책 승인 → 별도 마이그레이션 검토와 명시적 적용 승인 순서. 원본 초안의 차단문과 ROLLBACK은 그대로 유지한다.
