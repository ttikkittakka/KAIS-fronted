This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 오늘의 나 기록하기

돌아보기(기존 4개 질문) → 기록하기(사진 한 장·100자 코멘트) → 성장하기(300자 한마디) → 기존 추천 행동 3개 흐름입니다. 사진과 글은 선택 사항입니다. 질문 응답과 글은 입력할 때 저장되며, 사진은 미리보기 후 저장 버튼으로 확정합니다.

기록 탭은 실제 기록 날짜를 월별 달력에 표시합니다. 사진·코멘트·한마디를 수정하거나 삭제할 수 있습니다. 질문 응답은 추천 결과와의 일관성을 위해 완료 후 수정하지 않습니다.

날짜별 기록은 localStorage, 사진은 IndexedDB에 보관합니다. 기존 v1 기록은 읽을 때 이관되며, 완료 내역은 사진·글 수정 시 유지됩니다. 사진은 JPEG로 재인코딩하여 원본 EXIF/GPS를 보관하지 않습니다. 사진 삭제 실패 시 재시도 큐가 다음 실행에서도 정리를 이어갑니다.

현재 저장소에는 인증·사용자 DB·연령별 동의 시스템이 없습니다. 기기 식별자는 인증된 사용자 ID가 아니며, 같은 브라우저를 사용하는 사람 사이의 계정 접근 제어를 제공하지 않습니다. 서버 업로드나 AI 분석은 하지 않습니다. 브라우저 데이터 삭제 시 기록이 사라지며 기기 간 동기화는 지원하지 않습니다. 계정별 비공개 저장에는 인증 세션·DB 소유자 정책·비공개 사진 저장소 연동이 필요합니다.

검증 명령: node --test scripts/record-screens.test.mjs scripts/checkin-flow.test.mjs scripts/record-store.test.mjs scripts/daily-checkin.test.mjs scripts/daily-cares.test.mjs scripts/recommend-cares.test.mjs scripts/rive-plant.test.mjs

## 안정성 점검 (2026-10-12)

실행 확인: 외부 폰트 다운로드 없이 Next.js 프로덕션 빌드 성공. 프로덕션 서버 홈·폰트 199개·Rive 파일·기존 체크인 API HTTP 200 확인. 기존 다운로드 캐시와 번들한 폰트 199개의 바이트가 모두 일치하며 한글 unicode-range와 fallback metrics를 유지합니다. 폰트 라이선스는 public/fonts/OFL.txt에 있습니다.

자동 검증: 화면/React 이벤트 어댑터 및 메모리 IndexedDB 어댑터 테스트 58개 통과. 질문→사진→한마디→추천 행동, 선택/완료/이어하기, 달력 상세와 빈 상태, 저장·수정·삭제·복원, 자정 변경, 중복 완료, 용량 초과·손상·삭제 실패 재시도를 확인합니다. 사진 Blob 삭제 검증은 실제 브라우저 저장소 검증이 아닙니다. 앱 소스와 추가 검증 스크립트의 ESLint 통과. 저장소 전체 ESLint는 포함된 외부 ui-ux-pro-max 코드와 기존 주변 파일의 오류 때문에 별도 정리가 필요합니다.

수정: 사진 선택 취소 후 진행 버튼 잠김 해제 및 같은 페이지에서 미리보기 임시 보존, 파일 삭제 전에 재시도 저널 저장, 저장 실패한 글의 임시 보존·재시도, 손상/중복/잘못된 날짜 및 필드의 덮어쓰기 방지, 사진 저장소 차단·타임아웃 처리, HTTP 환경에서 randomUUID가 없는 경우 getRandomValues로 식별자 생성, 반복 조회 파싱 캐시, 날짜 변경 시 갱신, 오류 배너와 키보드 가시 영역 대응, 기록 달력 보조 글자와 터치 영역 보완. 사진 원본은 20MB 이하·32MP 이하이며 재인코딩 결과는 긴 변 1600px·최대 3MB로 제한합니다.

미검증: 현재 세션에 브라우저 연결이 없어 실제 모바일 레이아웃, OS 키보드, 카메라/파일 선택창, Safari/Chrome의 실제 IndexedDB 삭제·용량 한도, HEIC/EXIF 방향·위치 메타데이터 처리를 실기기에서 확인하지 못했습니다. CSS·VisualViewport 보완은 실기기 검증을 대신하지 않습니다.

출시 전: 위 실기기 시나리오, 공용 브라우저 접근 보호 및 안내, 장기 저장 용량과 복구/백업 정책, 손상된 기록의 복구 절차, 여러 탭에서 동시에 수정할 때의 충돌 정책을 확인해야 합니다. 저장 전 사진 미리보기와 저장 실패한 글은 메모리에만 있으며, 새로고침/종료 시 브라우저 경고를 제공합니다. 저장 전 사진 미리보기는 같은 페이지의 단계 이동·뒤로 가기에서도 메모리에 임시 보존됩니다. 새로고침/종료 경고를 무시하고 나가면 저장 전 초안은 사라집니다. 저장 실패한 글도 같은 페이지의 단계 이동 중 임시 보존하고 다시 저장할 수 있습니다. 사진과 글의 임시 초안은 디스크나 서버에 자동 저장하지 않습니다. 저장한 사진·글의 단계 이동/복원은 자동 검증했습니다. 계정별 비공개 접근 제어나 기기 간 동기화는 없습니다.

성능 측정: node scripts/record-storage-benchmark.mjs (합성 3,650일·각 300자 한마디/100자 코멘트/7일 추천 메타데이터). UTF-16 환산 약 9.4MB, 최초 읽기 약 163ms, 캐시 100회 읽기 약 0.074ms, 메모리 저장 어댑터 수정 약 31ms. Node 측정이므로 실제 모바일 저장 지연이나 브라우저 용량을 나타내지 않습니다. 사진 Blob을 모두 읽지 않습니다.

HTTP 확인: npm run build 후 npm run start -- --port 3101, 다른 터미널에서 node scripts/stability-http-check.mjs http://localhost:3101. 브라우저 데이터 삭제 시 복구할 백업은 없습니다.

기기 ID 호환성 참고: [W3C Web Cryptography Crypto interface](https://w3c.github.io/webcrypto/#crypto-interface)는 randomUUID에 SecureContext 제한을 명시합니다. 대체 생성 경로를 자동 테스트했으며 실제 모바일 HTTP 브라우저 확인은 남아 있습니다.


## 모바일 호환성·동시 편집 최종 점검 (2026-10-12)

### 이번 실행의 증거와 한계

- 프로덕션 빌드(TypeScript 포함) 성공. 기존 58개 + 추가 9개 = 자동 테스트 67개 통과. 앱 src 및 변경 테스트 ESLint 통과.
- next start 실서버 HTTP 확인: 홈/CSS 2개/JS 7개/로컬 폰트 199개/Rive 파일/API 모두 200, 추천 API 3개 반환. 화면을 클릭한 검증은 아니다.
- 브라우저 연결 목록은 비어 있었고, Windows Computer Use는 native pipe 연결 오류로 접근하지 못했다. iOS Safari / Android Chrome 화면, 터치, 키보드, 촬영, 실제 IndexedDB는 **미실행**이다.
- 추가 테스트는 Web Locks·React·이미지 디코더·IndexedDB 어댑터를 사용한다. 실제 두 탭이나 실제 HEIC 픽셀, EXIF 바이트, 실제 저장 용량 제한을 검증했다는 뜻이 아니다.
- 질문 데이터, 추천 로직, page.tsx의 기존 흐름, Rive 캐릭터·정원·애니메이션 코드는 이번 변경에서 수정하지 않았다.

### 적용한 안정성 개선

- 같은 origin에서 한 문서만 편집하도록 Web Locks 독점 잠금을 확보한 뒤 앱을 마운트한다. 다른 탭은 대기 안내를 표시하며, 기존 탭을 닫거나 새로고침해 잠금이 해제되면 최신 저장 데이터를 읽어 시작한다. 동시 편집 내용을 자동 병합하지 않는다.
- 잠금은 metadata 저장뿐 아니라 사진 write → 참조 저장 → 삭제 정리 전체와 초기 복구를 보호한다. 백그라운드 전환/시간 만료로 잠금을 빼앗지 않는다. 멈춘 탭의 늦은 저장과 새 탭의 저장이 겹치는 것을 피하기 위함이다. 사진이 저장되지 않은 상태에서 기존 탭을 강제로 닫으면 초안은 소실될 수 있다.
- React StrictMode/HMR 재마운트도 같은 문서의 요청 하나를 공유한다. 뒤로/앞으로 캐시에서 문서가 복구되면 새로고침해 소유권을 다시 확인한다. 종료/강제 종료 시 실제 잠금 회수 시간은 기기 검증 대상이다.
- HTTPS 및 Web Locks 지원이 필요하다. 미지원/접근 거부 시 안전하지 않은 동시 저장을 허용하지 않고 안내한다. localhost 개발은 사용할 수 있으나 휴대폰에서 LAN IP의 HTTP 주소로 접속하면 열리지 않을 수 있다. 로컬 ID 생성의 HTTP 대체 경로와 앱의 안전한 편집 허용 여부는 별개다.
- 새 잠금 코드를 실행하지 않는 **구버전 탭/열린 개발 페이지**는 협력 잠금으로 통제할 수 없다. 배포 검증 전 모든 기존 앱 탭을 닫고 새 버전으로 다시 열어야 한다. 잠금은 인증/계정 보안 기능이 아니다. [Web Locks 표준](https://www.w3.org/TR/web-locks/)
- 사진은 bitmap 디코딩에서 EXIF 방향 적용을 명시하고, 실패하면 native Image 디코더로 재시도한다. HEIC를 브라우저가 디코딩하지 못하면 JPG 변환 안내를 표시한다. 빈 MIME의 알려진 사진 확장자도 디코딩을 시도한다. JPEG 인코딩 결과 MIME도 확인한다.
- Safari의 HEIC 지원 발표는 호환성 참고 자료이며 이 앱의 실기기 성공 증거가 아니다. Android Chrome에서 HEIC 성공을 보장하지 않는다. 별도 HEIC 변환 라이브러리나 서버 전송은 추가하지 않았다. [WebKit Safari 17 HEIC 안내](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)
- 사진 쓰기 용량 초과 시 기존 사진과 새 미리보기를 유지하며 공간 부족 안내·재시도를 제공한다. 원본 대신 canvas 픽셀을 JPEG로 저장한다. 실제 GPS/촬영기기 EXIF 제거와 회전 결과는 아래 절차로 확인해야 한다.
- 뒤로 가기·행동 선택·오류 재시도의 최소 터치 높이를 44px로 보완했다. 높이가 작은 터치 기기 가로 화면에서도 고정 최소 높이 때문에 화면이 잘리지 않도록 처리했다. 기존 16px 입력창, VisualViewport, 스크롤, safe area 처리는 유지했다. 실제 화면 합격 판정은 하지 않았다.

### 실기기 수동 검증 절차 — 모든 항목 미실행

실사용 기록이 없는 전용 QA origin/프로필에서 테스트한다. 같은 scheme/host/port를 끝까지 사용한다. 포트나 HTTP/HTTPS가 바뀌면 별도 저장소다. 모바일은 신뢰할 수 있는 HTTPS의 프로덕션 빌드에 연결한다. 실제 사용자 사진 대신 동의된 테스트 이미지와 합성 문구만 사용한다.

각 실행에 기기 모델, OS 버전, 브라우저 버전, 빌드 커밋, origin, CSS viewport(폭×높이), 일반/비공개 모드, 시간, 결과(통과/실패/미실행), 스크린샷 또는 녹화 및 콘솔 오류를 남긴다. 실제 iPhone Safari와 Android Chrome을 각각 실행하며 작은 화면(320~375px), 일반 화면(390~430px), 가로 화면을 포함한다. 데스크톱 기기 에뮬레이션은 보조 결과로만 기록한다.

| 순서 | 동작 | 합격 조건 | 현재 상태 |
| --- | --- | --- | --- |
| 1 | 시작 → 메인 → 질문 4개(잠·에너지·식사·마음) | STEP 표시/질문 진행 구분, 선택 버튼이 스크롤로 모두 도달 가능 | 미실행 |
| 2 | 사진 없이 STEP 2 → STEP 3 → 빈 글로 추천 | 3개 추천, 입력 강제 없음, 가로 스크롤/버튼 잘림 없음 | 미실행 |
| 3 | 코멘트 100자·한마디 300자에 한국어 조합 입력, 선택·붙여넣기·삭제 | 글자수 제한, 조합 중 글 소실 없음, 16px 입력/키보드 열고 닫기/회전 후 입력 끝과 버튼 도달 가능 | 미실행 |
| 4 | 입력 중 이전/다음 단계, 브라우저 뒤로/앞으로, 새로고침, 앱 전환 | 저장된 글·사진 유지; 실패/미확정 초안은 안내 후 같은 페이지 이동에서 유지(강제 종료 영속성은 없음) | 미실행 |
| 5 | 행동 1개 → 다른 돌봄 → 2개 → 3개 완료 | 정원 변화·캐릭터·애니메이션, 완료 개수별 버튼, 재진입 시 중복 보상 없음 | 미실행 |
| 6 | 기록 탭에서 날짜/월 이동, 빈 날짜, 수정·삭제 | 네 답변/사진/코멘트/한마디/행동 완료 연결, 빈 상태 안내, 수정 후 재접속 유지 | 미실행 |
| 7 | 모든 화면에서 주소창 확장/축소, 화면 회전, 글자 크기 확대, 확대/축소 | 터치 오작동·겹침 없음, 내용/주요 버튼 스크롤 접근 가능. 달력은 7열 간격도 확인 | 미실행 |

사진 테스트는 같은 날짜에서 촬영 → 선택 취소 → 선택 → 미리보기 → 저장 → 변경 → 저장 → 삭제 순서로 실행한다. 취소 후 다음 단계가 잠기지 않는지, 같은 파일을 다시 선택할 수 있는지, 사진 1장만 연결되는지 확인한다. 실제 카메라 권한/취소/사진 라이브러리 선택창 동작도 별도로 기록한다.

파일 매트릭스: JPEG(정방향, EXIF Orientation 6/8, GPS 포함), PNG(투명), WebP, iPhone 원본 HEIC/HEIF, 손상 파일, MIME 빈 파일, 20MiB 초과, 32MP 초과(예: 48MP 촬영), 저용량이지만 큰 해상도. HEIC는 디코딩 성공 또는 구체적인 JPG 재선택 안내가 있어야 하며 실패 시 기존 사진/코멘트를 보존해야 한다. 32MP 초과는 현재 정책상 거절될 수 있고 고해상도 iPhone 촬영도 이 제한에 해당한다.

원본과 IndexedDB에서 추출한 **저장된 Blob**을 비교한다. 결과는 JPEG, 긴 변 ≤1600px, ≤3MiB여야 한다. 저장된 파일을 로컬 메타데이터 도구로 검사해 GPS·촬영기기·원본 EXIF가 없는지 확인하고, 사진에 인쇄된 UP/LEFT 표식으로 회전/좌우 방향도 대조한다. 화면 미리보기만으로 EXIF 제거를 판정하지 않는다. 온라인 메타데이터 검사 사이트에 개인 사진을 업로드하지 않는다.

### 실제 IndexedDB·두 탭 검증

Mac Safari Web Inspector 또는 Android 원격 Chrome DevTools를 사용한다. 아래 저장소를 확인한다.

- localStorage: little-garden.records.v1 (정본), little-garden.daily-checkin.v1 (호환용 mirror), little-garden.photo-deletions.v1 (삭제 재시도 목록).
- IndexedDB: little-garden.private-photos.v1 → photos. 각 record.photoId로 Blob을 찾는다.

1. 사진 A 저장 후 metadata.photoId, Blob 타입/바이트, 새로고침 후 조회를 확인한다. 다른 날짜에 사진 B를 저장하고 A와 B가 분리되는지 확인한다.
2. 오늘 사진 C로 변경한 뒤 이전 A 키를 조회한다. 기존 날짜 B는 유지되고 A는 없어야 한다. 사진 삭제 후 record.photoId가 없어지고 photoComment가 비어야 하며 C 키 조회 결과도 undefined여야 한다. 파일 정리 실패가 표시되면 재시도 후 삭제까지 확인하고 합격 처리한다. 남아 있는 **다른 날짜의 유효한 사진**은 삭제하면 안 된다.
3. DevTools의 Storage에서 custom quota를 낮춘 후 새 사진 저장과 기존 사진 변경을 각각 시도한다. 실제 IndexedDB transaction의 QuotaExceededError/abort와 기존 Blob 보존, 실패 미리보기, quota 해제 후 재시도를 확인한다. 이것은 **실제 브라우저의 quota override 실험**이지 실제 기기의 디스크 부족 검증은 아니다. 지원되지 않는 원격 환경에서는 데스크톱 보조 결과로만 남긴다. [Chrome DevTools Storage 설명](https://developer.chrome.com/docs/devtools/application)
4. iOS Safari의 실제 용량 초과는 별도 시험용 기기/프로필에서 운영체제·브라우저가 거절한 거래를 확인해야 한다. 제한된 시험 예산 내에서 재현되지 않으면 미확인으로 둔다. 무제한 filler로 개인 기기 디스크를 채우지 않는다. API에 에러만 주입한 테스트는 자동/모의 테스트로만 분류한다.
5. 실제 종료 후 재실행, 기기 재부팅, 백그라운드에서 OS에 의해 종료, 일반/비공개 모드의 유지 여부를 분리 기록한다. QA 데이터만 지운 뒤 복구된다고 잘못 표시하지 않는지도 확인한다.
6. 새 버전 탭 A에서 기록을 열고 B/C를 같은 origin에 연다. B/C는 대기 상태여야 한다. A에서 글 수정/사진 교체/완료 처리를 저장하고 A를 닫는다. 다음 한 탭만 열리고, 최신 글·사진·완료 내역이 유지되어야 한다. 나머지는 대기한다.
7. A가 사진 저장 중일 때 B로 전환, A 새로고침/닫기, 저장 오류 뒤 닫기, 브라우저 강제 종료 후 재진입, 뒤로/앞으로 캐시 복귀를 각각 반복한다. 열려 있는 백그라운드 A는 계속 소유자이며 B가 잠금을 훔치면 안 된다. A 문서가 종료되면 대기 탭이 이어서 열려야 한다. 참조된 사진 누락/같은 날짜 중복/보상 재지급이 없어야 한다.
8. 원래 코드의 구버전 탭을 남기는 업그레이드 상황은 이번 협력 잠금의 보장 범위 밖이다. 테스트 시작/배포 안내에서 기존 탭을 모두 종료한다. 다음 버전에서는 저장 스키마 버전 전환 정책도 함께 검토한다.

### 장기 저장·백업/복원 제안 — 아직 구현하지 않음

| 항목 | 권장 정책 |
| --- | --- |
| 사진 | 현행 하루 1장·1600px·JPEG·최대 3MiB 유지. 매일 최대 크기면 365일에 1,095MiB(약 1.07GiB): 실제 측정이 아닌 상한 산술치. 오래된 사진을 자동 삭제하지 않는다. |
| 용량 가시성 | 사진 Blob.size 합계, 기록 JSON 용량, origin의 storage.estimate를 함께 표시. 예: 사진 200MiB 또는 추정 quota 70%에서 백업 권유, 90%에서 사진 저장 전 여유 재확인. 수치는 기기 시험 후 확정할 제품 정책안이다. |
| 실패 처리 | estimate는 참고값이며 저장 성공 보장이 아니다. 실제 write/commit 실패 처리 유지. 교체 중 기존 사진+신규 사진을 동시에 둘 여유도 계산하고, 공간 부족해도 기존 기록을 지우지 않는다. |
| 보관 지속성 | 선택적 navigator.storage.persist 요청을 검토하되 허용/거부와 별개로 백업 제공. 사용자 사이트 데이터 삭제·기기 손실을 막는다고 안내하지 않는다. |
| 텍스트 누적 | localStorage 정본은 동기 전체 직렬화 및 별도 quota 제약이 있다. 출시 후 장기 저장을 약속하려면 records를 IndexedDB로 옮기는 버전형 마이그레이션을 별도 작업으로 검증. 현재 구조는 이번에 유지했다. |
| 백업 | 명시적 사용자 동작으로 날짜별 records.json + photos/*.jpg + version/파일 길이/SHA-256 manifest를 묶어 로컬 파일로 내보내기. 사진 base64를 localStorage에 복사하지 않는다. 민감 기록을 고려해 암호화 백업을 기본안으로 검토하고 비밀번호 분실 시 복원 불가를 안내. 자동 서버 전송 없음. |
| 복원 | 파일 크기/개수/경로/스키마/날짜/문자 길이/사진 형식/해시부터 검증. 현재 기록을 먼저 백업하고, 충돌 날짜는 기존 유지가 기본. 덮어쓰기는 날짜별 미리보기와 명시적 선택을 거친다. |
| 원자성 | 모든 기록·사진을 임시 영역에 준비·검증한 뒤 활성 데이터 전환. 현재 localStorage+IndexedDB는 한 transaction이 아니므로 복원 journal/rollback 또는 통합 IndexedDB 스키마가 선행돼야 한다. 실패 시 기존 데이터 유지, 미완료 복원은 다음 실행에서 복구. |
| 식별자/보상 | 백업의 기기 ID를 인증으로 믿지 않고 현재 기기 namespace로 사진 참조를 재매핑. 복원 시 완료 이벤트/보상 지급 함수를 실행하지 않는다. 완료 ID 중복 제거, 같은 파일 재복원 idempotency 검증. |
| 모바일 메모리 | 연도/기간 단위 백업과 파일 크기 상한을 두고 전체 사진을 한꺼번에 메모리에 올리지 않기. 실제 iOS 파일 저장/공유·Android 다운로드·암호화·오류 재시도 시험 필수. |

storage.estimate의 quota는 사용 가능 공간을 보장하지 않으며 persistence도 백업을 대체하지 않는다. [WebKit 저장 정책](https://webkit.org/blog/14403/updates-to-storage-policy/) 현재 앱에는 백업/복원, 계정 인증, 서버 DB, 동기화가 없으며 동일 브라우저 사용자는 기록에 접근할 수 있다.

출시 전 필수: 위 실기기 표를 실제 기기에서 완료하고, 실제 EXIF/HEIC·IndexedDB 제거·용량 실패·두 탭/강제 종료 결과를 확보한다. HTTPS/지원 브라우저와 단일 편집 탭 정책을 검증하고, 장기 보관을 제공하기 전에 백업/복원과 저장 용량 정책을 구현·복원 시험까지 마친다.

재현 명령:

~~~sh
node --test scripts/record-session.test.mjs scripts/record-screens.test.mjs scripts/record-store.test.mjs scripts/checkin-flow.test.mjs scripts/daily-checkin.test.mjs scripts/daily-cares.test.mjs scripts/recommend-cares.test.mjs scripts/rive-plant.test.mjs
node node_modules/eslint/bin/eslint.js src scripts/record-session.test.mjs scripts/record-store.test.mjs scripts/record-screens.test.mjs
npm run build
# 별도 터미널의 next start --port 3101 실행 후 (UI 테스트 아님):
node scripts/stability-http-check.mjs http://localhost:3101
~~~


## 작은 돌봄 카탈로그 v2 개편 (2026-10-13)

활성 미션 30개, 카테고리 5개×6개. 기존 ID 15개 유지 + 새 ID 15개 추가 + 기존 17개 비활성 = 전체 유효 ID 47개다. 기존 32개 원본은 legacy-cares.ts에 그대로 보존한다. 문구/행동이 실질적으로 바뀐 통합 미션에는 새 ID를 쓴다.

| 번호 | 카테고리 | 미션 | 시간 | ID | 처리 |
| --- | --- | --- | --- | --- | --- |
| 1 | 몸 돌보기 | 물 몇 모금 | 1분 | water | 기존 ID 유지 |
| 2 | 몸 돌보기 | 간단한 것 하나 먹기 | 3분 | snack | 기존 ID 유지 |
| 3 | 몸 돌보기 | 3분만 눈 감기 | 3분 | rest | 기존 ID 유지 |
| 4 | 몸 돌보기 | 편안한 곳에 기대기 | 2분 | comfortable-lean | 새 ID |
| 5 | 몸 돌보기 | 마시기 편한 음료 천천히 즐기기 | 3분 | easy-drink | 새 ID |
| 6 | 몸 돌보기 | 내 몸에 필요한 것 하나 떠올리기 | 1분 | body-need | 새 ID |
| 7 | 마음 쉬어가기 | 천천히 숨 내쉬기 | 1분 | breathe | 기존 ID 유지 |
| 8 | 마음 쉬어가기 | 아무것도 하지 않고 2분 | 2분 | pause | 기존 ID 유지 |
| 9 | 마음 쉬어가기 | 좋아하는 노래 한 곡 | 3분 | music | 기존 ID 유지 |
| 10 | 마음 쉬어가기 | 휴대폰 잠깐 내려놓기 | 3분 | phone-down | 기존 ID 유지 |
| 11 | 마음 쉬어가기 | 부드러운 촉감 느끼기 | 1분 | texture | 기존 ID 유지 |
| 12 | 마음 쉬어가기 | 지금 들리는 소리 세 가지 찾기 | 1분 | three-sounds | 새 ID |
| 13 | 나를 이해하기 | 기분 한 단어 적기 | 1분 | mood-word | 기존 ID 유지 |
| 14 | 나를 이해하기 | 지금 필요한 것 하나 골라보기 | 1분 | choose-need | 새 ID |
| 15 | 나를 이해하기 | 나에게 다정한 한마디 | 1분 | kind-word | 새 ID |
| 16 | 나를 이해하기 | 오늘 괜찮았던 순간 떠올리기 | 2분 | okay-moment | 새 ID |
| 17 | 나를 이해하기 | 하기 싫은 마음도 인정하기 | 1분 | accept-reluctance | 새 ID |
| 18 | 나를 이해하기 | 지금의 나에게 질문 하나 | 2분 | self-question | 새 ID |
| 19 | 일상에 작은 변화 | 하늘 바라보기 | 2분 | sky | 기존 ID 유지 |
| 20 | 일상에 작은 변화 | 몸 한 번 펴기 | 2분 | stretch | 기존 ID 유지 |
| 21 | 일상에 작은 변화 | 어깨 내려놓기 | 1분 | shoulders | 기존 ID 유지 |
| 22 | 일상에 작은 변화 | 물건 하나만 제자리로 | 1분 | tidy | 기존 ID 유지 |
| 23 | 일상에 작은 변화 | 빛과 공기 느끼기 | 1분 | light-air | 새 ID |
| 24 | 일상에 작은 변화 | 잠깐 걷거나 몸 움직이기 | 2분 | gentle-move | 새 ID |
| 25 | 세상과 연결되기 | 좋아하는 것 하나 바라보기 | 1분 | favorite | 기존 ID 유지 |
| 26 | 세상과 연결되기 | 짧은 안부 보내기 | 2분 | hello | 기존 ID 유지 |
| 27 | 세상과 연결되기 | 고마운 사람 한 명 떠올리기 | 1분 | grateful-person | 새 ID |
| 28 | 세상과 연결되기 | 안심되는 장소 떠올리기 | 1분 | safe-place | 새 ID |
| 29 | 세상과 연결되기 | 내가 좋아하는 것 하나 적기 | 1분 | favorite-note | 새 ID |
| 30 | 세상과 연결되기 | 누군가에게 도움 요청하는 말 생각하기 | 2분 | ask-help | 새 ID |

비활성 ID 대응은 콘텐츠 관계를 설명하기 위한 표이며 **저장된 완료 ID를 새 ID로 치환하지 않는다**. 바뀐 미션의 완료를 자동 인정하거나 보상을 다시 지급하지 않는다.

| 기존 ID | 새 콘텐츠 대응 | 처리 |
| --- | --- | --- |
| window | light-air | 비활성·과거 기록 보존 |
| walk | gentle-move | 비활성·과거 기록 보존 |
| warm-drink | easy-drink | 비활성·과거 기록 보존 |
| wash | 직접 대체 없음 | 비활성·과거 기록 보존 |
| sunlight | light-air | 비활성·과거 기록 보존 |
| wash-hands | 직접 대체 없음 | 비활성·과거 기록 보존 |
| brush | 직접 대체 없음 | 비활성·과거 기록 보존 |
| lean | comfortable-lean | 비활성·과거 기록 보존 |
| dim-light | 직접 대체 없음 | 비활성·과거 기록 보존 |
| neck | stretch | 비활성·과거 기록 보존 |
| shoulder-roll | stretch | 비활성·과거 기록 보존 |
| stand | gentle-move | 비활성·과거 기록 보존 |
| short-walk | gentle-move | 비활성·과거 기록 보존 |
| curtain | light-air | 비활성·과거 기록 보존 |
| blanket | comfortable-lean | 비활성·과거 기록 보존 |
| leaf-view | 직접 대체 없음 | 비활성·과거 기록 보존 |
| emoji | 직접 대체 없음 | 비활성·과거 기록 보존 |

### 추천 규칙

- 신규 추천 후보는 ACTIVE_CARES만 사용한다. 같은 미션을 중복 선택하지 않는다.
- 가능한 후보 중 아직 선택하지 않은 카테고리를 우선하고, 행동 유사 그룹(similarity)도 겹치지 않게 고른다. 이후 아직 충족하지 않은 응답 필요에 해당하는 미션을 우선한다. 카테고리/유사 그룹 후보가 없을 때만 완화하지만, 현재 카탈로그 400가지 유효 응답×28일에서는 매번 서로 다른 카테고리와 유사 그룹 3개를 반환한다.
- 가중치는 기본 1 + 해당 질문의 low/very_low 조건마다 5. 예를 들어 body-need는 에너지·식사 둘 다 낮으면 11이다. 최근 3일 추천 ID는 가중치에 0.2를 곱해 반복을 줄인다. 필요/카테고리 균형을 먼저 적용하므로 반복을 완전히 금지하지 않는다.
- 잠 부족: comfortable-lean, rest, pause, phone-down, breathe. 에너지 부족: water, body-need, music, comfortable-lean, choose-need. 식사 부족: snack, water, body-need, choose-need. 마음이 무거움: kind-word, texture, choose-need, accept-reluctance, safe-place, three-sounds. 각 목록이 해당 조건 +5 대상이다.
- 편안한 상태 가중치 +5: gentle-move, sky, light-air, hello, okay-moment, favorite. 기존 기준대로 질문을 모두 답하고, 낮은 응답이 하나도 없으며 에너지와 마음이 good/very_good일 때 적용한다.
- 답변 미완성/잘못된 값, energy=very_low, 또는 sleep=very_low이고 에너지도 낮으면 minimal 행동만 사용한다. gentle-move와 실제 연락 행동 hello는 편안한 상태에서만 후보가 된다. 낮은 상태에서도 사람/장소를 떠올리는 조용한 연결 행동은 가능하다. 음식을 먹거나 세 행동을 모두 수행하도록 강제하지 않는다.
- 날짜 기반 난수는 결정적이다. 생성한 당일 ID·순서·제목을 저장하므로 재진입/새로고침/응답 수정으로 바꾸지 않는다. 사진·코멘트·일기는 추천 함수에 전달하지 않는다. 임상 진단이나 검증된 치료 규칙을 의미하지 않으며 전문가 검토는 별도다.

### 호환성과 상세 표시

- 신규 추천에 catalogVersion: 2를 추가한다. 일별 기록 version: 1, 날짜 키, 브라우저 저장소, 완료 ID 저장 방식, 동시 편집 잠금은 유지한다.
- 버전 필드가 없는 기존 추천은 기존 32개 원본 카탈로그에서 이름·설명·시간·아이콘을 읽는다. 이미 생성된 오늘의 추천도 비활성 ID가 있더라도 그대로 보여준다. 이는 기존 목록/완료 상태를 보존하기 위한 의도적인 예외다. 새로 생성하는 날짜의 추천에만 활성 30개를 사용한다.
- 원본 32개 데이터 복사 일치 확인 완료. 저장/복원 테스트에서 32개 ID 전부의 이름·설명·시간·아이콘·완료 ID 보존 확인. 저장된 ID를 일괄 치환하거나 기록을 삭제하는 마이그레이션은 실행하지 않는다.
- 새 카탈로그 문구는 버전별로 보존해야 한다. 다음 문구 개편 때 v2 원본을 보관하고 새 카탈로그 버전을 추가한다.
- page.tsx 변경은 기존 상세 영역에서 instruction, example, helper를 표시하는 한 부분뿐이다. 카드 설명은 copy, 기존 버튼/완료 처리/정원 성장과 캐릭터·애니메이션/CSS는 그대로다. 유지한 미션 ID의 아이콘·톤도 기존 값을 사용한다.

### 검증 결과

- 자동 테스트 **81개 통과**: 앞서 실행한 67개, 기존 저장소의 MVP 테스트 5개, 이번 카탈로그/호환성/상세/기록 테스트 9개. 기존 테스트는 삭제하지 않았고, 개편과 상충하는 기대값(32개 활성·10개 카테고리·폐기 미션 추천)은 원본 보존/신규 30개/새 후보 검사로 갱신했다.
- TypeScript tsc --noEmit 통과, src와 변경 테스트 ESLint 통과, Next 프로덕션 빌드(TypeScript 포함) 성공. 저장소 전체 lint는 이 결과에 포함하지 않는다.
- 유효 응답 400조합×28일 = 11,200건(최근 추천 있음/없음 포함): 활성 3개, 중복 없음, 3개 카테고리/유사 그룹. 개별 low/very_low 우선 후보, 모두 낮을 때 최소 부담 및 필요 균형 확인.
- 새 미션 30개 모두 상세 안내·예시·보조 문구와 기존 해볼게요→완료했어요 이벤트 확인. 과거 walk/warm-drink/emoji의 날짜별 이름·완료 표시 확인. 새로고침·오늘 목록 고정·중복 완료 방지·정원·캐릭터 회귀 테스트 통과.
- 위 화면 테스트는 React/브라우저 저장 어댑터 자동 테스트다. 연결된 실제 브라우저가 없어 iOS Safari/Android Chrome의 문구 줄바꿈, 상세 페이지 스크롤/버튼 도달성, 실제 화면 이동·애니메이션 및 실제 저장 복원은 이번에 미검증이다. 출시 전 긴 안내/예시가 있는 상세 화면을 작은 모바일 화면에서 확인한다.

변경 파일: src/app/cares.ts, 신규 src/app/legacy-cares.ts, src/app/recommend-cares.ts, src/app/daily-cares.ts, src/app/page.tsx(상세 문구 표시만), scripts/recommend-cares.test.mjs, 신규 scripts/care-catalog.test.mjs, scripts/checkin-flow.test.mjs, scripts/record-screens.test.mjs, README.md.

검증 명령:

~~~sh
node --test scripts/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src scripts/care-catalog.test.mjs scripts/checkin-flow.test.mjs scripts/record-screens.test.mjs scripts/recommend-cares.test.mjs
npm run build
~~~


## 하단 탭 고정·스크롤 분리 (2026-10-13)

정원/기록의 BottomNav가 스크롤 및 screen-in transform 애니메이션이 적용되는 screen 내부에 있었다. 두 화면에서 탭을 제거하고 phone-frame의 공통 자식으로 한 번만 렌더링한다. 탭은 72px의 줄어들지 않는 flex 영역, 화면은 min-height:0의 나머지 영역으로 배치해 화면만 스크롤한다. 탭 자체의 아이콘·문구·색·선택 상태·둥근 카드 스타일은 유지한다.

모바일 app-shell은 보이는 뷰포트에 고정하고 height는 VisualViewport.height(미지원 시 100dvh), top은 VisualViewport.offsetTop을 따른다. 주소창/키보드에 의한 resize와 pan을 각각 처리한다. pan 이벤트는 입력창 scrollIntoView를 다시 호출하지 않아 스크롤 피드백을 피한다. viewport-fit=cover 및 safe-area 상단/좌우, 탭 하단 여백을 적용한다. 기존 화면 전환/캐릭터 애니메이션은 그대로이며 탭은 화면 애니메이션 밖에 둔다. 기존 최소 높이 680px은 짧은 화면에서 프레임이 넘치지 않도록 해제한다.

콘텐츠와 탭은 겹치지 않는 형제 영역이므로 기존 overlay용 106px 하단 패딩 대신 콘텐츠 끝 24px 여백을 둔다. 모바일 셸의 overflow는 hidden, 화면의 overflow-y는 auto다. 정원과 기록에서 같은 규칙을 사용하며 질문·추천·저장·성장 로직은 변경하지 않았다.

자동 검증: 기존 81개 + 탭 구조/선택·이동 2개 + 뷰포트 이벤트 2개 = **85개 테스트 통과**. TypeScript, src 및 변경 테스트 ESLint, 프로덕션 빌드 통과. 기존 재진입 테스트는 이동 콜백의 위치 변경에 맞춰 공통 탭 → 정원 → 추천 순서로 보정했다. 이 결과는 실제 CSS 픽셀 위치 검증이 아니다.

실제 브라우저 연결 목록이 비어 있어 아래 항목은 모두 **실기기 미검증**이다. iOS Safari/Android Chrome에서 각각 확인해야 한다.

1. 정원 최상단/최하단 스크롤에서 탭이 보이는 화면 하단의 동일 위치인지.
2. 기록의 달력 및 긴 사진·글 기록 끝까지 스크롤했을 때 마지막 내용과 수정/삭제 버튼이 탭 위에서 보이는지.
3. 짧은 빈 기록과 긴 기록 사이를 바꿔도 탭 높이와 위치가 유지되는지.
4. 주소창 확장/축소, 세로/가로 회전, 작은 높이에서 앱 셸 밖의 이중 스크롤이 없는지.
5. 코멘트/한마디의 키보드를 열고 닫거나 입력 커서를 이동해도 입력창·주요 버튼에 스크롤로 도달할 수 있는지.
6. iPhone 홈 인디케이터/노치와 탭이 겹치지 않는지.
7. 정원↔기록 전환 시 콘텐츠 애니메이션은 유지되고 탭은 흔들리지 않는지.
8. 탭의 아이콘·색상·선택 표시 및 기존 질문·추천·완료·정원 흐름에 회귀가 없는지.

이번 변경 파일: src/app/page.tsx, src/app/globals.css, src/app/layout.tsx, scripts/checkin-flow.test.mjs, 신규 scripts/navigation-viewport.test.mjs, README.md.

## 관리자 테스트 잠금 (개발용 MVP)

개발 서버에서 설정 → 개발자 테스트를 열면 숫자 4자리 비밀번호 입력창이 표시됩니다. 비밀번호는 문자열로 서버의 `POST /api/developer/unlock`에 전송하며, 서버 전용 `ADMIN_TEST_PASSWORD` 환경 변수와 비교합니다. 로컬 `.env.development.local`에 이 값을 설정한 뒤 `npm run dev`를 실행하세요. 환경 파일은 Git에서 제외되므로 다른 개발 환경에서는 별도 설정이 필요합니다. `NEXT_PUBLIC_` 변수로 비밀번호를 설정하지 마세요.

잠금 해제 상태는 해당 페이지 메모리에만 존재합니다. OFF, 새로고침, 새 탭 또는 앱 재실행 후에는 다시 입력해야 합니다. 이전 localStorage의 관리자 ON 값은 무시하며 기존 기록·햇살·캐릭터·정원·테스트 저장소를 지우거나 마이그레이션하지 않습니다. 저장 중에는 기존 데이터 보호를 위해 모드 전환이 차단됩니다.

이 기능은 발표·개발용 잠금이며 운영 관리자 인증이 아닙니다. 클라이언트의 로컬 데이터 조작에 대한 보안 경계가 될 수 없습니다. production 웹 빌드에서는 메뉴, 관리자 데이터 변경 함수와 검증 API를 모두 차단합니다. 독립 네이티브 `android/` 앱에는 관리자 데이터 변경 기능이 구현되어 있지 않으며 이 웹 잠금을 APK에 추가하지 않습니다. 일반 배포 APK에 개발 웹 서버를 연결해 관리자 기능을 노출하지 마세요.

검증: `node --test scripts/developer-lock.test.mjs scripts/developer-mode.test.mjs scripts/developer-settings.test.mjs`.
