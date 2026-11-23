# 3B 적용 직전 검토 — 최신 권한/복구 순서

운영 조회: 2026-11-13 22:22:47 KST. MCP SELECT만 실행, transaction_read_only=on. 사용자 행·비밀번호는 조회하지 않았다. 증거는 PHASE3B_PREAPPLY_METADATA.json. 이전 metadata와 함수 17개의 CR 정규화 MD5가 모두 일치한다(원문 CR 포함 MD5도 새 증거에 보존). 소유자는 모두 postgres. public/onestep_private CREATE 및 USAGE 가능, auth USAGE 가능, postgres CREATEROLE=true. 관리형 환경의 실제 DDL 실행 성공까지 검증한 것은 아니다.

## 권한 결론

- v1 reflection/activity: postgres owner + service_role 직접 EXECUTE. PUBLIC/anon/authenticated 경로 없음. anon/authenticated/service_role은 다른 역할의 member가 아니며 상속·SET ROLE 우회 경로 없음. authenticator의 이들 역할로의 SET은 의도된 PostgREST 경로다.
- public 신규 함수 기본 권한은 anon/authenticated/service_role EXECUTE를 포함한다. 생성과 REVOKE를 같은 트랜잭션에 묶고 ACL 검증 실패 시 전체 롤백한다. 기본 권한 자체는 변경하지 않는다.
- executor/LOGIN은 아직 없음. executor의 실제 유효 권한 검증은 운영 설치 이후이며, 초안에서 NOLOGIN/NOINHERIT/NOBYPASSRLS + 두 v2만 허용하는 효과 검사를 추가했다. 관리자/슈퍼유저의 고유 권한을 막는다는 의미는 아니다.
- 설치 직후 get_day와 draft 모두 owner-only. 읽기 전용이더라도 get_day 공개를 자동 허용하지 않는다. read/draft 활성화 파일을 별도로 승인해야 한다. draft GRANT는 앱 플래그와 무관하게 전체 authenticated 사용자에게 직접 RPC 쓰기를 허용하므로 승인 범위에 명시한다.

## 적용 순서 / 중단 조건

1. 외부 v1 writer를 중지하고 진행 중 요청을 drain한다. 최근 복원점·함수/ACL 증거·복구 담당자를 확정한다. 오래 실행 중인 트랜잭션은 DDL 원자성만으로 취소되지 않는다.
2. 권장 적용본은 phase3b-install-atomic.sql. base → sealed ACL 검사 → executor 생성/v2 GRANT/v1 REVOKE → 유효 권한 검사를 하나의 BEGIN 안에서 수행한다. 내부 BEGIN/COMMIT을 중첩하거나 조각 선택 실행하지 않는다. 승인된 승격본만 별도로 준비하며 저장소 원본의 예외 차단문/ROLLBACK을 유지한다.
3. 함수 본문/owner/기존 v1 ACL 기준과 다르거나 신규 이름/역할 충돌, 권한 오류, 예상 밖 EXECUTE/SET ROLE, 잠금/실행 timeout이면 전체 설치 중단. COMMIT 응답 유실 시 재실행하지 말고 설치 상태를 먼저 읽어 확인한다. 원자적 설치본은 전체 성공 또는 전체 롤백; 파일별 적용을 선택하면 이미 커밋한 이전 단계는 자동 취소되지 않는다.
4. 별도 승인된 phase3b-login.sql과 안전한 자격증명 provisioning, Dedicated LOGIN/SET ROLE/claims 검증. 비밀번호는 SQL snippet/Git/로그에 쓰지 않는다. 이 단계 실패 시 신규 RPC는 닫힌 채 유지하고 쓰기를 활성화하지 않는다.
5. phase3b-enable-read.sql 별도 승인 → 실제 snapshot GET 검증. 이후 phase3b-enable-draft.sql 별도 승인 → C~F UI/상태/기능별 활성화 승인. 읽기 준비 전 draft 활성화는 차단한다. v2는 authenticated/service_role에 부여하지 않는다.

## 복구

phase3b-restore.sql은 이번 실제 운영 정의로 만든 실행 가능한 SQL 초안이며 예외 차단문/ROLLBACK을 포함한다. 앱 writer 중지/drain 후 신규 네 RPC를 모든 비소유자에게서 봉인하고, 3B 권한 전환 대상인 기존 v1 두 함수의 본문·postgres 소유권·원래 ACL을 복원한다. 다른 기존 함수 15개는 변경하지 않으며 전체 정의는 JSON에 보존한다. 함수 본문은 CREATE OR REPLACE로 정의할 뿐 호출하지 않는다. 직접 테이블 DML/테이블 삭제/보상 회수/Storage 변경/역할 삭제/비밀번호 재설정은 없다. 예상 밖 종속 GRANT나 owner 변경으로 복구가 실패하면 CASCADE로 강행하지 않고 중단한다.

이 복구는 의도적으로 원래 service_role의 v1 권한을 다시 연다. 따라서 자동 fallback이 아니며 기존 호출자 재개 승인까지 포함한 별도 롤백 승인이 필요하다. 단순 장애 격리는 앱 쓰기 차단·drain·신규 RPC 봉인으로 처리하고 v1 권한 복원은 자동 실행하지 않는다. 신규 함수/역할은 제거하지 않는다. 기존 데이터는 보존되며 전체 DB 백업 복구의 대체가 아니다.

## 이번 검증 / 남은 조건

기존 정적/PGlite/독립 PostgreSQL 경쟁/TLS suite는 반복하지 않았다. 변경된 권한 및 복구 경로만 독립 메모리 PGlite에서 점검: 원자적 설치, read/draft 봉인, read만 활성화 시 draft 봉인, 별도 draft 활성화, v1 본문 해시/owner/ACL 복구, 복구 후 effective 권한 검증 통과. fixture 이외에 사용자 레코드는 만들지 않고 운영 RPC를 호출하지 않았다. 운영 관리자 권한에서의 실제 적용·독립 연결로 DDL 노출 관측·실제 LOGIN 인증은 미검증이다.

실행 승인 전 최소 조건: 최신 baseline 유지 및 외부 writer drain, 복원점/이 복구본의 service_role 재개 위험 승인, 원자적 설치본 해시와 관리자 실행 범위 승인. LOGIN 발급·실제 claims 검증은 후속 승인 단계이며 봉인된 함수 설치의 완료와 쓰기 활성화 완료를 구분한다. SSL Enforcement OFF는 사용자 확인값이며 변경하지 않았다.

최종 수정본 추가 확인: 후반부에 잘못된 authenticated v2 GRANT를 주입한 메모리 시험에서 함수와 executor 생성 모두 롤백됨. read 활성화 전 draft 활성화 거부됨. 최종 설치→read→draft→restore 순서의 권한/본문/owner 검증 및 public 테이블 전체 데이터 전후 동일 확인. 원본 SQL 7개 모두 실행 차단문과 마지막 ROLLBACK 유지. 이는 이번에 변경한 권한 전환·복구 검사이며 기존 추천/보상/동시성 suite 재실행이 아니다.
