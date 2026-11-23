# 3B 운영 적용 준비 및 실제 계정 기능 로드맵

?? ???????? ??? [PHASE3B_PREAPPLY_REVIEW.md](PHASE3B_PREAPPLY_REVIEW.md)? ????. ?? ? get_day/draft GRANT? ?? ??? ??? ?? ?? authenticated ?? ??? ????.

> 최신 판정은 아래 **3A~3F 통합 준비 재점검** 절을 따른다. 이전 '3C 개발 착수' 항목은 역사적 단계 설명이며 현재 3A~3F 코드/283개 로컬 회귀는 완료됐다. 운영 적용/활성화는 여전히 보류다.

> 이후 코드 보완: 문서 마지막 **단일 스냅샷 어댑터 구현 후 상태**에서 get_day 어댑터 미구현 항목을 갱신했다. 운영 호출/SQL/권한은 아직 활성화하지 않았다.

2026-11-13. 대상: yhzgucbiwvizjxpzwpqg. 발표는 중간 일정이며 목표는 지속 사용 가능한 계정 기반 앱이다. 발표 전용 모드/임시 데이터 초기화/인증 우회는 개발 범위에 추가하지 않는다. 이 문서는 기존 PHASE3B_SERVER_CONNECTION.md의 연결 설계와 기존 SQL/검증을 재사용하는 적용 게이트다. 운영 변경·credential 발급 미승인.

## 재사용할 산출물과 증거

- phase3b.sql: get_day, save_reflection_draft, commit_reflection_v2, commit_activity_v2. 기존 13개 테이블/RLS/Storage 정책 변경 없음.
- phase3b-permissions.sql: NOLOGIN executor, 두 v2 실행 허용, v1 외부 실행 회수. owner postgres의 내부 호출 유지.
- phase3b-login.sql: 비밀번호 없는 NOLOGIN provisioning skeleton. 승인 후 별도 비공개 password 설정과 LOGIN 활성화 필요.
- PGlite 9개 검증 및 native PostgreSQL 17.12 독립 연결 경쟁/권한 실험은 기존 증거를 사용한다. 이번에는 다시 실행하지 않았다.
- 이번에는 운영 metadata SELECT와 공식 Supabase 문서 확인, 문서/차단 장치 검토만 했다. 신규 계정·비밀번호·키를 생성하지 않았다.

## 실제 Supabase 호환성: 확인과 한계

이번 SELECT 결과: DB 이름 postgres, server_version_num=170011(PostgreSQL 17.11). postgres 역할은 SUPERUSER=false, CREATEROLE=true, CREATEDB=true, BYPASSRLS=true. 계획한 executor/login 역할 없음, 신규 4함수 0개. public schema의 PUBLIC ACL은 USAGE이며 CREATE는 발견되지 않았고 auth schema PUBLIC ACL은 발견되지 않았다. 이것은 함수/테이블/DB/상속 권한 전체 감사의 대체가 아니다.

Supabase 공식 문서는 custom DB role과 shared pooler의 `<ROLE>.<PROJECT_REF>` username을 지원한다. 현재 PG17은 GRANT의 INHERIT/SET/ADMIN 옵션을 지원한다. 초안은 SUPERUSER/BYPASSRLS를 새 역할에 요구하지 않는다. 따라서 구조상 호환되지만, Supabase의 제한된 관리자와 관리 확장 하에서 CREATE ROLE, GRANT membership, role timeout, password provisioning이 실제로 성공하는지는 별도 승인된 staging에서 확인해야 한다. CREATEROLE만 조회했다고 운영 전체 DDL을 통과했다고 보고하지 않는다. 17.11 대 17.12 차이는 기록하고 기존 9개/경쟁 suite를 무조건 반복하지 않는다. 관리 환경과 새 LOGIN/pooler에 한정한 검증을 추가한다.

## 서버와 Android의 독립 결정

Android 클라이언트 선택과 Next.js API 호스팅은 분리한다. Compose 앱 보존, Capacitor/Compose 전환 및 UI 재작성 없음. 웹/Android는 고정 HTTPS API 계약을 사용한다. Secret/DB credential은 서버에만 존재하며 어느 Android 방식에도 포함하지 않는다. 로컬 기록·사진·DataStore를 계정에 자동 이전/삭제하지 않는다.

서버리스/수평 확장이면 Node.js + shared Transaction Pooler를 추천한다. 상시 Node 서버이면 Direct(네트워크 조건 충족) 또는 Session Pooler도 가능하다. 아직 배포처 미정이므로 endpoint/region/IP/TLS/client/backend budget은 미확정. Vercel 도입을 승인받았다고 간주하지 않는다.

조회는 기존 사용자 JWT 클라이언트와 RLS를 유지한다. 확정 두 RPC만 최소 LOGIN → executor → postgres SECURITY DEFINER로 실행한다. 이 쓰기 경로는 RLS만으로 보호되는 것이 아니라 매 요청 getUser 검증, auth.uid 필터, 좁은 EXECUTE 권한으로 보호된다. compromised DB credential은 subject GUC를 위조할 수 있으므로 최소 권한이라도 비밀 보호/회전/감사가 필요하다.

## Transaction Pooler 승인 기준

- Auth getUser 및 issuer/sub/role/expiry 검증 완료 후 연결 취득. 요청 userId/role/claims는 권한 판단에 사용하지 않음.
- 같은 checked-out pg client에서 BEGIN READ COMMITTED → SET LOCAL ROLE executor → 두 sub GUC 파라미터 설정 → 고정 v2 SQL → COMMIT. pool.query로 단계를 흩어 실행하지 않음.
- 실제 auth.uid는 개별 request.jwt.claim.sub 우선, JSON request.jwt.claims fallback이다. 두 값 모두 같은 verified user.id로 매번 덮어씀. JWT 원문을 DB에 전달할 필요 없음.
- SET LOCAL timeout 및 transaction advisory lock만 사용. SESSION role/claims/lock, backend 고정 가정, named prepared statement 사용 금지.
- COMMIT/ROLLBACK 응답 확인 전 연결 반환 금지. 통신 실패/rollback 실패/결과 미상 연결 폐기. COMMIT 결과 미상은 저장 실패로 단정하지 않고 해당 날짜 조회 후 판단.
- TLS hostname/CA 검증 켬. rejectUnauthorized:false 금지. pg ssl 객체와 connectionString ssl 옵션 충돌 방지.
- 실제 선택한 Supavisor 환경에서 A 성공→B, A 오류→B, A 취소→B, claims 미설정 요청 거부, 두 GUC 불일치 방지, role 복원, expiry 확인. 구체적 절차는 SERVER_CONNECTION 문서에 있다. 이것이 새로 필요한 검증이며 기존 native lock 테스트의 반복이 아니다.
- 앱 인스턴스 수×pool.max, Supavisor client/backend 한도, 역할별 pool 및 회전 중 두 login을 함께 산정. CONNECTION LIMIT 4와 max=2는 초안 초기값이지 운영 전역 한도 보장이 아님.

## 적용 전 체크리스트

현재 체크되지 않은 항목은 미완료/미검증이며 수행 승인으로 해석하지 않는다.

- [x] 기존 핵심 SQL·권한·트랜잭션·멱등성 검증 결과 확보.
- [x] SQL 원본의 실행 차단 예외 및 ROLLBACK 유지.
- [x] 운영 PG 버전/관리 역할 능력/신규 객체 미설치 상태 확인.
- [ ] 서버 배포처·리전·fixed API domain·네트워크 경로 확정.
- [ ] Dashboard Connect에서 정확한 shared pooler 모드/hostname/port/DB 이름 확인(비밀번호 공유 불필요).
- [ ] 연결 한도·TLS/CA·private credential 관리 주체 및 회전 책임자 확정.
- [ ] Edge Functions 및 외부 배치/다른 앱의 v1 caller 목록 확인. 이전 MCP -32600 오류로 Edge 목록은 미검증; 없다고 추정하지 않음. 이전 src/DB 직접 참조 0건, cron.job 없음은 외부 부재 증거가 아님.
- [ ] 승인된 별도 Supabase staging에서 제한된 postgres 관리자에 의한 새 role/membership/login DDL과 실 pooler 경로 검증.
- [ ] staging에서 새 LOGIN의 직접 DML/v1/다른 privileged RPC 거부 및 상속/PUBLIC 권한 확인. 추가 권한이 발견되면 영향 검토 없이 RLS나 광범위 PUBLIC 권한을 바꾸지 않음.
- [ ] 운영 반영 직전 기존 함수 정의·시그니처·ACL·트리거·제약·정책과 승인본 비교. 동명 overload/역할 충돌이면 중지, CREATE OR REPLACE로 덮어쓰지 않음.
- [ ] 기존 데이터 정합성 검사 범위와 백업/복구 준비 확인. 백업/PITR 활성 상태를 플랜명만으로 추정하지 않음. 사용자 데이터 snapshot/검사는 별도 승인된 최소 범위에서 수행.
- [ ] 관리 DDL/GRANT에 의한 이벤트 트리거·기본 권한의 예상 밖 효과 확인 및 신규 함수 ACL 검증.
- [ ] 버전이 고정된 승격 migration 파일·체크섬·단계별 실패 처리·권한 rollback 검토 완료. draft의 guard 제거는 지금 하지 않음.
- [ ] 운영 migration과 credential provisioning 각각 명시적 승인.

## 안전한 전환 순서

1. staging에서 새 adapter/권한/LOGIN/pooler 검증. 앱 쓰기는 비활성 상태이며 기존 계정 조회는 유지한다. 기능 비활성은 안전한 점진 배포이며 인증 우회나 발표 모드가 아니다.
2. 운영의 외부 v1 writer 중지/drain, 기존 함수/ACL 스냅샷 및 복구 계획 확보. 읽기 서비스는 유지.
3. 승인된 base migration(4함수)을 설치하고 sealed ACL 검사 완료. executor GRANT를 이 검사보다 앞서 실행하지 않음.
4. 별도 permissions 트랜잭션에서 executor 생성/두 v2 GRANT와 v1 외부 REVOKE를 원자적으로 적용. 두 함수의 postgres 소유권을 유지하여 nested 호출이 가능하게 함.
5. login skeleton 적용 → 비공개 password provisioning → LOGIN 허용 → TLS/접속/role read-only 확인. 실패하면 쓰기는 비활성 상태 유지. managed pooler 인증 지연/캐시는 검증 필요.
6. 승인된 범위의 계정 검증 후 3C부터 점진 활성화. v1/service_role fallback 금지. 실제 사용자 계정에 자동 테스트 데이터를 쓰지 않음.
7. 장애 시 쓰기 중단·drain·조회 유지. additive 함수는 우선 미사용 상태로 남기며 저장된 기록·보상은 지우지 않음. 계정 전체 DB restore를 보통의 rollback 수단으로 사용하지 않음. v1 ACL 복구는 별도 검토/승인 없이는 하지 않음.

## 사용자/운영 관리자가 설정할 항목

설정은 아직 실행하지 않는다. 승인 뒤 Dashboard에서 target project, Connect endpoint, SSL 안내, database pool/client 한도, backup 상태, Edge Functions 목록을 확인한다. 역할 관리는 SQL Editor 또는 승인된 관리 연결에서 검토본을 적용한다. 프로젝트 기본 postgres 비밀번호나 API Secret을 앱용으로 재사용/재설정할 필요 없음.

password는 관리자가 안전한 입력 경로에서 생성·지정하고 서버 호스팅 secret manager에만 저장한다. SQL 파일/채팅/SQL snippet history/로그/.env 커밋/NEXT_PUBLIC/Android에 남기지 않는다. Supabase Edge Secrets에 저장하는 것만으로 별도 Next.js 호스팅에 전달되는 것은 아니다. PAT는 관리 API용이며 앱 인증·DB 로그인에 쓰지 않는다.

회전은 login_v1→login_v2 새 세대 생성, 동일 최소 executor 멤버십, 새 TLS 연결 확인, 서버 secret 교체/재배포, 구 인스턴스 drain, old role NOLOGIN 및 membership 회수, 남은 세션 확인 후 승인된 범위로 종료 순서다. NOLOGIN/비밀번호 변경이 기존 세션을 종료한다고 가정하지 않는다. 두 세대 기간의 연결 예산과 유출 사고 시 즉시 회수 절차를 마련한다.

## 3C로 넘어갈 명확한 완료 기준

**개발 착수**: 이번 설계/DTO/SQL 계약을 기준으로 3C 코드 작성은 별도 승인 후 가능하다. 서버 연결 환경 미확정 때문에 앱 UI 전체나 Android를 재작성할 필요는 없다.

**실제 계정 활성화**: 위 체크리스트, 운영 적용·credential 승인/설정, 새 pooler claims 격리와 TLS 검증, 4함수 및 v1/v2 ACL 설치 후 확인, 기존 계정 조회 무회귀, 복구 절차 준비가 모두 완료돼야 한다. staging 성공만으로 실제 계정 쓰기를 자동 활성화하지 않는다. 3C의 start_day/draft 자체는 사용자 JWT를 사용할 수 있지만, 뒤 단계까지 검증되지 않은 상태를 전체 3B 완료로 보고하지 않는다.

## 유지할 구현 순서: 3C–3F 및 이후

| 단계 | 실제 계정 기능 | 완료 기준 |
| --- | --- | --- |
| 3C | get_day 단일 snapshot 조회 adapter, onestep_start_day, 질문별 save_reflection_draft | 질문별 저장/복원, 같은 계정·날짜 직렬화, revision 충돌 재조회, 보상/추천/활동일 무변경, 로컬 저장/정리 미호출 |
| 3D | 기존 추천 알고리즘을 서버에서 실행하고 commit_reflection_v2로 확정 | 답변·최근 기록·결정 규칙 parity, 첫 추천 3개 고정/복원, 돌아보기 10 한 번, 완료 후 재확정 차단 |
| 3E | commit_activity_v2 단계 진행·돌봄 완료·참여/첫돌봄 보상 | 10+5+10 최대25, 실패 시 완료/Rive 확정 안 함, 재시도 재지급/재생 없음, 계정/날짜 혼입 차단 |
| 3F | onestep_save_writing 글 작성/수정, 기록 화면·오류 복구 통합 | expected revision 충돌 시 사용자 입력 메모리 보존/서버 재조회, 새로고침/다중 탭/자정/로그아웃 일관성 |

위 단계 구분은 이번 운영 준비의 작업 단위다. 서버-클라이언트 계약 및 기존 UI·추천·Rive 동작을 유지하며 실제 계정 저장으로 교체한다. 날짜는 서울 DB 트랜잭션 시작일, 자정 후 응답은 해당 날짜로 표시하고 오늘 별도 조회. HTTP 시작일/기기 날짜로 재귀속하지 않는다.

후속 범위는 삭제하지 않는다:

- 상점 구매: 서버 가격/잔액/소유권, 원자 차감·인벤토리 지급, 중복 구매 멱등성.
- 인벤토리·배치: 계정별 서버 조회, 소유 아이템/슬롯 검증, layout revision 충돌 처리.
- 성장 보상: 기존 reflection RPC가 이미 sync_growth를 호출하므로 3D 활성화 전 50/100일 경계의 실제 효과와 중복 방지를 확인. 보상 조회/확인·배치 UI 연결은 후속 단계이며 기존 지급을 임의로 끄거나 규칙을 바꾸지 않음.
- 사진 Storage: private bucket/사용자 소유 경로·사진 metadata·예약/첨부/교체/retire 수명주기. 기록 revision과 연계하고 다른 계정 조회 차단. 기존 로컬 IndexedDB 사진 자동 업로드/정리 금지.

## 현재 판정

로컬 검증 기반 설계 준비 완료. 운영 환경 적용 준비는 일부 미완료이며 **실제 migration/provisioning은 보류**. 남은 핵심은 배포 환경, managed 관리자/LOGIN/pooler 검증, Edge/외부 caller 확인, 승인된 백업·ACL 복구 및 운영 적용 승인이다. Android 선택이나 발표 날짜가 이 보안 게이트를 생략할 근거가 되지 않는다.

공식 근거: [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles), [관리 역할 제한](https://supabase.com/docs/guides/database/postgres/roles-superuser), [연결/custom role](https://supabase.com/docs/guides/database/connecting-to-postgres), [연결 한도](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits).

## 3A~3F 통합 준비 재점검

대상 yhzgucbiwvizjxpzwpqg. 수집 시각·원문 메타데이터·SQL 초안 SHA-256은 [PHASE3_INTEGRATION_METADATA.json](./PHASE3_INTEGRATION_METADATA.json)에 보존했다. 사용자 행/이메일/토큰/비밀번호는 수집하지 않았다. 이 파일은 비교 증거이며 실행 가능한 복원 백업이 아니다. 이번 변경은 이 문서와 메타데이터 JSON뿐이다. 마이그레이션·API·UI·Rive·Android·환경변수·로컬 기록은 변경하지 않았다. 전체 테스트와 이전 독립 PostgreSQL 검증은 반복하지 않았다.

### 실제 운영에서 확인한 항목

- MCP project URL 일치, 로컬 MCP 설정 read_only=true/target 일치, 실행 SQL의 transaction_read_only=on. PostgreSQL 17.11.
- public 13개 테이블: profiles, gardens, daily_records, daily_cares, sunshine_ledger, purchases, inventory, growth_grants, placements, item_catalog, care_catalog, slot_catalog, photos(모두 onestep_ 접두사). RLS 모두 enabled, FORCE RLS는 false. definer/관리 역할까지 RLS로 제한된다고 해석하지 않는다.
- 74개 컬럼, 69개 제약, 19개 인덱스 조회. 3B에서 사용하는 날짜/답변 배열/단계/revision/추천/원장 컬럼 존재. 사용자·날짜·돌봄 PK/FK, 순서 1~3 유일성, 원장 (user,event_key)/(user,date,reason) 유일성, 10/5/10 CHECK, note/comment 300/100, profiles timezone='Asia/Seoul' CHECK 확인. 파괴적 스키마 변경이 필요한 불일치는 발견하지 않았다.
- 13개 SELECT 정책: 사용자 테이블은 auth.uid()=user_id, 카탈로그 3개는 로그인 사용자 읽기. pg_class ACL 및 has_table_privilege로 authenticated SELECT=true/INSERT·UPDATE·DELETE=false, anon SELECT=false 확인. information_schema.role_table_grants는 조회 역할 가시성 때문에 빈 결과여서 단독 근거로 사용하지 않았다.
- public 앱 RPC 10개, private helper 7개 확인. 모두 postgres 소유. require_user를 제외한 대상 함수는 SECURITY DEFINER, search_path 빈 값. 신규 get_day/draft/v2 두 개는 아직 0개.
- 의존 함수 start_day, save_writing, commit_reflection, commit_activity, require_user, ensure_garden, today, award, sync_growth 총 9개 본문을 CR 제거 후 local 003 함수 본문과 대조해 9/9 일치. ACL/시그니처는 JSON에 별도 보존했다. 원문 전체 헤더/DDL이 동일하다는 뜻은 아니다.
- v1 확정/활동은 service_role EXECUTE=true, authenticated/anon=false. start_day/writing/ensure_garden/buy/layout/사진 RPC는 authenticated EXECUTE=true. 신규 전용 executor 및 onestep_* LOGIN 역할은 없음.
- 앱 테이블의 비내부 트리거는 발견되지 않았고 auth.users의 onestep_new_auth_user 트리거 확인. 관리 이벤트 트리거 6개 존재. 신규 DDL이 실제 managed 환경에서 예상 ACL을 갖는지는 staging 확인 필요.
- postgres/public default ACL은 신규 함수에 anon/authenticated/service_role EXECUTE를 부여한다. 초안의 REVOKE와 최종 sealed ACL 검사는 반드시 같은 트랜잭션에 유지해야 한다. 현재 조사한 비시스템 SECURITY DEFINER의 PUBLIC EXECUTE는 발견되지 않았다.
- DB 함수 본문 검색에서 v1을 호출하는 다른 함수 0개, cron.job 미설치. 소스 src의 v1 직접 호출 0개(고정 SQL은 v2). 테스트/로컬 SQL/검증 probe 참조는 존재하며 운영 caller로 세지 않았다. 동적 외부 호출이 없다는 증명은 아니다.
- Edge Functions list는 `MCP -32600: You do not have permission to perform this action`으로 실패. HTTP 상태 코드는 도구가 제공하지 않았다. Edge/외부 배치/다른 저장소 caller는 미검증이며 '없음'으로 판정하지 않는다.

### API ↔ RPC 계약 대조

| 단계 | 코드가 사용하는 실제 계약 | 판정 |
|---|---|---|
| 3C 시작 | onestep_start_day() → date, 사용자 JWT | 운영 함수와 일치, 앱 잠금 false |
| 3C 초안 | onestep_save_reflection_draft(date,text[],bigint) → changed/revision/date | 3B 초안과 일치, 미설치 |
| 3D 확정 | onestep_commit_reflection_v2(date,text[],text[],text,bigint) | 순서·형식 일치, 검증된 user.id는 LOCAL claims, 미설치/실 풀 미연결 |
| 3E 활동 | onestep_commit_activity_v2(date,text,text,bigint) | photo/growth care=NULL, care_done 추천 ID; v2 revision+1/no-op와 일치 |
| 3F 글 | onestep_save_writing(date,text,text,bigint) → bigint | 운영 함수와 일치, 두 필드 동시 저장/40001 충돌 |
| 3A 공통 읽기 | 현재 네 개 PostgREST SELECT | **get_day 단일 snapshot 연결 미구현** |

따라서 '모든 통합 계약이 완전히 준비됐다'고 판정하지 않는다. `onestep_get_day`는 garden 객체를 반환하고 앱은 project/sunshineBalance를 요구한다. 활성화 전에 userId/date/garden 소유권을 검증해 project를 추가하고 garden.sunshine_balance를 매핑하는 adapter가 필요하다. 네 SELECT는 개별 요청이므로 저장 도중 기록/완료/원장/잔액의 시점이 다를 수 있다. 현재 schema 검증이 일부 불일치를 오류로 막아도 잔액의 시점까지 원자적으로 보장하지 못한다. get_day 전환 이후 반환값·과거 365일·없는 정원/날짜·동시 저장·잘못된 소유자에 한정한 새 검증을 추가해야 한다. 이번에는 코드를 변경하지 않았다.

3F의 365일/미래 금지는 API 정책이고 기존 SQL에는 해당 날짜 범위 제한이 없다. profiles의 Seoul CHECK와 v2의 서울/프로필 날짜 동시 검증은 일치한다. bigint는 앱에서 JS 안전 정수 범위로 제한한다. 기존 ensure_garden 부수 효과, 3D 성장 50/100일 동기화도 이전 문서 그대로 유지된다.

### 쓰기 비활성 경계: 중요한 예외

3C~3F 네 source gate 모두 false, route는 잠긴 기본 singleton 사용. D/E는 executor도 주입되지 않음. 실제 pg dependency/pool 생성 코드 없음. 이 경로는 유효 인증 후 503 준비 중 응답이고 DB 호출 전에 종료된다. 이번에는 실제 사용자 토큰으로 API를 호출하지 않았으며 정적 경로와 기존 모의 검증을 근거로 한다.

그러나 **프로젝트 전체 쓰기 차단은 아니다.** 기존 POST /api/account/garden은 ensure_garden을 호출할 수 있고 정원 store는 명시적 initialization-required에서 이를 사용한다. 인증 가입 트리거도 초기화를 수행한다. 더 중요하게 authenticated 사용자는 기존 start_day/save_writing/buy_item/save_layout/사진 RPC를 Next.js gate와 무관하게 직접 호출할 DB 권한이 있다. 소유권을 넘는 접근이 확인된 것은 아니지만 '비활성 UI=원격 쓰기 불가능'은 잘못된 전제다. base 3B 적용 시 authenticated draft GRANT도 앱 gate보다 먼저 직접 쓰기 경로를 연다.

P0 결정 사항: 허용된 기존 쓰기 범위를 명시적으로 승인할지, 통합 전 전역 쓰기 동결이 필요한지 운영자가 결정해야 한다. 전역 동결을 원하면 영향 분석과 별도 권한 변경안이 필요하며 이번에 REVOKE/RLS 변경을 하지 않았다. v2는 계속 owner-only → 전용 executor만 허용해야 하며 authenticated/service_role fallback 금지. v1 외부 회수는 caller 확인 없이 진행하지 않는다.

### 백업·복구 준비

현재 증거 JSON은 컬럼/제약/인덱스/정책/ACL/주요 함수 본문을 담지만 전체 schema dump, 역할 membership, managed schema/Storage 정책·객체, 실제 데이터 백업이나 복원 실험의 대체가 아니다. 기존 백업/PITR 상태 및 복원 리허설은 확인하지 못했다. 역할 password는 조회·보관하지 않았다.

운영 적용 직전에 다음을 승인된 관리 경로로 준비한다:

1. Dashboard Database > Backups에서 성공한 최근 백업 시각, 실제 복원 가능 구간, 보존 기간/PITR 여부와 운영 책임자를 확인한다. Pro라는 이름만으로 특정 복원점 존재를 확정하지 않는다.
2. schema-only export(public/onestep_private), 함수 정의·owner·ACL, schema/table/default ACL, roles 속성·membership(비밀번호 제외), RLS/FK/트리거/이벤트 트리거/확장·버전 및 managed auth 트리거·관련 Storage 정책 증거를 별도 보관한다. 관리 스키마 제외 옵션 때문에 auth 트리거가 빠지지 않도록 목록 대조. 보관 파일 해시/접근권한/암호화/복원 책임자를 기록한다.
3. 별도 Supabase staging에서 schema/권한 복구를 검증한다. 이번에 데이터 dump나 사용자 데이터 복제는 실행하지 않았다. 필요한 데이터 백업은 별도 승인 범위·보관 정책을 따른다. CLI/pg_dump는 선택한 버전의 공식 절차에 맞춰 역할/스키마/데이터 범위를 구분한다.
4. migration 실패는 해당 트랜잭션 전체 rollback. base 성공 후 permissions/login 실패면 이미 commit한 base는 남아 있으므로 이를 포함한 권한 상태를 확인하고 앱 쓰기를 유지 차단한다. '세 파일 전체가 자동 rollback'으로 간주하지 않는다.
5. 운영 장애는 앱 쓰기 중단→진행 요청 drain→조회 유지→신규 역할 실행/membership의 승인된 회수 순서. additive 함수는 우선 미사용으로 남기며 기록·보상·아이템을 삭제하거나 DB 전체를 과거로 되돌리지 않는다. v1 service_role 권한 복구는 우회 위험을 다시 열므로 별도 승인하며 자동 fallback 금지. DROP CASCADE 금지.

공식 문서상 DB 백업은 Storage 객체 본문을 포함하지 않고, custom role 비밀번호도 일일 백업에서 복구되지 않는다. 이번 범위는 Storage를 건드리지 않으며 credential 복구/회전은 별도 secret 관리 절차로 준비한다. [Supabase 백업](https://supabase.com/docs/guides/platform/backups), [CLI 백업·복구](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

### 자격증명·로컬 검증·배포 검증 구분

운영 onestep_commit_executor/onestep_app_login_v1 없음. 확인한 로컬 .env 파일의 변수 이름과 현재 프로세스의 관련 변수 이름에서 DB/서버 전용 credential 설정을 발견하지 못했다(값은 출력하지 않음). 외부 secret manager 설정까지 확인한 것은 아니다. 현재 서버 adapter는 인터페이스이며 새 pg 드라이버/풀 bootstrap·TLS/connection wait·요청 deadline·풀 예산 구현과 검증이 남았다.

| 시점 | 수행 범위 | 완료 기준 |
|---|---|---|
| 지금 로컬, 읽기 전용 | 계약·소스 gate·metadata·문서 대조 | 이번 점검 완료, 기존 283개 회귀 증거 재사용 |
| 별도 코드 승인 후 로컬 | get_day reader/상태 조율/UI adapter, 모의 및 필요한 추가 회귀 | 원자적 읽기, 로컬 persistence import/호출 없음, 단계별 revision 공유 |
| 별도 staging/credential 승인 후 로컬 Next | 실제 최소 LOGIN/TLS/Pooler·v2 및 A/B 쓰기 | Auth 검증·claims 격리·최소 권한 거부·rollback/유실 복구, 범위 제한된 테스트 기록 |
| 배포처 선정 후 staging 배포 | DNS/HTTPS/Auth redirect·CORS 필요 여부·secret 주입·인스턴스/풀 한도 | 실제 호스팅 런타임에서 A/B/재시도/회전/drain/timeout 검증 |
| 운영 별도 승인 후 | migration/권한/credential 및 제한된 계정 활성화 | 아래 단계별 성공 기준 충족 후 확대 |

배포처 미정은 로컬/staging 통합 개발을 막지 않는다. 서버리스면 Transaction Pooler, 지속 Node이면 네트워크 조건에 따라 Direct 또는 Session을 선택할 수 있다. shared pooler의 custom username은 ROLE.PROJECT_REF이며 실제 hostname은 Dashboard Connect에서 복사한다. [공식 연결 안내](https://supabase.com/docs/guides/database/connecting-to-postgres). 계정별 GUC는 두 값을 같은 검증 user.id로 SET LOCAL, 한 연결/트랜잭션에서만 사용하며 반환 전 COMMIT/ROLLBACK 확인, 결과 미상 연결 폐기, TLS hostname/CA 검증을 유지한다.

### 계정 UI 최종 연결 계획 — 별도 구현 승인 필요

현재 AuthBoundary는 signed-in에서 AccountGarden을 렌더하고 개발용 로컬 children과 분리한다. 이 경계를 유지한다. 기존 page/RecordScreens의 저장·사진 cleanup 부수 효과를 포함한 컴포넌트 전체를 계정 경로에 재사용하지 않는다. 스타일/문구/아이콘/Rive의 표시 부분만 재사용하고 데이터·저장 콜백은 account adapter로 주입한다. 파일 업로드 UI는 별도 Storage 단계까지 비활성이다.

계정 세션 owner가 모든 store에 setSession을 전달하고 identity 변경 때 이전 owner를 먼저 dispose한다. 같은 사용자 token refresh는 글/질문을 지우지 않는다. 날짜별 revision coordinator를 추가해 3C draft→3D commit→3E activity→3F writing 간 대기 저장을 직렬화하거나 충돌 없는 시점에만 진행시킨다. 각각의 store 내부 직렬화만으로 여러 store 사이 revision 충돌이 해결되는 것은 아니다. 성공 후 공통 day snapshot과 garden/inventory 캐시를 갱신하되 미저장 writing draft를 덮어쓰지 않는다. 단계 전환 전 미저장 글 저장/보존/폐기를 명시적으로 처리한다.

완료 화면/Rive/알림은 3E takeEffect로 한 번 소비한 새 성공 이벤트에만 반응한다. 복구 GET/기존 완료 목록은 재생 금지. localStorage/IndexedDB를 던지는 spy 하에서 계정 경로의 시작/저장/로그아웃/날짜 전환/오류 복구를 검증하고, 기존 로컬 데이터·사진의 전후 불변과 개발용 경로 회귀를 확인한다. 사진 정리 함수를 계정 unmount 시 호출하지 않는다. Android Compose는 그대로 보존한다.

### 우선순위와 승인 판정

| 우선순위 | 미충족/위험 | 필요한 해소 |
|---|---|---|
| P0 운영 적용 전 | Edge/외부 v1 caller 미검증 | 관리자 목록·코드·스케줄 확인, 중지/drain 및 책임자 승인 |
| P0 운영 적용 전 | 백업/정확한 ACL 복구·리허설 미확인 | 복원점과 dump/권한 증거 및 staging 복구 검증 |
| P0 권한/활성화 전 | 앱 gate 외 기존 RPC 쓰기 및 base draft GRANT | 허용 범위 명시, 전역 동결 필요 시 별도 권한 설계·승인 |
| P0 D/E 활성화 전 | 역할/LOGIN/실 pg 풀/TLS 미준비 | 최소 권한·PUBLIC/상속·v1 직접 거부와 실제 Pooler 격리 검증 |
| P1 통합 활성화 전 | get_day 미연결, UI/store 사이 revision 조율 없음 | 단일 snapshot adapter 및 계정 전용 orchestration 구현/검증 |
| P1 운영 준비 | default EXECUTE 및 managed DDL 이벤트 영향 | 같은 트랜잭션 REVOKE/ACL 검사 유지, 실제 staging 설치 확인 |
| P1 배포 전 | 배포 런타임/리전/secret rotation/연결 예산 미정 | 배포 후 실제 환경 검증, 로컬 성공으로 대체 금지 |

**현재 3B 운영 마이그레이션의 무조건 승인/즉시 실행은 권고하지 않는다.** 스키마 의존성은 일치하고 SQL 차단문/ROLLBACK도 보존돼 있으나 위 P0 사전 조건이 미충족이다. base만 설치해도 authenticated draft 권한이 생기므로 완전한 무변경 준비 단계가 아니다. staging 한정 리허설은 별도 승인 대상으로 분리할 수 있다. 배포처 결정 자체를 additive DB 설치의 유일한 선행 조건으로 만들지는 않되, 실제 호출자·백업·권한 검증을 생략해서는 안 된다.

### 승인 후 안전한 순서와 A/B 성공 기준

1. 관리자가 Edge Functions/외부 작업 caller와 기존 직접 RPC 허용 범위를 확정한다. Dashboard의 Backups/Connect/TLS/한도 확인, secret 보관·회전 담당자 지정. 지금은 조회·검토만 하고 역할/비밀번호는 만들지 않는다.
2. 승인된 staging에서 get_day adapter/실 pg 풀/UI orchestration을 준비하고 managed 역할/ACL/claims/복구를 검증한다. 기존 native 17.12 테스트를 전부 반복하는 대신 managed 17.11/Pooler/새 통합 경로에 집중한다.
3. 운영 별도 승인 시점의 metadata/함수/ACL/default grant/백업 재확인 및 변경본 해시 확정. 외부 v1 writer 중지/drain. 원본 drafts는 실행 차단 상태로 보존하고 승인된 승격본만 별도로 검토한다.
4. base 4함수 설치→owner/search_path/정확한 시그니처와 sealed v2 ACL 확인. permissions 트랜잭션에서 executor 생성·두 v2 GRANT·v1 외부 REVOKE를 원자적으로 실행. postgres 소유 내부 호출 유지. 단계별 실패 시 다음 단계 중단.
5. 별도 승인된 LOGIN·비공개 password/secret 주입, TLS/접속/role 확인. anon/authenticated의 v2 거부, LOGIN의 직접 DML/v1/불필요 privileged 함수 거부 확인. 새 role의 claims 누락/A 성공·오류·취소 후 B 검증. 설정/출력에 실제 secret을 노출하지 않는다.
6. 테스트 범위·A/B 사용자·날짜·허용할 글·보상 변화에 대한 승인 후에만 쓰기 시작. 기존 테스트 당일이 이미 완료됐으면 초기화/삭제하지 말고 다음 날짜 또는 별도 승인한 staging 계정을 사용한다. 테스트 전 baseline 기록/잔액/원장/인벤토리를 해당 계정에서 최소 범위로 확인한다.
7. A/B 별도 브라우저 프로필에서 start_day→질문 4개 초안 저장/새로고침 복원. 성공 기준: 소유자 일치, 질문별 revision, 추천/보상 없음. 동일 알고리즘 입력이면 A/B 추천이 같을 수 있으므로 추천 차이 자체를 격리 기준으로 삼지 않는다.
8. 3D 확정: 서버 추천 3개 고정·reflection 원장 +10 한 번·재시도 no-op·성장 sync 효과 확인. photo_done: 단계만 전진, 사진/보상 변화 없음. growth_done: +5 한 번. care_done: 첫 돌봄 +10, 나머지 0; 세 돌봄 재시도에도 당일 earning 합계 25. 구매 미실행 조건에서 baseline 대비 잔액 +25, 원장/완료 상태와 일치.
9. 3F: 승인된 테스트 글만 300/100/빈 문자열/부분 수정·재로그인 복원 검증. 다른 기기 수정은 409·초안 메모리 보존, 응답 유실은 GET 후 동일 내용이면 추가 쓰기 없음. 활동과 글 동시 저장도 revision coordinator/409로 보호. 자정은 전날 결과를 오늘로 옮기지 않음. 계정 전환 후 A 텍스트·보상 이벤트가 B에 노출되지 않음.
10. 이미 확정된 Rive/보상 재조회 무재생, 로컬 저장소·사진 불변, 외부 실패/timeout rollback·COMMIT 유실 복구 확인. 하나라도 실패하면 쓰기 비활성·조회 유지, 데이터 삭제/보상 회수로 테스트를 되돌리지 않는다. 실제 배포 환경 검증 완료 후 별도 일반 사용자 활성화 승인.

Edge Functions 확인은 자동 승인 심사 거절이 아니라 Supabase MCP 권한 오류다. 권한 있는 관리자가 Dashboard에서 목록과 호출 코드를 확인하거나 해당 read 권한을 제공해야 한다. 알 수 없는 HTTP 코드를 403으로 추정하지 않았다.

## 단일 스냅샷 어댑터 구현 후 상태

### 실제 수정 코드와 잠금

- 신규 `src/lib/account-records/snapshot.ts`: 3B get_day의 `{userId,today,date,garden,record,cares,rewards}` 반환을 검증하고 기존 AccountRecords DTO로 변환한다. garden.user_id 및 모든 행의 소유권/날짜, 안전 정수 revision·잔액, 배열/원장 일관성을 확인한다. project는 서버 상수로 붙이고 sunshineBalance는 같은 snapshot의 garden에서만 가져온다.
- `account-records/server.ts`: 중앙 snapshot gate가 false인 동안 기존 네 SELECT를 그대로 사용한다. gate=true 이후에는 get_day만 사용한다. RPC 오류나 함수 미설치를 감지해 네 SELECT로 fallback하지 않는다. GET의 공통 인증/출력 DTO/캐시 방지 및 기존 계정 정원 경로는 유지했다. 테스트를 위한 handler factory만 추가했다.
- `account-reflection/commit-server.ts`, `account-activity/server.ts`, `account-writing/server.ts`: 기본 read 의존성을 잠긴 readAccountSnapshot으로 변경했다. 개별 쓰기 gate만 실수로 켜도 snapshot 준비 전에는 쓰기 실행까지 도달하지 않는다. 별도 reader 주입은 기존 모의 테스트용이다. 실제 route는 기본 잠긴 singleton만 사용한다.
- `account-reflection/server.ts`: start/draft는 쓰기 gate와 snapshot readiness를 모두 요구한다. 이는 3C 상태 복원 GET이 snapshot으로 전환되기 전에 쓰기만 여는 순서 오류를 막는다. 원래 쓰기 gate도 false 그대로다. `scripts/account-reflection.test.mjs`는 오프라인 테스트에만 readiness를 명시하도록 갱신했다.
- `scripts/account-snapshot.test.mjs`: 신규 계약/SDK transport/계정/날짜/실패 차단/3D→3E→3F 연속 revision 테스트를 추가했다. 운영 RPC, Secret, LOGIN, 환경변수, UI, Rive, Android, 로컬 기록 경로는 변경하지 않았다.

### 날짜·revision·원장·잔액 계약

하나의 read는 한 번의 `onestep_get_day({p_date})`만 호출한다. userId는 RPC 입력으로 보내지 않으며 인증된 사용자 JWT의 auth.uid()로 정해진다. 루트·garden·record·care·ledger의 owner를 응답에서도 확인한다. garden=null은 initialization-required, record=null은 유효한 빈 날짜일 때만 허용한다. 실패/누락 필드/잘못된 소유자를 빈 기록/0원으로 대체하지 않는다.

날짜는 명시적으로 전달한다. 서버 입력 범위는 오늘~365일이며, 최종 today는 DB snapshot 값을 유지한다. 서버 요청 전후 서울 날짜 중 하나인지 확인해 자정 통과는 허용하고 잘못된 DB 날짜는 거절한다. RPC의 범위 오류 22023은 GET에서 409, 미설치 42883/PGRST202는 503 준비 중, 권한 오류는 403, 잘못된 반환/기타 조회 오류는 502로 처리한다. 오류 메시지에 원문 DB 정보는 노출하지 않는다.

3C 질문 복원/3D 추천·확정 전후/3E 단계·완료·보상/3F 두 글 필드의 조회는 활성화 후 같은 DTO/reader를 사용한다. 3D 최근 3일 조회도 날짜별 snapshot이다. **여러 날짜/여러 HTTP 요청 전체가 하나의 트랜잭션이 되는 것은 아니다.** expected revision은 계속 필요하며, 이후 다른 요청이 진행하면 최신 revision을 재조회하고 Rive 이벤트 귀속이 불명확한 경우 기존 정책대로 억제한다. 쓰기와 뒤따르는 조회 사이의 동시 변경은 revision/상태 검증으로 처리한다.

개별 store를 하나의 UI에 연결하는 날짜별 revision coordinator는 아직 후속 작업이다. 3F 전송 중 3E를 무조건 실행하지 않고, 공통 최신 snapshot 반영/대기 저장/409 사용자 선택을 조율해야 한다. 어댑터 추가만으로 UI orchestration까지 완료했다고 판단하지 않는다.

### v1 호출 의존성 재검색과 권한 범위

검색 범위는 src, scripts, supabase SQL, Android Kotlin이다. 이번에는 원격 도구/검증 스크립트를 실행하지 않았다. 운영 권한 판정은 앞선 read-only metadata 증거와 로컬 003/004 SQL을 기준으로 하며, 새로운 운영 조회 결과로 표시하지 않는다.

| 경로 | 발견한 참조 | 분류/조치 |
|---|---|---|
| src 앱/Android | 앱은 v2 고정 SQL만, v1 직접 실행 없음 | 기존 UI/Compose 유지 |
| phase3b.sql | v2 definer 안에서 v1 PERFORM | 의도된 내부 호출, postgres owner 실행 유지 필요 |
| 003 migration·permissions draft | v1 정의/GRANT/REVOKE/의존성 확인 | 배포 자산, 실행하지 않음 |
| garden-functions·phase3b-draft tests, native-check | 로컬 DB의 v1/v2 실행·권한 거절 실험 | 기존 검증, 이번 재실행 없음 |
| garden_isolation.sql 등 | 실제 v1 호출 SQL 및 권한 assertions | 연결 대상을 잘못 지정하면 실행될 수 있는 수동 검증 자산; 운영 검증에 무단 사용 금지 |
| supabase-rpc-readonly-probe | OpenAPI 경로 문자열 조회 | opt-in 외부 HTTP 가능, 함수 호출은 하지 않음; 이번 실행 없음 |
| Edge/외부 배치/다른 저장소 | 현재 접근 범위 밖 | 이전 MCP -32600 이후 미검증 유지, Dashboard 관리자 확인 필요 |

| RPC | 이전 운영 확인 권한 | 쓰기 범위/직접 호출 고려 |
|---|---|---|
| v1 commit_reflection/commit_activity | service_role, owner; authenticated/anon 거부 | 추천·완료·보상·성장. 외부 caller drain 뒤 별도 승인으로 service_role 회수; owner 내부 호출 보존 |
| ensure_garden | authenticated | 누락 프로필/정원/기본 인벤토리/배치 멱등 보충. 기존 정원 POST에서 사용 |
| start_day | authenticated | ensure_garden 후 날짜별 기본 기록 생성, 보상 없음 |
| save_writing | authenticated | 자기 record note/comment/revision/updated_at, ensure_garden 동반. 날짜 365일 제한은 앱 정책이고 직접 RPC에는 없음 |
| buy_item | authenticated | 자기 잔액 차감·구매 원장·purchase·inventory 생성, 기존 소유는 멱등 반환 |
| save_layout | authenticated | 소유권/슬롯 검증 후 자기 배치 교체와 layout_revision 증가 |
| reserve_photo | authenticated | 자기 날짜에 staged 사진 metadata 예약, 파일 업로드 자체는 하지 않음 |
| attach_photo | authenticated | 업로드 존재·소유권·revision 검증, 기록 photo_id 교체/해제, old retired/new attached |
| retire_photo | authenticated | 참조 중이지 않은 자기 사진 metadata retired, 경로 반환. 파일 삭제는 별도 Storage API/정책 |

앱에서 미사용이라는 이유로 위 권한을 회수하지 않았다. 글로벌 쓰기 동결이 필요하면 기존 정원 초기화/가입 trigger/직접 RPC/Storage 경로에 대한 영향 분석과 별도 승인안이 필요하다. authenticated direct RPC는 앱 feature gate를 거치지 않으므로 gate 자체를 권한 경계로 설명하지 않는다. 3B base는 설치 시 authenticated draft/get_day GRANT를 포함한다는 점도 그대로다.

### 활성화 순서·남은 승인 조건

1. Edge/외부 v1 caller·백업/복원·직접 RPC 허용 범위를 관리자와 확정한다. Dashboard에서 Edge Functions 목록/코드, Backups 복원점, Connect endpoint/TLS/한도를 확인한다. 비밀번호를 채팅에 공유하지 않는다.
2. 별도 승인한 staging에서 3B SQL/ACL 설치 및 get_day 실제 반환/RLS/날짜/빈 날짜/원자적 조회 확인. SQL 원본의 guard/ROLLBACK은 이번에도 보존했다.
3. 서버 전용 LOGIN/pool/TLS/claims는 별도 승인·구현·검증. D/E는 아직 실행 인터페이스만 있고 운영 풀은 연결되지 않았다. C/F는 사용자 JWT 경로를 유지한다.
4. reader의 PRODUCTION_SNAPSHOT_ENABLED만 먼저 검토 변경해 읽기 전용 GET을 실제 snapshot으로 전환하고 회귀 확인. 쓰기 gate는 계속 false. 실패하면 명시적 준비/오류 응답으로 멈추고 자동 legacy fallback하지 않는다. rollback으로 호환 reader를 되돌릴 때는 쓰기 gate도 먼저 닫고 drain해야 한다.
5. UI revision coordinator와 계정 전용 상태 연결 검증 후 별도 승인한 A/B 계정·날짜에서 C~F 쓰기 활성화/보상/복구 검증. 이전 테스트 완료 날짜를 지우거나 초기화하지 않는다.

판정: **단일 스냅샷 어댑터 코드 준비 완료·운영 호출 비활성**. 이전 get_day 미구현 차단 항목은 코드 수준에서 해결됐다. 실제 managed 설치/실행, 외부 caller, 백업·복구, 역할·LOGIN·TLS/풀 및 UI 조율이 남아 있어 3B 운영 적용을 무조건 승인할 상태는 아니다. 이 변경 자체는 DB·RLS·RPC·Storage 권한 변경을 요구하지 않으며, 기존 승인되지 않은 3B 설치와 권한 전환은 별도로 남는다.

검증 결과: 신규 snapshot 16개 포함 records/C~F 105개, 로그인·Auth client·계정 정원·Rive 33개로 이번 관련 테스트 총 138개 통과. TypeScript/프로덕션 빌드 통과, ESLint 오류 0/기존 경고 3. 기존 전체 283개 suite 및 3B PostgreSQL/PGlite는 반복하지 않았다. mock SDK 요청과 injected SQL executor만 사용했고 원격 Supabase 도구/실사용자 API는 호출하지 않았다. SQL 3파일은 이전 증거 SHA-256과 일치하여 실행 차단문/ROLLBACK도 그대로다. 실제 get_day 반환/권한 검증은 승인된 설치 후에만 가능하다.
