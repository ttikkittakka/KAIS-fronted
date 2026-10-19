# OneStep 사용자별 정원 DB 기반

이 폴더는 SQL 스키마·RLS·트랜잭션 함수·Storage 정책과 실행 테스트입니다. 앱의 UI, 인증 화면, `localStorage`/IndexedDB 저장 로직은 바꾸지 않습니다. 기존 로컬 기록을 읽거나 계정으로 이전하지 않으며, 관리자 test/preview 데이터도 업로드하지 않습니다.

## 적용 상태와 검증 범위

- 로컬 PGlite(PostgreSQL 17)에서 마이그레이션 전체와 `tests/garden_isolation.sql`을 실행합니다. 단순 SQL 문자열 검사가 아니라 실제 역할 전환·권한·RLS·PL/pgSQL 실행 테스트입니다.
- 실제 Supabase 프로젝트에는 이 작업에서 적용하지 않았습니다. 연결된 DB 관리 도구/프로젝트 DB 연결이 제공되지 않았습니다.
- 로컬 테스트의 `auth.users`, `auth.uid()`, `storage.objects`는 최소 호환 fixture입니다. 실제 Supabase Auth의 JWT 검증, Storage HTTP 업로드/다운로드/삭제, 다중 DB 연결의 동시 실행은 이 테스트만으로 검증되지 않습니다.
- Storage metadata 테스트는 파일 바이트를 만들지 않습니다. **실제 파일은 Storage API로만 삭제**해야 합니다. `DELETE FROM storage.objects`는 실제 파일 정리 절차가 아닙니다.

## 기존 구조 분석과 매핑

| 기존 코드 / 데이터 | DB 영역 및 호환 규칙 |
| --- | --- |
| `daily-checkin.ts`, `record-store.ts`: 날짜별 `DailyCheckin` | `onestep_daily_records`, PK `(user_id, record_date)`; 버전 1, 원래 날짜는 `date`로 유지 |
| `questions.ts`: sleep/energy/meal/mood 순서의 네 응답 | `answers text[4]`; 질문별 허용값 검사. `very_good`은 energy/mood만 허용. 레거시 한글 응답은 향후 명시적 이전 시 `normalizeAnswers`로 변환 |
| 돌아보기 사진, 100자 코멘트 | `onestep_photos` + 비공개 `onestep-photos` 버킷; `photo_comment` 최대 100자 |
| 성장하기 한 줄 일기 | `note` 최대 300자; 빈 문자열/건너뛰기 허용 |
| `daily-cares.ts`: 추천 3개, 순서, 제목, v1/v2 카탈로그 | `onestep_daily_cares`에 1~3 순서, `(care_id,catalog_version)` FK; 제목은 날짜 기록에 보존. 재요청·응답 수정으로 추천을 재추첨하지 않음 |
| `completedCareIds`, `stage`, `plantState` | 추천 행의 `completed_at`, 기록의 checkin/photo/growth/care 단계 및 low/normal. 하루 완료 개수(0~3)는 완료 행 수로 복원하여 기존 Rive 로직에 전달 가능 |
| `growth-rewards.ts`: 누적 활동일, 50/100일 보상 | `onestep_gardens.active_days`, `onestep_growth_grants`; `growth_stage`는 누적 보상 구간 0/1/2의 파생값으로, 기존 하루 Rive 상태와 별개 |
| `sunshine.ts`: reflection 10, participation 5, firstCare 10 | `onestep_sunshine_ledger`, 날짜/이유별 고유 이벤트. 최대 25/일. 과거 기록 소급 지급 없음 |
| `shop-store.ts`: 구매 당시 가격·1개 보유 | `onestep_purchases`에 실제 지불 가격 고정, `onestep_inventory` PK `(user_id,item_id)`; 가격·성장 선물 조건은 DB 카탈로그 기준 |
| `garden-layout.ts`: 고정 슬롯과 revision | `onestep_placements`, 슬롯/아이템 중복 방지·보유 FK; 저장 RPC에서 종류·보유량·revision 검사 |
| `app-storage.ts`, `developer-state.ts`: real/test/preview | DB로 매핑하지 않음. `little-garden.*` 키와 `.test`/`.preview` 사진 DB는 변경·초기화·이전하지 않음 |

`202610160002_garden_catalog.sql`은 현재 상품 12종 + 기본 새싹 `sprout`, 레거시 32개/현재 30개 행동과 고정 슬롯을 복제한 스냅샷입니다. 새싹은 현재 코드에서 항상 있는 캐릭터이므로 DB에서는 기본 소유 항목으로 명시했습니다. 기존 캐릭터 파일이나 앱 카탈로그를 수정한 것은 아닙니다. 테스트가 SQL 스냅샷과 실제 앱 카탈로그의 ID·가격·제목·슬롯 일치를 확인합니다.

현재 보상 날짜는 프로필의 서버 관리 `Asia/Seoul` 기준입니다. 클라이언트 날짜를 받아 과거·미래 일자 보상을 만들지 않습니다. 다른 시간대 지원은 일자 경계 이동에 따른 중복 지급 규칙과 함께 다음 단계에서 결정해야 합니다. 기존 로컬 날짜를 임의 변환하지 않습니다.

## 직접 적용 순서

적용 전에는 `inspect_garden_schema.sql` **전체**를 SQL Editor에서 postgres로 실행해 결과를 확인하세요. 이 파일은 `BEGIN TRANSACTION READ ONLY` 안에서 시스템 카탈로그와 버킷 설정만 조회한 뒤 `ROLLBACK`합니다. 사용자 기록·사진 내용·인증 정보를 읽거나 변경하지 않습니다. 스키마/테이블 존재 여부, 컬럼·기본값·생성식, FK·인덱스, RLS, 테이블/함수 ACL, 함수 정의·소유자·search_path, 가입 트리거, 기존 Storage 정책을 반환합니다. 파일은 준비 및 로컬 검증만 했으며 원격에서는 실행하지 않았습니다.

`expected_schema` 또는 `expected_table`의 `exists=true`, 혹은 다른 기존 OneStep 객체가 발견되면 **적용을 멈추고 정의를 비교**하세요. `001`과 컬럼/제약/RLS/권한을, `003`/`004`와 함수/트리거/Storage 정책을 대조합니다. 기존 데이터의 보존·백업 검토도 별도로 필요합니다. 실제 프로젝트 조회 결과가 아직 없으므로 원격 정의 비교가 완료된 것은 아닙니다. `IF NOT EXISTS`, `CREATE OR REPLACE`, DROP, 자동 history repair로 차이를 숨기지 않습니다. 이미 이전 버전을 적용했다면 수정된 원본을 재실행하지 말고 비교 후 별도의 후속 마이그레이션을 작성하세요.

먼저 개발용 Supabase 프로젝트에서 실행하세요. Dashboard → SQL Editor → New query에서 다음 파일을 **순서대로 각각 전체 실행**합니다. 각 파일은 트랜잭션으로 감싸져 있습니다.

1. `migrations/202610160001_garden_schema.sql`: 테이블, FK/고유 제약, RLS 및 권한
2. `migrations/202610160002_garden_catalog.sql`: 서버 카탈로그 스냅샷
3. `migrations/202610160003_garden_functions.sql`: 기본 정원, 기록 진행·보상·구매·배치 RPC
4. `migrations/202610160004_private_photos.sql`: 비공개 버킷, 사진 교체 RPC, Storage 정책

이 마이그레이션은 **한 번 적용**하는 파일입니다. 기존 테이블·버킷과 충돌하면 실패하도록 했으며, 기존 객체를 삭제하거나 덮어쓰는 복구 코드는 없습니다. 파일 실행 실패 시 그 파일은 롤백됩니다. 성공한 파일을 다시 실행하지 말고 실패 원인을 확인한 뒤 다음 미적용 파일부터 진행하세요. CLI를 이미 사용하는 경우 이 파일들을 해당 프로젝트의 migration history로 관리할 수 있습니다. SQL Editor 수동 적용과 `db push`를 중복 사용하지 마세요.

`public`만 Data API에 노출하고 **`onestep_private`를 노출 스키마에 추가하지 마세요**. 비공개 helper의 실행 권한은 회수되어 있습니다. Storage 정책용 boolean helper만 anon/authenticated에게 실행 가능하며, `auth.uid()`가 없으면 false를 반환합니다.

세 번째 마이그레이션은 `auth.users` INSERT trigger를 만듭니다. 새 가입 시 기본 정원을 생성하고, 기존 계정은 향후 로그인 연결 단계에서 `onestep_ensure_garden()`을 호출합니다. 기존 계정 전체를 일괄 수정하지 않습니다. 트리거 오류는 가입 자체를 실패시킬 수 있으므로 개발 프로젝트에서 신규 가입까지 확인한 후 운영에 반영하세요.

기본 정원은 새싹 1개, 기본 배경 1개/배치, 잔액 0, 구매/활동 기록 없음입니다. `ON CONFLICT DO NOTHING`과 계정별 트랜잭션 잠금으로 중복 호출 시 잔액·구매·기록·배치를 덮어쓰지 않습니다.

## 권한 및 트랜잭션 계약

모든 사용자 소유 테이블은 `auth.users.id`에 연결되며 SELECT RLS는 `auth.uid() = user_id`입니다. anon 권한은 없고, authenticated의 직접 INSERT/UPDATE/DELETE 권한도 없습니다. 따라서 자기 계정이라도 잔액·보상·추천·완료·성장·소유권을 임의 수정할 수 없습니다. service_role은 신뢰된 운영 서버 권한이며 RLS를 우회합니다. 사용자 테이블에는 SELECT/INSERT/UPDATE/DELETE만, 카탈로그에는 SELECT만 부여합니다. 기존 기본 권한도 회수한 뒤 필요한 권한만 다시 부여하며 TRUNCATE/REFERENCES/TRIGGER 및 권한 위임은 허용하지 않습니다. service_role은 여전히 모든 사용자의 데이터에 접근할 수 있으므로 브라우저에 넣거나 사용자에게 제공하지 마세요.

후속 `003`의 권한 회수는 해당 파일에서 생성하는 함수의 정확한 시그니처만 대상으로 합니다. 기존의 다른 `onestep_` 접두 함수 권한까지 변경하지 않습니다. SECURITY DEFINER 함수는 빈 search_path와 스키마를 명시한 참조를 사용합니다. 사용자 RPC는 `auth.uid()`를 요구하며, 사용자 ID를 받는 보상/활동 RPC 두 개는 service_role만 실행할 수 있습니다. `004`의 private `photo_access`만 Storage 정책 평가를 위해 anon/authenticated에 실행 권한이 있으며 uid가 없으면 false입니다. `onestep_private`는 Data API에 노출하지 않습니다.

| RPC | 호출 권한 | 책임 |
| --- | --- | --- |
| `onestep_ensure_garden()` | authenticated | 자기 계정 기본 정원만 생성 |
| `onestep_start_day()` | authenticated | 서버 기준 오늘 초안 생성, 보상 없음 |
| `onestep_save_writing(date,note,comment,revision)` | authenticated | 자기 기록의 글만 저장, 낙관적 동시성 검사, 보상 없음 |
| `onestep_commit_reflection(user,answers,cares,title)` | **service_role만** | 네 응답·추천 3개 검증, 저장·10 지급·활동일·성장 보상 원자 처리 |
| `onestep_commit_activity(user,action,care)` | **service_role만** | photo_done → growth_done → care_done 진행 검사; 5/10 지급, 중복 방지 |
| `onestep_buy_item(item)` | authenticated | `auth.uid()`로 구매자 결정, 서버 가격·보유·잔액 검증, 차감/영수증/소유권 원자 처리 |
| `onestep_save_layout(layout,revision)` | authenticated | 자기 보유 아이템/슬롯/중복 배치 검사 |
| `onestep_reserve_photo(date)` | authenticated | 자기 기록의 새 사진 UUID·경로 예약 |
| `onestep_attach_photo(date,photo,revision)` | authenticated | 업로드 확인 후 참조 교체; null은 사진 분리 |
| `onestep_retire_photo(photo)` | authenticated | 참조되지 않은 업로드만 삭제 가능 상태로 전환 |

일반 RPC에는 userId 인자가 없습니다. service_role 전용 두 함수의 user 인자는 **다음 단계의 서버가 Supabase Auth로 검증한 사용자 ID로만** 채워야 합니다. 요청 body의 userId, 추천 행동, 추천 제목을 그대로 전달하지 마세요. 서버가 기존 `recommendCares`/`ensureCareHistory`를 실행하고 오늘의 기존 추천을 보존해야 합니다. 현재 마이그레이션은 허용된 행동 ID/개수만 검증하며, 기존 개인화 알고리즘을 SQL로 재작성하지 않습니다. 이 서버 endpoint는 이번 범위에 포함하지 않았습니다.

기록 생성은 `onestep_start_day`, 글 수정은 `onestep_save_writing`, 오늘의 돌아보기 응답 저장/수정은 서버 전용 `onestep_commit_reflection`으로 제공됩니다. **기록 전체 삭제 RPC는 없습니다.** 과거 응답 수정, 질문별 임시 응답 저장, 프로필 수정, 성장 보상 `seen_at` 저장 RPC도 현재 제공되지 않습니다. 이 기능이 필요한 앱 연결 단계에서 별도로 구현해야 하며, 일반 사용자에게 테이블 쓰기 권한을 열어 대체하면 안 됩니다.

`growth_stage`는 누적 활동일 0~49/50~99/100일 이상의 **보상 구간 0/1/2**입니다. 50일 친구, 100일 배경·꽃 보상과 일치하지만 새싹이 애니메이션 단계가 아닙니다. Rive는 기존 `plant_state`(normal/low)와 완료 이벤트를 그대로 사용합니다. SQL의 활동일 계산은 `stage <> 'checkin'`, 기존 로컬 계산은 완성된 응답 또는 유효한 돌봄 완료 기준입니다. 현재 RPC가 생성하는 정상 상태에서는 일치하지만 레거시/수동 입력 데이터까지 동일하다고 가정하면 안 됩니다. 자동 이전은 하지 않습니다.

모든 앱용 변경 함수는 같은 계정별 advisory transaction lock을 획득합니다. 다른 사용자끼리는 독립적이며 같은 사용자의 동시 구매·보상·배치는 직렬 처리됩니다. 이벤트 PK, 구매 PK가 재시도 중복 차감을 막습니다. 금액은 caller 인자로 받지 않고 보상 규칙과 DB 카탈로그에서 결정합니다. 트랜잭션 중간 실패 시 원장·잔액·영수증·아이템 모두 롤백됩니다. 직접 service_role SQL을 작성하는 미래 관리 작업도 이 규칙을 지켜야 합니다.

## 사진 업로드/교체/정리 계약

버킷은 private, 최대 3 MiB, JPEG만 허용하며 경로는 `<auth.uid()>/<photo UUID>.jpg`입니다. 앱의 기존 사진 처리(최대 1600px, EXIF 제거 후 JPEG 재인코딩)는 다음 연결 단계에서도 유지합니다.

1. 기록을 만든 뒤 `onestep_reserve_photo(date)`로 새 경로를 예약합니다.
2. 사용자 세션으로 Storage `.upload(object_path, jpeg, { upsert: false })`를 호출합니다. 기존 경로 UPDATE/upsert는 금지합니다.
3. 업로드 성공 뒤 최신 record revision으로 `onestep_attach_photo`를 호출합니다. 업로드/DB 연결 실패 시 기존 사진 참조는 그대로입니다. 새 파일은 staged 상태로 남으므로 재시도하거나 retire 후 정리합니다.
4. 교체가 커밋되면 기존 파일은 retired가 됩니다. 사용자 Storage `.remove([old_path])`로 실제 파일을 삭제합니다. 삭제 실패 시 retired 행을 보관하고 재시도합니다.
5. 사진 삭제는 attach 함수에 null을 전달하여 참조를 먼저 분리한 다음 Storage API로 삭제합니다. 아직 참조 중인 파일의 삭제는 정책에서 차단합니다.
6. 취소/중단된 staged 업로드는 `onestep_retire_photo` 후 Storage API로 정리합니다. retired 경로는 다시 업로드·연결할 수 없습니다. 다음 단계에서 이 재시도/정리 흐름을 앱 또는 신뢰된 작업자로 연결해야 합니다.

소유자·날짜 복합 FK가 다른 계정/다른 날짜의 사진 연결을 막습니다. 기존 프로젝트에 광범위한 허용 Storage 정책이 있어도 이 버킷에는 restrictive guard를 추가해 A/B·anon 접근과 덮어쓰기를 차단합니다. 다른 버킷에는 이 guard가 제한을 추가하지 않습니다. Storage 바이트와 DB는 하나의 트랜잭션이 아니므로 이 단계적 상태 전이가 필요합니다.

조회는 인증 세션을 사용하는 Storage 다운로드를 우선합니다. signed URL은 만료 전 URL 소지자가 접근할 수 있으므로 생성하면 짧은 TTL을 사용하고 공유하지 마세요. 계정 삭제도 서버에서 해당 버킷 파일을 API로 정리한 후 Auth 사용자를 삭제하는 별도 절차가 필요합니다. `auth.users` cascade만으로 파일 바이트가 지워지지 않습니다.

### 순환 FK와 기록 삭제의 검증 결과

- 기록의 `photo_id`가 null인 상태에서 예약 → 업로드 확인 → 사진 연결이 가능합니다. 새 사진 연결 후 이전 사진 retire, null로 분리하는 경로도 PostgreSQL 테스트를 통과합니다. 참조 중인 사진 행을 먼저 삭제하면 `23503`으로 차단됩니다.
- 순환 FK 자체는 원장이 없는 기록 삭제를 막지 않습니다. 사진 레지스트리는 CASCADE로 삭제되지만 Storage 객체는 남고 소유권 정책도 더 이상 해당 경로를 찾지 못합니다. 따라서 이 직접 삭제 경로는 앱에 연결하지 않습니다.
- 보상 원장이 있는 기록의 직접 삭제는 원장의 FK 때문에 `23503`으로 차단됩니다. 이를 CASCADE로 바꾸면 잔액·구매·활동일·중복 보상 방지와 불일치할 수 있어 변경하지 않았습니다.
- 안전한 기록 삭제는 계정별 잠금, 삭제 중 재첨부 방지, 사진 분리/retire, Storage API 정리 및 실패 재시도, 원장·보상 보존 규칙을 함께 설계해야 합니다. 삭제 RPC는 이 설계 이후 추가합니다. FK만 완화하거나 메타데이터를 먼저 삭제하지 않습니다.

## 검증 실행

로컬(계정/네트워크 불필요, 메모리 DB만 사용):

```powershell
npm.cmd run test:db
node --test scripts/*.test.mjs
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
```

`test:db`에는 첫 파일 단독 설치와 읽기 전용 점검 SQL, 기존 스키마/테이블 충돌 시 원본 보존 및 전체 롤백, 13개 테이블 ACL/RLS, 17개 후속 함수 권한/search_path, 같은 접두사의 기존 함수 권한 보존, 순환 FK/삭제 위험, 49/50/99/100일 경계를 검증하는 `garden-schema-review.test.mjs`가 포함됩니다. 실행 엔진은 PGlite의 PostgreSQL 17.5이며 실제 Supabase 프로젝트 대신 최소 Auth/Storage fixture를 사용합니다. 원격 적용·실제 파일 삭제·JWT 검증 완료를 의미하지 않습니다.

실제 개발 프로젝트 SQL Editor에서는 `tests/garden_isolation.sql` 전체를 postgres로 실행합니다. 테스트용 A/B 계정 생성, 역할 변경, 보상/구매/사진 metadata 테스트 후 마지막 `ROLLBACK`으로 전부 되돌립니다. 성공 시 `OneStep SQL isolation checks passed` 행이 나옵니다. 이미 동일한 fixture ID가 있으면 시작부터 중단합니다. **Storage metadata 직접 INSERT/DELETE는 롤백되는 테스트 fixture 전용**입니다. 오류로 트랜잭션이 열려 있으면 `ROLLBACK;`을 실행하세요.

테스트 항목: 모든 사용자 테이블 A/B SELECT 격리 및 직접 쓰기 차단, anon 차단, 기본 정원/날짜 중복 방지, 추천/보상 재시도, 하루 25 상한, 잘못된 단계·응답 거부, 50/100일 보상, 부족 잔액, 구매 중간 실패 롤백, 중복 구매, 배치 소유/종류/revision, 사진 경로 위조·타인 연결·덮어쓰기·참조 중 삭제 차단, 업로드 실패 보존·교체 후 정리, 기존 광범위 정책 아래에서도 격리 유지.

운영 연결 전 실제 환경에서 추가 확인할 항목:

- 테스트 이메일 A/B로 Auth 신규 가입·세션 복원, trigger 기본 정원 생성 확인.
- A 세션 업로드/다운로드/삭제, B 세션 및 anon으로 A 파일 접근 실패 확인. 3 MiB 초과·비JPEG 업로드 거부 확인.
- 실패한 업로드/만료 토큰/네트워크 중단 후 기존 사진 유지와 staged/retired 정리 재시도 확인.
- 두 독립 연결에서 같은 사용자로 동시 구매/보상 RPC를 호출해 한 번만 지급/차감되고 잔액이 음수가 되지 않는지 확인. PGlite 테스트는 단일 연결이므로 이 동시성 검증을 대체하지 않습니다.

다음 단계에서만 서버 인증 검증, 사용자별 저장 어댑터, 사진 정리 작업, 계정 전환 시 메모리 캐시 분리와 정원 진입을 연결합니다. 기존 로컬 데이터 이전은 별도 백업·사용자 확인 이후에만 구현합니다.

공식 참고: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [DB 함수 권한](https://supabase.com/docs/guides/database/functions), [Storage 접근 정책](https://supabase.com/docs/guides/storage/security/access-control), [Storage 파일 삭제](https://supabase.com/docs/guides/storage/management/delete-objects).
