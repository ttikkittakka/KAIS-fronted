# 003 적용 전 안전성 검토

2026-10-19. 원격 Supabase에 접속하거나 SQL을 실행하지 않았다. 변경 대상은 003 SQL과 검증용 파일뿐이다. 001·002, 사용자 기록, 앱 코드, UI, 햇살 정책, 캐릭터, Rive 및 로컬 저장소는 변경하지 않았다.

판정: 로컬 PostgreSQL 검증 및 정적 검토 통과. 아래 사전 조건이 충족되면 003 단독 적용 가능하다. 실제 프로젝트의 스키마·권한 일치, 실제 Auth 가입 및 다중 연결 동시성은 원격 실행을 하지 않아 미검증이다. 앱의 DB 저장 전환까지 완료했다는 뜻은 아니다.

## 수정 내용

- Auth 트리거 생성 전에 `sprout`, `default-sky`, `background` 기본 카탈로그를 검사한다. 002 누락 상태에서 설치가 성공한 뒤 가입이 실패하는 상황을 차단한다.
- `onestep_save_writing()`에서 NULL 날짜·revision, 음수 revision, NULL 글, 길이 초과를 명시적으로 거부한다. NULL을 빈 문자열로 바꾸거나 초과 글을 자르지 않는다. 기존 글 삭제는 명시적인 `''` 입력으로만 가능하다.
- 회고 답변의 1차원·1 기반 배열 형태를 먼저 검사하여 다차원 배열이 `array_position()` 내부 오류로 실패하지 않게 한다. 답변별 허용 값은 기존 001 CHECK가 최종 검증한다.

## 항목별 결과

| 항목 | 결과 및 범위 |
| --- | --- |
| 1. 신규 가입 | `auth.users AFTER INSERT`에서 `NEW.id` 사용. JWT나 수정 가능한 사용자 메타데이터에 의존하지 않는다. `SECURITY DEFINER`와 빈 search_path로 소유자 권한에서 실행한다. 모의 `supabase_auth_admin`에 Auth INSERT만 허용한 테스트 통과. 실제 이메일/OAuth 가입은 적용 후 별도 확인 필요. 트리거 오류는 가입 트랜잭션까지 실패시킨다. |
| 2. 기존 계정 | 003 적용 자체는 기존 계정을 일괄 변경하지 않는다. 로그인 JWT의 `auth.uid()`로만 초기화하며 FK로 실제 Auth 사용자 존재를 확인한다. 반복 호출은 기존 잔액·기록·배치·revision을 덮어쓰지 않고 누락 기본값만 추가한다. 활동 기록이나 보상은 생성하지 않는다. |
| 3. 초기화·동시성 | 초기화는 삭제/리셋이 아니다. 모든 공개 쓰기 RPC는 계정 상태 조회·변경 전에 동일한 사용자 UUID 해시의 transaction advisory lock을 획득한다. 커밋/롤백까지 유지되고 자동 해제된다. 같은 사용자 호출을 직렬화하며 해시 충돌은 대기 증가만 유발한다. 기본 READ COMMITTED 전제. 단일 연결 PGlite로 실제 두 연결의 대기·경합까지 검증한 것은 아니다. |
| 4. 보상·구매 | 보상은 하루 reflection 10 + participation 5 + firstCare 10, 최대 25. 사용자/이벤트 PK와 사용자/날짜/사유 UNIQUE가 중복 지급 차단. INSERT 성공 때만 잔액 증가. 구매는 서버 가격·잔액·소유 검사 후 원장/영수증/인벤토리/잔액을 한 트랜잭션에서 갱신한다. 재구매는 잔액만 반환한다. 잔액 부족 및 중간 인벤토리 실패 시 전부 롤백하는 테스트 통과. |
| 5. 글 저장 | note 300, photo_comment 100의 PostgreSQL 문자 수 제한. 초과/NULL은 명시적 오류, 없는 날짜/오래된 revision은 40001. 과거 기록도 소유자와 revision이 맞을 때 글 필드만 수정. 실패 시 전체 행 보존, 성공 시 답변·단계·사진 ID·보상 보존. NULL은 부분 수정 의미가 아니므로 두 글 필드를 모두 전달해야 한다. |
| 6. 권한 상승 | authenticated에 자기 계정용 RPC 5개만, service_role에 commit RPC 2개만 허용. anon/PUBLIC은 실행 불가. private 함수 직접 실행 및 schema 접근 차단. 함수가 빈 search_path와 정규화된 테이블 참조를 사용하고, 사용자용 RPC는 임의 user_id를 받지 않는다. 함수 소유자는 신뢰된 postgres여야 한다. |
| 7. 완료 조작 | 일반 사용자는 완료 테이블 직접 수정 및 commit RPC 호출 불가. 단계 순서를 검사하고 당일 실제 추천된 care만 완료 가능. 같은 care 재호출·다른 care 완료·회고 재제출에도 첫 돌봄 보상은 한 번만 지급한다. 회고 수정으로 추천 목록/제목을 다시 뽑지 않는다. 실제 행동 수행 자체를 DB가 증명하는 것은 아니다. |
| 8. 성장 호환 | RPC로 생성 가능한 기록에서는 회고 완료 후 stage != checkin이 활동일이며 날짜당 PK로 중복 집계하지 않는다. 미래 날짜 제외, 50/100일 보상은 한 번만 부여. daily plant_state/완료 care와 누적 growth_stage는 별개이며 Rive 입력을 변경하지 않는다. 로컬 코드와 50/100 경계 테스트 통과. |
| 9. 기록 전체 삭제 | 이번 적용의 선행 조건이 아니다. 삭제 RPC를 추가하지 않는다. 보상 원장의 기록 FK가 보상 기록 단순 삭제를 막는다. 후속 작업에서 햇살/구매/성장 보존 정책 및 Storage API 파일 삭제·재시도 설계가 필요하다. 서비스 키로 테이블 DELETE를 우회 구현하면 안 된다. |
| 10. 적용 조건 | 001/002의 실제 스키마·카탈로그·ACL 일치, postgres 실행, 함수/트리거 이름 충돌 없음. 004 및 사진 버킷은 003 적용에 불필요하다. 아래 순서와 SQL 사용. |

## 운영 경계와 호환성 주의점

- `service_role`은 001에서 직접 DML 권한과 BYPASSRLS를 가진 신뢰 경계다. 임의 서버 DML은 advisory lock 및 보상 규칙을 우회할 수 있다. 클라이언트에 서비스 키를 노출하지 말고, 정상 변경은 RPC로 통일해야 한다. 잠금을 따르는 RPC끼리의 동시성 보장이다.
- `onestep_commit_reflection(p_user, ...)` / `onestep_commit_activity(p_user, ...)`는 신뢰된 서버 전용이다. 서버가 Auth로 JWT를 검증해 user_id를 결정하고 기존 `recommendCares/ensureCareHistory`로 추천을 계산해야 한다. 요청 본문의 user_id/추천/완료 상태를 그대로 전달하는 엔드포인트는 안전하지 않다. 현재 앱에는 해당 RPC 호출 연결이 없으며 이번에 추가하지 않았다.
- 로컬 활동일 계산은 완성 답변 또는 유효 완료 care를 인정하고, 로컬 날짜를 유지한다. SQL은 서울 날짜를 사용한다. 정상 RPC 상태에서는 동일하지만, 과거 로컬의 care-only 기록·다른 시간대·무보상 구버전 기록을 그대로 가져오는 경로까지 호환되는 것은 아니다. 데이터 가져오기/소급 지급은 이번 범위에 없다.
- PostgreSQL `char_length`는 Unicode 문자 수, 기존 JS `.length`는 UTF-16 단위 수라 일부 이모지는 다르게 센다. 기존 001의 300/100 제한을 유지했으며 앱은 수정하지 않았다. 이후 DB-앱 연결 시 글자 수 기준을 통일할 필요가 있다.
- `now()`는 트랜잭션 시작 시각이다. 자정 직전 시작된 요청이 잠금 대기 후 자정을 지나도 시작 날짜에 처리된다. 서버가 임의 보상 날짜를 받지는 않는다. 트랜잭션은 짧게 유지하고 40001 발생 시 최신 상태를 조회해 재시도해야 한다.

## 적용 및 확인 순서

1. SQL Editor에서 postgres 역할로 `tests/garden_003_preflight.sql` 전체 실행. 이 파일은 읽기 전용이며 기대 결과가 주석에 있다. 001 차이가 의심되면 기존 `inspect_garden_schema.sql`로 제약/권한을 비교한다. 불일치 또는 이름 충돌이 있으면 적용하지 말고 먼저 확인한다.
2. `migrations/202610160003_garden_functions.sql` 전체를 한 번 실행한다. BEGIN~COMMIT과 마지막 REVOKE/GRANT를 포함해야 한다. 이미 적용한 001/002는 재실행하지 않는다. 이 파일은 CREATE 기반이므로 재적용용이 아니다. 실패하면 ROLLBACK 후 원인을 확인한다.
3. `tests/garden_003_verify.sql` 전체 실행. 함수 13개의 pass가 모두 true, 트리거 1개가 enabled, private schema 권한이 모두 false, 잔액 불일치가 0행이어야 한다.
4. 선택적으로 `tests/garden_003_existing_user.sql`의 UUID를 기존 테스트 계정 UUID로 교체하고 전체 실행한다. 기존 사용자 초기화 경로를 확인한 후 ROLLBACK하므로 데이터는 남기지 않는다. SQL Editor의 postgres 세션 자체에는 사용자 JWT가 없으므로 단순 `select onestep_ensure_garden()`만 실행하면 인증 오류가 정상이다.
5. 실제 신규 가입은 정상 Auth 경로로 테스트 계정을 만들어 확인한다. 가입 성공 후 해당 사용자에 profiles/gardens 각 1행, 기본 소유 2개, 배경 배치 1개, 햇살/활동일 0인지 확인한다. 다른 기존 Auth 트리거도 영향을 줄 수 있어 모의 DB 테스트만으로 이 단계가 보장되지는 않는다.

두 연결 동시성 추가 검증은 개발 DB에서 별도 수행한다. 연결 A에서 BEGIN 후 `pg_advisory_xact_lock(hashtextextended('<테스트 UUID>',0))`을 획득하고, 연결 B에서 동일 UUID의 JWT context와 authenticated 역할로 ensure RPC를 호출하면 A 종료까지 대기해야 한다. `SET LOCAL lock_timeout='2s'`로 55P03을 확인한 뒤 양쪽 ROLLBACK한다. 이후 동일 계정의 구매/보상 두 호출을 병렬 실행하여 원장·영수증·차감이 각각 한 번인지 확인한다. PGlite의 단일 연결 Promise 병렬 호출을 이 검증의 대체로 주장하지 않는다.

## 로컬 검증

명령: `node --test scripts/garden-functions.test.mjs scripts/garden-database.test.mjs scripts/garden-schema-review.test.mjs`

결과: 10개 테스트 통과, 실패 0개. 최초 전체 실행 9개 통과 후 보상 롤백/추천 재추첨 차단 테스트를 추가했으며, 수정한 추가 테스트 파일 4개를 다시 실행해 모두 통과했다. 기존 회귀 테스트 6개도 통과한 상태다. 사전/사후 검증 SQL의 실행과 사후 함수 권한 13개 pass, 기존 계정 smoke SQL의 ROLLBACK도 로컬 테스트로 확인했다.

PGlite PostgreSQL 17.5에서 실제 001~004 SQL을 실행한 회귀 테스트와 001~003만 사용하는 추가 테스트를 실행했다. Auth/Storage는 로컬 모의 스키마이며 외부 네트워크 및 실제 사용자 데이터는 사용하지 않았다. 신규 테스트는 기존 계정, Auth 역할 트리거, NULL/길이/낡은 revision, 과거 기록 보존, 카탈로그 누락 시 원자적 중단, RPC별 ACL 및 중복 적용 실패를 검증한다. 기존 테스트는 사용자 격리, 중복 보상, 추천 조작 차단, 구매 롤백, 50/100일 성장 등을 검증한다.

근거: [Supabase Auth 사용자 트리거](https://supabase.com/docs/guides/auth/managing-user-data), [Supabase 함수 권한 및 SECURITY DEFINER](https://supabase.com/docs/guides/database/functions), [PostgreSQL transaction advisory lock](https://www.postgresql.org/docs/17/explicit-locking.html).

## 추가 권한 확인 (2026-10-19)

추가 요청의 6개 항목 검증 결과: 적용용 003 SQL에 수정이 필요한 권한 문제는 발견하지 않았다. 003은 그대로 유지하고 테스트 및 읽기 전용 사전 점검을 보강했다. 전체 테스트를 다시 실행해 **12개 통과 / 실패 0개**를 확인했다.

1. `authenticated → public.onestep_ensure_garden() (SECURITY DEFINER, postgres) → onestep_private.require_user() (SECURITY INVOKER) / ensure_garden()` 순서다. 내부 require_user의 invoker는 이 시점의 postgres이며 최초 클라이언트 역할이 아니다. private USAGE/EXECUTE를 클라이언트에 추가할 필요가 없다. 직접 private 호출은 42501로 차단됨을 확인했다.
2. `auth.uid()`는 현재 DB 역할 이름이 아니라 요청 JWT 설정에서 UUID를 얻는다. SECURITY DEFINER로 유효 역할이 바뀌어도 요청 설정은 유지된다. 기존 sub 설정 방식 외에 JSON `request.jwt.claims` 모의 helper도 검증했다. JSON sub가 내부 require_user까지 전달되고, claims 누락은 42501로 거부됐다. 실제 프로젝트의 auth.uid 정의는 읽기 전용 preflight 출력으로 확인하며 변경하지 않는다.
3. `supabase_auth_admin`에 private schema USAGE와 trigger function EXECUTE가 없는 상태에서도 Auth INSERT 트리거가 정상 실행됐다. 이 함수는 Auth Hook의 직접 RPC 호출이 아니라 DB AFTER INSERT 트리거다. 생성은 소유자 권한으로 수행되고 트리거 본문은 함수 소유자 권한으로 실행된다. Auth 관리자에게 OneStep 테이블 쓰기 권한을 추가할 필요가 없다.
4. 기존 로그인 계정으로 공개 ensure RPC를 반복 호출해 자신의 정원만 읽히고 초기화가 정상 수행됨을 확인했다. 직접 테이블 INSERT와 private helper 호출은 거부된다.
5. 기본 테스트에서 13개 함수의 postgres 소유 및 ACL을 확인했다. PGlite의 bootstrap postgres는 SUPERUSER를 제거할 수 없으므로, 별도 `permission_test_owner`에 동일한 테이블·스키마·함수 소유 관계를 구성하고 NOSUPERUSER/NOBYPASSRLS 조건도 추가 검증했다. 테이블 소유자는 FORCE RLS가 없는 001 테이블의 RLS를 우회하여 내부 쓰기를 수행하고, 호출 종료 후 authenticated의 자기 행 SELECT 정책은 그대로 적용된다. SECURITY DEFINER 자체가 모든 RLS를 무조건 무시하는 것은 아니며 소유 관계/역할 권한이 근거다.
6. 마지막 GRANT 이후 COMMIT 직전에 의도적으로 0 나누기 오류를 삽입한 로컬 복사본을 실행했다. ROLLBACK 후 003 함수·트리거가 하나도 남지 않고 001/002 스키마 권한 및 기존 Auth 계정이 보존됨을 확인했다. 실제 적용은 반드시 BEGIN부터 COMMIT까지 전체 파일을 실행해야 한다.

실제 Supabase의 권한·Auth 서비스·JWT 검증기는 실행하지 않았다. 위 결과는 로컬 PostgreSQL 역할 모델과 공식 동작 규칙에 대한 검증이며 실제 프로젝트 상태 확인을 대체하지 않는다. 사전 SQL에 postgres의 private/auth schema 접근, auth.uid 실행, Auth 트리거 생성 권한 및 authenticated의 public schema 접근 확인을 추가했다. 기대값은 모두 true다.

추가 근거: [PostgreSQL SECURITY DEFINER와 안전한 함수 권한](https://www.postgresql.org/docs/17/sql-createfunction.html), [PostgreSQL 트리거 생성 권한](https://www.postgresql.org/docs/17/sql-createtrigger.html), [Supabase Auth 관리자 및 트리거 권한 오류 설명](https://supabase.com/docs/guides/troubleshooting/dashboard-errors-when-managing-users-N1ls4A).
