# 3B 운영 적용 전 권한·경쟁·날짜 설계

최종 연결/provisioning/배포 순서는 [PHASE3B_SERVER_CONNECTION.md](PHASE3B_SERVER_CONNECTION.md)를 따른다. 사용자가 운영 호스팅을 아직 결정하지 않았으므로 shared Transaction Pooler를 기본안으로 두고 실제 endpoint/LOGIN/TLS/claims 검증을 게이트로 유지한다. 이 문서의 native 테스트는 이미 통과한 이력이며 후속 설계 작업에서 반복하지 않았다. LOGIN provisioning 초안은 `phase3b-login.sql`이며 비밀번호 없는 NOLOGIN 상태만 정의한다.

운영 적용 미승인. 이 문서와 `phase3b-permissions.sql`은 설계/검증 산출물이다. 기존 `phase3b.sql`과 새 권한 초안 모두 실행 차단 예외와 최종 ROLLBACK을 유지한다. 앱/UI/Rive/로컬 저장소/환경변수/의존성 파일은 변경하지 않는다.

## Windows 독립 검증 환경

조사 결과: PATH 및 일반 설치 위치에서 PostgreSQL/Docker/Podman을 찾지 못했다. WSL 실행 파일은 있으나 배포판 조회가 `Wsl/E_ACCESSDENIED`로 실패했다. 초기 sandbox 네트워크 조회는 실패했지만 승인된 도구 실행 경로에서 공식 EDB 다운로드에 접근했다.

선택: PostgreSQL 공식 Windows 페이지가 안내하는 EDB ZIP 바이너리 17.12를 시스템 임시 폴더에 다운로드. 설치 프로그램, Windows 서비스 등록, PATH 수정, npm 패키지 설치 없이 실행. 테스트 클러스터는 127.0.0.1:55439의 독립 `onestep_phase3b_test` DB이며 허구 fixture만 사용한다. trust 인증은 이 임시 로컬 fixture에만 사용하며 운영 설정으로 제안하지 않는다. 테스트 종료 시 서버를 중지한다. 바이너리/데이터는 임시 폴더에 남겨 재검토 가능하다.

`scripts/phase3b-native-check.mjs`는 지정된 포트/DB 이름/확인 문자열과 임시 data_directory 경로를 검사하고, .env나 Supabase URL을 읽지 않는다. 각 경쟁 요청은 별도 psql 프로세스와 backend 연결이다. 첫 연결이 사용자 advisory lock을 보유한 동안 둘째 연결을 시작하고, 별도 관찰 연결에서 실제 `wait_event='advisory'`를 확인한다. SQL 차단문 제거는 테스트 프로세스 메모리 문자열 안에서만 한다. 실행 가능한 승격 SQL 파일을 저장하지 않는다.

## 독립 PostgreSQL 실제 검증 결과

2026-11-13 실행 완료. Windows native PostgreSQL 17.12, psql 독립 프로세스 2개 + 관찰 연결에서 확인했다. `phase3b-native-check.mjs` 종료 코드 0. PGlite 기존 9개 테스트도 재실행 통과, 새 runner ESLint 통과.

| 검증 | 실제 관찰 결과 |
| --- | --- |
| 서로 다른 초안, 같은 expected revision | 첫 요청 성공; 대기한 둘째 요청 40001 |
| 같은 돌아보기 확정 동시 요청 | 첫 요청 성공; 둘째 changed=false, 추천 재생성 없음 |
| 같은 첫 돌봄 동시 재시도 | 첫 요청 성공; 둘째 changed=false |
| 서로 다른 돌봄, 같은 expected revision | 첫 요청 성공; 둘째 40001 |
| 잠금 경합 | 네 경쟁 실험에서 관찰 연결이 advisory wait를 확인 |
| 보상/추천 | 최종 잔액 25, ledger 3개, 추천 3개 |
| v1 차단 이후 내부 호출 | executor의 v2 → postgres definer → v1 성공 |
| v1 직접 호출 | service_role/authenticated/executor 모두 42501 |
| 최소 역할 DML | executor의 정원 직접 UPDATE 42501 |
| 날짜 | 서울 23:59:59/00:00:00 변환, 전날 명령 22023 통과 |
| 자정 모의 | 실제 now/clock_timestamp에 같은 offset을 더한 SQL에서 transaction 날짜는 전날, wall-clock 날짜는 다음 날임을 확인 |

자정 모의는 실제 원본 RPC를 시계 자정에 실행한 결과가 아니다. OS 시계나 원본 RPC의 now()를 바꾸지 않았다. 실제 자정 lock 대기, deadlock 강제 주입, 연결 중단/COMMIT 응답 유실, 운영 auth.uid/pooler/LOGIN 경로는 여전히 미검증이다. 이번 실행은 동일 역할을 SET ROLE한 로컬 연결이며 전용 LOGIN 인증은 시험하지 않았다.

테스트 종료 후 임시 클러스터를 fast shutdown했다. 서비스 등록·PATH·앱 패키지·.env 변경 없음. 설치 ZIP/격리 데이터는 `C:\Users\lowwn\AppData\Local\Temp\onestep-pg3b-EguqTf`에만 보존했다. 초기 PowerShell Start-Process -Wait가 서버 하위 프로세스까지 기다려 시작 명령의 반환이 지연됐으므로 테스트는 별도 셸에서 실행했다. 재현 시 pg_ctl 프로세스 객체의 WaitForExit 등으로 launcher 종료만 기다리고 서버를 대기하지 않도록 한다.

## v1 우회 차단 상세

운영 SELECT 재확인: 두 v1은 postgres 소유 SECURITY DEFINER, empty search_path, postgres/service_role EXECUTE이다. 본문은 private ensure_garden/today/award 및 reflection의 sync_growth를 사용한다. 현재 운영 함수 본문 문자열 검색에서 두 v1을 호출하는 다른 함수는 발견하지 못했다. 문자열/pg_depend 검색으로 외부 배치·Edge Function·동적 SQL을 완전히 파악할 수는 없다.

현재 `src` 검색에서 두 v1 이름 또는 service_role 사용 경로 없음. 직접 호출은 기존 테스트 fixture/회귀 테스트/검증 도구에 남아 있으며 운영 API 경로가 아니다. 배포 후 CI에서는 src의 `.rpc()` 및 `/rest/v1/rpc/` 호출과 새 DB 드라이버의 SQL을 허용목록으로 검사한다. 동적 함수명은 금지한다. 기존 회귀 테스트의 v1 직접 호출 기대값은 v1 설치만 검증하는 suite로 유지하고, 권한 전환 이후 suite는 호출 거부를 기대해야 한다.

별도 초안의 변경:

1. NOLOGIN/NOBYPASSRLS/비관리자 실행 역할 `onestep_commit_executor` 생성. 두 v2의 EXECUTE와 public USAGE만 부여.
2. 두 v1의 PUBLIC/anon/authenticated/service_role/executor EXECUTE 회수. DROP/함수 이동/본문 변경/CASCADE 없음.
3. postgres 소유자 권한은 유지. v2의 SECURITY DEFINER 실행 주체가 postgres이므로 nested v1 호출은 가능하다. executor가 v1을 직접 호출하는 것은 차단한다.
4. 예상 밖 v1 ACL이 남으면 트랜잭션 전체 실패. 소유자·슈퍼유저·다른 역할 멤버십을 통한 우회까지 자동으로 없애는 안은 아니다.

한계: service_role은 기존 테이블 DML/BYPASSRLS 권한을 계속 가진다. v1 EXECUTE 회수는 v1 호출 통로를 닫을 뿐 service_role 유출을 안전하게 만드는 조치가 아니다. 앱에는 해당 키를 넣지 않는 안을 추천한다. 기존 외부 caller 점검과 중단 창/배포 순서는 운영 승인 전 필수다.

## 서버 권한 비교 및 추천

| 방식 | 적용 가능성 | RLS/침해 범위 | 운영 부담 |
| --- | --- | --- | --- |
| service_role/Secret key + Data API | 현재 auth.uid 기반 sealed v2에 키만 넣어서는 작동하지 않음. 별도 service-only wrapper에 검증된 subject 인자를 받는 계약 변경이 필요 | RLS 우회와 넓은 기존 테이블 권한. 사용자 JWT를 Authorization에 넣으면 사용자 역할로 실행되므로 서버 전용 권한 해결책이 아님 | HTTP 연결은 간단하지만 키 유출 영향이 매우 큼. 키 회전/외부 caller 정리가 필요 |
| 전용 DB LOGIN + 최소 executor 역할 | 직접 PostgreSQL 또는 지원되는 custom-role shared pooler 사용. 현재 v2 계약을 유지할 수 있음 | 로그인 역할에는 table DML/BYPASSRLS를 주지 않음. 다만 v2 definer는 postgres 권한이므로 검증된 user.id와 좁은 함수 본문이 보안 경계 | 별도 credential/TLS/pool/timeout/claims 초기화/rotation 관리 필요 |

추천: 전용 DB 역할. 아직 LOGIN 역할/비밀번호/키를 만들거나 환경변수에 등록하지 않았다. 권한 초안은 NOLOGIN 실행 역할만 정의하며 로그인 provisioning은 별도 승인 단계다.

로그인 역할에 필요한 것은 대상 DB CONNECT와 executor로 SET ROLE 가능한 제한적 멤버십이다. postgres/service_role/authenticated 역할 멤버십, BYPASSRLS, 테이블 SELECT/DML, schema CREATE, owner 권한을 주지 않는다. PUBLIC에서 상속되는 DB/스키마/함수 권한도 점검한다. NOINHERIT만으로 SET ROLE이나 PUBLIC 권한이 차단되지는 않는다. 기본 GRANT와 role membership 검증은 배포 환경에서 다시 수행한다.

서버 요청 순서:

1. 기존 공통 Auth 검증으로 대상 프로젝트 issuer/sub/role/expiry 및 `getUser` 확인. HTTP userId/claims/role은 받지 않는다. 서버의 고정 추천 알고리즘으로 cares/title을 생성한다.
2. 풀에서 연결을 빌린 뒤 BEGIN READ COMMITTED. 네트워크 Auth 검증이나 외부 호출을 열린 DB 트랜잭션 안에서 기다리지 않는다.
3. `SET LOCAL ROLE onestep_commit_executor`; 매 요청마다 `set_config('request.jwt.claim.sub', verifiedId, true)` 및 `set_config('request.jwt.claims', verifiedClaimsJson, true)`를 파라미터로 지정. 실제 auth.uid 구현이 읽는 두 형식을 확인하고 일관되게 설정한다. JWT 원문/클라이언트 role을 SQL 문자열로 연결하지 않는다.
4. lock_timeout 예: 2s, statement_timeout 예: 8s, idle_in_transaction_session_timeout 예: 10s를 설정(최종 값은 부하검증 후 승인). 고정 SQL 두 개 중 하나만 파라미터 바인딩으로 호출한다. RETURN 결과만으로 성공 응답하지 않고 COMMIT 성공을 기다린다.
5. 실패 시 ROLLBACK, 상태가 불명확한 연결은 풀에서 폐기. 성공·실패 후 다음 A/B 요청에서 claims가 남지 않는지 실제 pool 테스트. SESSION SET이나 연결 전역 subject 캐시는 금지.
6. 40001/40P01/55P03은 재조회 후 제한된 재시도. 사용자 revision 충돌과 DB serialization failure를 구분해 무조건 자동 재시도하지 않는다. COMMIT 후 네트워크 단절은 결과 미상으로 다루고 같은 날짜의 서버 상태부터 확인한다.

DB credential이 유출되면 공격자가 GUC subject를 위조하여 두 RPC를 다른 사용자로 실행할 수 있다. 따라서 이 방식도 사용자 JWT 자체가 DB에서 암호학적으로 검증되는 것은 아니다. Auth를 검증하는 서버가 신뢰 경계이며 최소 역할은 피해 범위를 좁히는 수단이다. role provisioning/로그인 인증/TLS/custom-role pool 연결은 운영에서 아직 미검증이다.

## 서울 자정 정책

권고 정책: DB BEGIN 시점의 now()를 Asia/Seoul 날짜로 변환한 날짜에 귀속한다. 클라이언트 요청 생성 시각이나 HTTP 도착 시각은 기준이 아니다. 따라서 23:59에 작성해도 DB BEGIN이 00:00 이후면 전날 날짜 입력은 거절된다. 자정 전 BEGIN하고 lock 대기 후 자정 후 COMMIT하면 전날 기록/보상으로 확정된다. 장기 트랜잭션은 timeout으로 제한한다.

완료 후 서버 응답 계약(후속 구현): 기존 `date`를 `committedDate` 의미로 보존하고, COMMIT 후 새 조회로 얻은 `today`/현재 잔액을 분리한다. 앱의 캐시 키는 userId + date + revision이다. 전날 응답을 새날의 질문/추천/완료 상태에 합치지 않는다. 전날 저장 성공을 현재 피드백 위치에서 알리고 오늘 상태를 새로 조회한다. 이번 작업에서 화면/문구/Rive는 변경하지 않는다.

예외 처리:

- 전날 명령의 응답 유실 후 자정이 지났으면 명령 날짜를 오늘로 바꿔 재전송하지 않는다. 전날 get_day와 오늘 get_day를 조회해 확정 여부를 판단한다.
- 전날 저장이 확인되면 전날 완료로 표시. 오늘 보상 애니메이션을 대신 재생하지 않는다. 불확실하면 성공으로 확정하지 않는다.
- 전날 초안 실패 입력은 메모리에만 유지하고 오늘 답변으로 자동 이전하지 않는다. 계정 변경 시 메모리 폐기.
- 여러 탭에서 자정을 넘긴 경우 각 응답의 날짜·사용자·revision 검사 후 적용. today 변경 시 진행 중인 전날 명령을 오늘 명령으로 치환하지 않는다.
- 보상 이벤트가 처음인지와 이미 본 애니메이션인지 구분해야 한다. changed=false 재시도나 조회 복원에서는 재생하지 않는다. 명령 처리 이후 새 조회가 실패하면 "저장은 완료, 최신 조회 실패"를 구분하여 중복 저장을 유발하지 않는다.

## 실제 마이그레이션에 포함할 범위와 승인 순서

1. 기존 4함수 초안 설치(정의·ACL·RLS 상태/해시 preflight), 이어서 별도 권한 초안. 현재 초안 파일을 그대로 실행하지 않음.
2. 전용 login/CONNECT/멤버십은 보안 provisioning 계획으로 별도 승인. 실제 Supabase 관리 역할에서 CREATE ROLE/GRANT 가능한지 확인. 자격증명은 secret manager에 등록하고 NEXT_PUBLIC에는 절대 두지 않음.
3. 새 서버 API를 배포하되 쓰기 기능은 비활성 상태 유지. executor 두 함수 호출과 A/B claims 격리를 staging에서 확인.
4. 모든 외부 v1 caller 중단/전환 확인 후 v1 외부 EXECUTE 회수. 기존 테이블/RLS/Storage 변경 불필요. 통합 배포가 아니면 v1 개방 기간이 남는다는 점을 명시.
5. 검증 완료 뒤 별도 승인으로 쓰기 기능 활성화. 롤백은 쓰기를 비활성화하고 조회 전용으로 복귀. 장애 때문에 자동으로 v1/service_role 경로를 열지 않음. 역할/함수 제거·ACL 복구는 별도 검토하며 사용자 기록/보상은 삭제하지 않음.

## 공식 근거

- [PostgreSQL Windows 배포](https://www.postgresql.org/download/windows/), [EDB ZIP 바이너리](https://www.enterprisedb.com/download-postgresql-binaries): 설치 없이 사용할 수 있는 바이너리 경로.
- [Supabase DB 연결](https://supabase.com/docs/guides/database/connecting-to-postgres): direct/shared pooler 연결 및 custom role 연결 방식. 네트워크 IPv4/IPv6와 풀 모드를 배포 환경에 맞춰 확인.
- [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys): elevated key의 service_role/RLS 우회 특성.
- [PostgreSQL REVOKE](https://www.postgresql.org/docs/current/sql-revoke.html): 소유자·역할 권한 관계.
- [PostgreSQL 날짜/시간](https://www.postgresql.org/docs/current/functions-datetime.html): now()의 transaction timestamp와 clock_timestamp()의 차이.
