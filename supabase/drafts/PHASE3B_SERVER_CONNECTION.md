# One Step 3B 서버 DB 연결 최종 설계

?? ???????? ??? [PHASE3B_PREAPPLY_REVIEW.md](PHASE3B_PREAPPLY_REVIEW.md)? ????. ?? ? get_day/draft GRANT? ?? ??? ??? ?? ?? authenticated ?? ??? ????.

## 2026-11-13 실제 pg 어댑터 준비 결과 — 아래 이전 설계의 구현 상태를 갱신

- `src/lib/account/db-pool.ts`에 pg 8.23.1 풀 어댑터를 구현했다. import 시 연결하지 않으며 명시적인 `getAccountCommitPool()` 호출 때 설정 검증/풀 생성만 한다. 첫 checkout 때 인증 연결이 발생한다. 현재 API는 이 함수를 호출하지 않으며 모든 쓰기 gate는 기존 false다. 향후 승인된 서버 bootstrap에서 하나의 풀을 기존 createCommitExecutor/createActivityExecutor에 전달한다. 조회는 기존 사용자 JWT/RLS를 유지한다.
- Dedicated endpoint는 `db.yhzgucbiwvizjxpzwpqg.supabase.co:6543`, DB postgres로 제한했다. 전용 username `onestep_app_login_v숫자`만 허용하고 postgres/service_role/PAT/API key 및 임의 URL/PG 환경변수 fallback은 거부한다. Dedicated custom LOGIN의 managed 인증 성공은 여전히 미검증이다. Shared 전환 시 별도 endpoint/username 검토가 필요하며 현재 어댑터 설정을 임의 대체하지 않는다.
- 서버 설정: ONESTEP_DB_HOST, ONESTEP_DB_PORT, ONESTEP_DB_DATABASE, ONESTEP_DB_USER, ONESTEP_DB_PASSWORD, ONESTEP_DB_CA_PEM. 선택값 POOL_MAX=1(1~4), CONNECT_TIMEOUT_MS=5000(100~15000), IDLE_TIMEOUT_MS=10000(1000~60000), QUERY_TIMEOUT_MS=12000(10000~30000)는 모두 ONESTEP_DB_ 접두사를 쓴다. 비밀값을 파일에 작성하거나 발급하지 않았다. Dashboard의 실제 CA PEM이 필수이며 TLS 1.2 이상, CA/hostname 검증을 강제한다. sslmode DSN을 혼합하지 않는다. 기존 executor의 SET LOCAL statement_timeout=8s보다 driver deadline을 길게 둔다.
- 동일 checkout의 기존 BEGIN/SET LOCAL ROLE/두 claims/v2/COMMIT 또는 ROLLBACK을 재사용한다. 드라이버 오류는 SQLSTATE만 제한적으로 유지하고 원문/원인/쿼리/자격증명은 제거한다. transport error, query timeout, checked-out error event, 불명확한 COMMIT/실패한 ROLLBACK은 연결 폐기. idle error는 pg의 제거 처리를 사용하며 unhandled error로 프로세스를 종료시키거나 원문을 출력하지 않는다. shutdown은 요청 drain 후 closeAccountCommitPool을 호출한다.
- 실제 네트워크: AAAA `2406:da12:1f1:f800:ccd3:146a:467d:18f8` 해석, IPv6 TCP 6543 연결 성공. 초기 sandbox EACCES 후 제한 밖에서 TCP만 재확인했다. PostgreSQL startup/auth 패킷은 보내지 않았다. DNS 주소는 고정하지 않는다. TLS handshake/실제 CA/프로젝트 SSL enforcement는 미검증이고 TCP 성공과 구분한다.
- 사용자 Dashboard 확인으로 Edge Functions 없음과 Scheduled Backups 존재는 확인 완료다. 복원점/복구 절차, 외부 다른 앱/배치 v1 caller, 전용 LOGIN 지원/역할/credential provisioning은 별도 준비사항이다.
- 로컬 독립 PG는 기존 disposable cluster를 loopback 55439로 시작하려 했으나 pg_notify 디렉터리 누락으로 실패했다. 클러스터 복구·스키마/역할 생성·기존 3B 검증 재실행을 하지 않았다. 이번 실제 PostgreSQL 트랜잭션 검증은 미검증이다.
- 신규 어댑터 테스트 11개: 엄격 설정/TLS hostname 거부, A/B claims 및 A 실패 후 B, RPC/BEGIN/COMMIT/ROLLBACK 실패, transport/event 폐기, 비밀 오류 제거, 실제 pg Pool의 연결 없는 생성/종료. 트랜잭션 격리는 모의 driver 검증이며 실제 pooler 증거가 아니다. 기존 관련 API/Auth/정원/추천/Rive 포함 중복 제외 169개 통과. TypeScript/ESLint/빌드 검사 수행(ESLint 기존 경고 3개). 클라이언트 번들 어댑터/환경설정 marker 0건, .env.local/.env.development.local에는 ONESTEP_DB_ 설정 없음. 실제 secret 미등록 상태이므로 미래 secret 배포의 유출 검사까지 완료됐다는 의미는 아니다.
- 승인 상태: 연결 어댑터 코드 준비, 운영 연결/마이그레이션/쓰기 활성화는 보류. SQL guard/ROLLBACK, UI/Rive/Compose/로컬 데이터 변경 없음. 실제 CA/SSL enforcement, Dedicated 전용 LOGIN 지원, 승인된 역할·자격증명 및 실제 TLS/claims 검증, 백업/ACL 복구 준비 후 3B 적용 승인을 별도로 받는다.

근거: https://node-postgres.com/features/ssl 및 https://supabase.com/docs/guides/platform/ssl-enforcement. node-postgres의 connectionString SSL 옵션이 ssl 객체를 덮어쓸 수 있어 분리된 config만 사용한다.

운영 적용 준비 현황과 3C–3F 실제 계정 기능 완료 기준은 [PHASE3B_RELEASE_CHECKLIST.md](PHASE3B_RELEASE_CHECKLIST.md)를 따른다. 발표 전용 모드·데이터 초기화·인증 우회는 추가하지 않는다. 이번에 실제 Supabase PG17.11/제한된 postgres CREATEROLE을 확인했으며, 기존 PG17.12 로컬 통과 증거와 managed LOGIN/pooler 미검증 범위를 구분한다. Android와 호스팅 선택은 독립이며 운영 적용은 별도 승인 전 보류한다.

2026-11-13. 대상 yhzgucbiwvizjxpzwpqg. 운영 변경 및 마이그레이션은 미승인. 이미 통과한 native PostgreSQL/PGlite 경쟁·권한 검증은 이번에 반복하지 않았다. 이 문서가 연결 선택·provisioning·배포 순서에 관해 이전 검토 문서보다 우선한다. 이전 테스트 결과는 그대로 유효하며, 이번 새 LOGIN 초안의 실행 통과를 의미하지 않는다.

## 1. 결정과 확인 범위

사용자 확인: 운영 배포 대상은 **아직 결정하지 않음**. 저장소는 Next.js 16.3.4 Node.js Route Handler이고 next start가 있지만 Vercel/Docker/배포 workflow 설정이 없다. 로고 파일로 Vercel 배포를 추정하지 않는다. pg 드라이버는 현재 없으며 이번에 설치하지 않았다.

기본 설계는 **Node.js runtime + shared Supavisor Transaction Pooler + 전용 DB LOGIN**이다. 배포처 미정이므로 운영 호스트/리전/네트워크에 대한 최종 검증은 게이트로 남긴다. Edge runtime 및 HTTP 단발 쿼리 driver로 변경하지 않는다. 기존 조회는 publishable key + 사용자 JWT + RLS 경로를 유지한다. 전용 DB 연결은 두 v2 확정 RPC 호출에만 사용한다.

| 연결 | 채택 기준 | 이 프로젝트 판단 |
| --- | --- | --- |
| Direct 5432 | 상시 실행 Node VM/container, 직접 endpoint의 IPv6 또는 승인된 IPv4 환경, 제한된 프로세스 수 | 장기 서버로 확정되면 대안. 트래픽에 비례해 증가하는 서버리스 기본안으로 쓰지 않음 |
| Shared Session Pooler 5432 | IPv4 장기 서버, 한 클라이언트 연결에 backend가 지속 배정되는 모델 | Windows 개발/상시 서버의 대안. 서버리스 연결 폭증 완화용 기본안은 아님 |
| Shared Transaction Pooler 6543 | 서버리스/수평 확장, 명시적 짧은 트랜잭션 | 기본안. 같은 checked-out client의 BEGIN~COMMIT 안에서 claims/role/RPC를 모두 처리 |

실제 endpoint/port/region/DB 이름은 Dashboard Connect에서 선택한 모드의 값을 사용한다. 지역을 추정해 hostname을 만들지 않는다. shared pooler username은 `<LOGIN_ROLE>.yhzgucbiwvizjxpzwpqg`, direct는 `<LOGIN_ROLE>`이다. Pro의 dedicated PgBouncer와 shared Supavisor를 혼동하지 않는다. 이번 설계는 shared Supavisor이며 실제 custom-role 접속 지원과 TLS를 staging에서 확인한다.

## 2. 역할과 권한

소유자 postgres → SECURITY DEFINER v2 → owner-only v1/private helper라는 기존 실행 구조를 유지한다. NOLOGIN `onestep_commit_executor`에는 public USAGE와 두 v2 EXECUTE만 추가한다. 로그인 역할 `onestep_app_login_v1`은 CONNECT와 executor로 SET ROLE 할 수 있는 멤버십만 가진다. ADMIN FALSE, INHERIT FALSE, SET TRUE를 명시한다. NOINHERIT는 SET ROLE 금지가 아니므로 다른 SET 가능한 역할이 없어야 한다.

`phase3b-login.sql`은 비밀번호 없이 NOLOGIN 상태의 역할과 제한된 권한만 정의한다. 실제 LOGIN 활성화와 비밀번호 지정은 관리자가 승인된 비밀 경로에서 별도로 수행한다. 소유자 postgres나 service_role 자격증명을 앱에 넣지 않는다. 이 role suffix v1은 credential 세대이며 legacy RPC v1과 무관하다.

허용되는 애플리케이션 함수는 commit_reflection_v2 / commit_activity_v2뿐이다. PostgreSQL 내장 함수와 PUBLIC 권한까지 모두 사라진다는 뜻은 아니다. PUBLIC의 schema CREATE, table/function 권한과 role inheritance를 별도 감사한다. 문제가 발견되면 관련 서비스 영향 검토 없이 전역 PUBLIC REVOKE를 하지 않는다. 롤 이름/NOINHERIT/NOBYPASSRLS만으로 최소 권한이 증명되지 않는다.

로그인 계정의 RLS bypass는 없지만 v2 자체는 postgres definer다. 따라서 이 경로는 사용자 JWT로 RLS를 적용하는 조회 경로와 다르다. 서버 Auth 검증 + auth.uid 기반 소유권 필터 + 좁은 RPC가 경계다. DB credential 탈취자는 subject GUC를 위조해 다른 사용자의 두 RPC를 실행할 수 있다. 최소 역할은 피해 범위를 축소하며 credential 유출을 무해하게 만들지 않는다.

## 3. 인증 → 트랜잭션 계약

현재 공통 authenticateAccount를 재사용한다. 매 HTTP 요청마다 Supabase Auth getUser(token)이 성공해야 하고 대상 프로젝트 issuer/sub/authenticated role/만료 검사를 통과해야 한다. JWT decode만으로 검증을 대신하지 않는다. verified user.id는 요청 body/query/header의 userId로 덮어쓰지 않는다. Authorization/JWT/answers/note/DSN을 로그에 남기지 않는다.

실제 운영 auth.uid 본문을 SELECT로 확인했다. `request.jwt.claim.sub`가 비어 있지 않으면 우선 사용하며, 그렇지 않으면 `request.jwt.claims` JSON의 sub를 사용한다. 따라서 **두 GUC를 같은 verifiedId로 매 트랜잭션 덮어쓴다**. 한쪽만 설정하면 이전 SESSION 값이 우선될 수 있다.

실행 알고리즘(설계, 앱 구현 안 함):

1. Auth 검증과 입력 검증 및 추천 계산을 먼저 완료. DB 트랜잭션 중 외부 HTTP/Auth를 기다리지 않는다. 커넥션을 기다리는 동안 토큰이 만료되면 시작 전 거절/재검증한다.
2. 서버 전용 `pg.Pool`에서 client를 빌림. BEGIN ISOLATION LEVEL READ COMMITTED. pool.query로 여러 문장을 실행하지 않는다.
3. SET LOCAL ROLE onestep_commit_executor. SET LOCAL lock_timeout='2s', statement_timeout='8s', idle_in_transaction_session_timeout='10s'. 해당 값은 초기안으로 staging SLA 확인 후 확정.
4. 한 파라미터 쿼리에서 set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true). $1은 verifiedId, $2는 서버가 만든 최소 `{sub: verifiedId}` JSON. 원본 JWT나 client role을 전달하지 않는다. 여기의 claims는 Auth 검증 결과를 전달하는 신뢰된 서버 컨텍스트이지 DB가 재검증하는 JWT가 아니다.
5. 고정 문자열 SQL과 파라미터 배열로 `SELECT public.onestep_commit_reflection_v2($1::date,$2::text[],$3::text[],$4::text,$5::bigint)` 또는 activity_v2만 호출. userId 파라미터 없음. function name과 SET ROLE은 사용자 입력으로 만들지 않음.
6. COMMIT 성공 후만 저장 성공 반환. 결과 schema/date/revision 검증. 성공 응답 date는 처리된 날이며 현재 today를 의미하지 않음.
7. 모든 예외에서 ROLLBACK 시도. 연결 끊김·rollback 실패·transaction state 불명확·COMMIT 응답 유실이면 client.release(error)로 클라이언트 연결 폐기. 정상 COMMIT/ROLLBACK을 확인한 연결만 release. 클라이언트 abort도 같은 정리 경로 사용.

ROLLBACK을 HTTP 타임아웃 뒤 fire-and-forget로 던지고 연결을 풀에 반환하지 않는다. 트랜잭션 promise를 먼저 정리한다. 강제 종료되는 서버리스 인스턴스는 idle timeout을 후방 안전장치로 삼는다. 앱의 전체 deadline을 SQL/lock timeout보다 길게 정하고 provider의 실행 제한 이내로 구성한다.

## 4. 풀/TLS 설정 및 새 검증 계획

선택 driver: node-postgres(pg), 향후 구현 승인 후 버전 고정 설치. 모듈 단위 pool 하나/Node 프로세스 또는 서버리스 인스턴스, session/user/token 전역 저장 금지. 초기 max=2, idleTimeoutMillis=10000, connectionTimeoutMillis=5000. 이 값은 전역 2연결 제한이 아니며 인스턴스 수와 함께 곱해진다. `인스턴스 상한 × max + 전환 시 중첩 세대`가 pooler client 한도 안인지 계산하고 DB backend 예산에 Auth/PostgREST/관리 연결 여유를 남긴다. 역할별 Supavisor pool과 credential 회전 중 두 역할의 pool을 모두 산정한다.

Transaction Pooler에서 session state, SESSION advisory lock, LISTEN, 임시 테이블에 의존하지 않는다. 기존 pg_advisory_xact_lock은 사용 가능. named prepared statement 옵션 name을 쓰지 않는다. parameterized query는 그대로 사용한다. 일부 Supavisor 버전의 named-prepared 기능 지원에 의존하지 않는다.

TLS 인증서와 hostname 검증 활성화, rejectUnauthorized:false 금지. Dashboard가 안내하는 CA/시스템 신뢰 체인을 사용한다. host/user/password/database/port와 ssl 설정을 분리하는 편을 우선한다. connectionString의 sslmode 등이 pg의 ssl 객체를 덮어쓰지 않도록 한 방식만 선택한다. 잘못된 CA/hostname이 실패하는지 확인한다.

새로 필요한 검증만 진행한다(기존 로컬 경쟁 suite 반복 아님):

- **선택한 Supavisor 모드 + 실제 전용 LOGIN**으로 fresh connect, TLS, session_user/current_user, role membership 및 함수 권한 확인. staging에만 실행.
- pool max=1로 A 성공 → B 성공, A SQL 오류 → B, A timeout/abort → B, A rollback → B. 각 트랜잭션 내 두 sub 값 일치, 자기 데이터만 변경, SET LOCAL ROLE 정상 확인. RPC에는 caller-controlled identity 인자가 없는지 검사.
- B가 claims 설정을 의도적으로 생략하는 시험에서는 이전 A subject가 없어야 하고 RPC가 거절돼야 함. 기존 SESSION 값 주입은 staging 전용 오염 fixture에서만 하며 설정 두 개를 매번 덮어쓰는 방어도 검사.
- 완료 후 **새 BEGIN**에서 claims/role 기본 상태를 검사. transaction pooler는 다음 트랜잭션에 다른 backend를 줄 수 있으므로 같은 pg client가 같은 backend라고 가정하지 않음. staging backend pool을 제한한 시험과 backend PID 관측을 조합한다.
- pool max=2에서 A/B 겹친 요청과 순서 뒤집힌 응답, token refresh/로그아웃으로 응답 폐기. DB 세션 상태와 브라우저 메모리 상태를 별도로 검증.
- COMMIT 응답 유실은 저장 실패로 단정하지 않고 outcome unknown. 같은 date의 사용자-JWT 조회로 확인 후 재시도 판단. 날짜를 오늘로 바꿔 재지급하지 않음.
- 앱에서 일반 SQL 오류를 사용자 응답으로 상세 노출하지 않음. 구조화 로그는 request ID/action/result code/시간만, 민감한 query parameters와 연결정보 제거.

## 5. 확인 가능한 외부 caller 조사 결과

이번 읽기 전용 확인:

- src의 두 v1 직접 호출 없음. 저장소의 기존 테스트/검증 스크립트에는 v1 참조가 남아 있으며 운영 경로와 구분.
- 저장소에 supabase/functions 및 .github workflows 디렉터리 없음. 외부 CI가 없다는 증거는 아님.
- 운영 pg_proc에서 자기 자신을 제외한 v1 이름의 직접 본문 참조 0건. 동적 SQL/문자열 조합/external scheduler는 검색으로 입증할 수 없음.
- cron.job 없음, pg_cron/pg_net 확장 없음. 이 DB의 해당 확장 기반 배치는 발견되지 않음.
- Edge Function list 호출은 MCP ProtocolError -32600 "You do not have permission to perform this action". HTTP status는 반환되지 않음. Edge Functions는 **미검증**이며 0개라고 보고하지 않음. 권한 오류를 우회하려고 PAT나 키를 사용하지 않음.

사용자가 Dashboard Edge Functions 목록과 각 배포 소스/외부 저장소를 확인해야 한다. Functions 목록이 비어 있으면 그 사실을 기록하고, 있으면 두 RPC명, REST `/rpc/` 경로, 동적 function name, secret에 연결된 프로젝트 식별만 검사한다. 비밀값을 붙여넣지 않는다. 조직의 외부 배치/호스팅 cron/자동화 도구·다른 앱 담당자에게 caller 유무와 중지 가능 시간을 확인한다. 로그에서 호출이 안 보이는 것만으로 부재를 확정하지 않는다.

## 6. Dashboard 및 credential 작업 — 사용자 실행 전 승인 필요

지금은 아무 비밀번호/키도 발급하지 않았으며 다음은 작업 절차다.

1. Dashboard에서 프로젝트 ID 확인 → Connect → shared Transaction pooler의 host/port/database/region과 SSL 안내 확인. 호스팅 region 및 network egress 확정. 전체 DSN/비밀번호를 채팅에 공유하지 않음.
2. Database 연결/풀 설정에서 backend/client limit과 현재 여유, custom role 지원을 확인. 기본 연결 문자열의 postgres 사용자를 전용 역할로 대체할 계획을 승인. 프로젝트 기본 postgres 비밀번호 재설정은 필요 없음.
3. Edge Functions/운영 외부 caller 조사 완료. 별도 staging 프로젝트/branch 또는 동등한 Supavisor 검증 환경과 합성 A/B 계정 사용 승인을 확보. 운영 실제 기록으로 새 테스트를 실행하지 않음.
4. 승인된 관리자가 SQL Editor/승인된 관리 연결에서 검토 완료 migration을 적용. repo의 차단문을 작업 중 제거하지 않으며 별도의 승인된 승격본만 사용. SQL Editor는 역할 관리에도 사용 가능하지만 비밀번호를 저장된 SQL snippet/history에 남기지 않도록 한다.
5. LOGIN provisioning은 보안 관리자 관리 연결의 비밀번호 전용 입력 경로(예: psql의 대화형 password 변경)와 secret manager 사용. 관리 도구의 로그/statement 수집 정책도 확인. 강한 무작위 비밀번호는 그 시점에만 생성, 현재 문서/SQL에는 없음. 비밀번호 지정 후 LOGIN 허용. 실제 DB 버전에 맞는 권한/멤버십·CONNECT를 확인.
6. 앱 호스팅 secret manager의 서버 전용 `ONESTEP_DB_*` 구성에 보관. NEXT_PUBLIC, next.config env, client bundle, repo, 일반 preview 배포에 등록 금지. Supabase Edge Function Secrets에 넣는 것은 Next.js 호스팅 secret 배포를 대신하지 못함. PAT/Secret key/service_role key는 이 연결의 credential이 아님.

회전은 두 login 세대 방식: login_v2를 동일 executor 멤버십으로 생성 → 비공개 password 설정/LOGIN → TLS 접속 검증 → 새 secret 버전으로 앱 재배포 → 구 인스턴스 drain → 구 login NOLOGIN + membership 회수 → 남은 세션 및 pooler cache 영향 확인 후 승인된 범위로 종료/역할 제거. NOLOGIN/비밀번호 변경만으로 기존 세션이 끊어진다고 가정하지 않는다. connection pool cache/role별 backend 예산을 확인한다. old/new credentials 동시 유효 기간은 짧게 제한. 장애 시 검증된 이전 세대로 되돌릴 수 있으나 탈취된 credential로 rollback하지 않는다.

## 7. 확정 배포 순서와 롤백

**G0 준비 게이트**: 호스팅 결정, endpoint/TLS/budget, 외부 v1 caller inventory, staging pool claims 검증, 운영 관리 권한 확인. 이 단계가 남았으므로 지금 운영 적용 승인은 권고하지 않는다.

**G1 앱 준비**: 새 서버 adapter/API 구현은 별도 승인 작업. production 쓰기 flag OFF로 배포. v1 fallback 없음. 기존 사용자-JWT 조회 유지. staging에서 새 연결 경로 검증.

**G2 전환 창**: 외부 v1 writer를 중지/drain. 변경 전 함수/ACL 스냅샷과 rollback 계획 확보. 관리 승인 후 (a) phase3b 4함수 생성과 sealed ACL 검증, (b) permissions의 executor 부여 + v1 외부 EXECUTE 회수, (c) login skeleton, (d) 비공개 credential provisioning 순서. base SQL의 sealed ACL 검사보다 executor GRANT가 앞서지 않게 함. (b)는 한 트랜잭션으로 권한 공백/부분 반영 방지. base/permission/login 각 단계 실패 시 쓰기 flag는 OFF 유지.

**G3 검증**: 운영에서 허용된 읽기 전용 role/ACL/connect 확인. 쓰기 canary는 별도로 승인된 합성 테스트 계정 범위에서만 수행하며 자동으로 실제 계정 기록을 변경하지 않음. 실제 Supavisor pool 경로의 테스트 증거 확인 후 기능 flag를 점진적으로 ON.

**G4 롤백**: 새 쓰기 OFF → in-flight drain → 조회 전용 유지. v1/service_role fallback을 자동 복구하지 않음. 신규 함수와 사용자 기록/보상은 삭제하지 않음. 로그인 회수와 ACL 복구는 영향 검토 후 별도 승인. 기존 외부 caller가 차단돼야 하는 상태에서 과거 ACL을 무조건 복원하지 않음.

## 8. 승인 상태

설계는 후속 구현 리뷰에 사용할 수 있다. **운영 배포 승인은 아직 보류**: 배포 대상 미정, 실제 pooler/LOGIN/claims/TLS 검증 미수행, Edge Functions 권한 제한 및 외부 caller 확인 미완료, 새 서버 adapter 미구현, 자격증명 미발급, 새 login SQL 미실행. 이미 통과한 native 경쟁·권한 테스트는 재실행할 필요 없음. 이 게이트를 통과한 후 명시적인 운영 마이그레이션/credential provisioning/쓰기 활성화 승인을 각각 받는다.

## 근거

- [Supabase 연결 방식 및 custom role username](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase 풀과 연결 한도](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- [node-postgres 트랜잭션: 동일 client 사용](https://node-postgres.com/features/transactions)
- [node-postgres TLS 설정 충돌 주의](https://node-postgres.com/features/ssl)
- [Supavisor prepared statement 기능 조건](https://supabase.github.io/supavisor/faq/)
- [PostgreSQL 17 GRANT 멤버십 옵션](https://www.postgresql.org/docs/17/sql-grant.html)
