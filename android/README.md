# 오늘의 정원 — Native Android MVP

기존 `../public/design-preview/index.html`과 `prototype.js`의 디자인·문구·상태 규칙을 Kotlin / Jetpack Compose / Material 3로 옮긴 독립 Android Studio 프로젝트입니다. WebView, HTML 렌더링, 서버 연결을 사용하지 않습니다. 기존 웹 앱과 브라우저 저장 데이터는 수정하지 않습니다. Figma에는 저장하지 않았습니다.

## 현재 검증 상태

- 실제 Kotlin 도메인 모델을 컴파일하고 20개 검사를 실행: 통과.
- Kotlin 소스 24개 구문 검사, Android 리소스 XML 구문, QA 스크립트 문법: 통과. Android 타입 검사나 APK 빌드 성공을 뜻하지 않습니다.
- 원본과 Android Rive 파일 SHA-256 일치: 확인.
- Compose UI 테스트, DataStore 재생성 테스트, 세 화면 크기 QA 실행 스크립트: 작성됨, 기기 실행 전.
- APK 빌드 및 에뮬레이터 검증: 이 작업 환경에서 완료하지 못함. 온라인 Gradle 플러그인 해석 실패 후 읽기 전용 캐시로 프로젝트 설정 단계는 통과했으나 최종적으로 `SDK location not found`에서 중단됨. 기존 SDK/ADB 경로 접근 제한도 확인됨. 이 소스를 빌드·시각 검증 완료한 APK로 간주하지 마세요.
- 웹 preview는 HTTP 200을 확인했지만 연결된 앱 브라우저가 없어 직접 조작 검증은 불가했습니다. HTML/CSS/JS와 기존 렌더링 결과를 기준으로 옮겼습니다.

## 재사용과 네이티브 구현의 경계

| 기존 구현에서 유지 | Android에서 구현 |
| --- | --- |
| Paper `#F7F5EE`, Forest `#3F5D46`, Sage `#DFE8DC` 등 색상 | Compose 테마, 시스템 한글 폰트, sp/dp |
| 24px 화면 여백, 18px 버튼·20px 카드 모서리, 제목/본문 위계 | 24dp 여백, 48dp 이상 터치 영역, 글자 확대 시 카드 재배치 |
| 온보딩 / 정원 / 기록 질문 / 작은 돌봄 / 기록 화면 | Navigation Compose, 시스템 뒤로가기, 수직 스크롤 |
| 4개 질문·선택지·3개 행동·한국어 문구 | ViewModel + SavedStateHandle 입력 초안 |
| 원본 SVG 아이콘의 경로 | Compose Canvas 벡터 |
| 원본 Rive 바이트·애니메이션 이름과 재생 길이 | Android RiveAnimationView를 Compose AndroidView로 연결 |
| 기분과 기록 누적의 분리 | 날짜별 DataStore JSON, 원자적 저장, 완료 후 이동 |
| 웹의 모션 중지 기능 | 앱 설정 + Android 애니메이션 비활성 설정 존중 |

390 × 844를 기준으로 dp 기반 유동 폭을 사용합니다. 360/390/412dp 폭을 위한 QA 스크립트가 있습니다. 태블릿에서는 콘텐츠 폭을 600dp로 제한합니다. 상태 표시줄·제스처 영역은 window insets, 한마디 입력은 adjustResize 및 IME padding으로 처리합니다. 실제 폰트 확대·키보드 가림 여부는 기기 QA가 필요합니다.

## 화면과 저장 규칙

새 실행은 기록 여부와 무관하게 항상 시작 화면입니다. “오늘의 나를 만나러 가볼까요?”와 작은 원본 식물을 보여주고, [시작하기]를 누르면 정원으로 이동합니다. 시작 화면은 뒤로가기 스택에서 제거합니다. 정원 → 나의 일상 기록 → 저장 성공 → 작은 돌봄 순서로 연결됩니다. 기록이 있으면 Home의 버튼만 달라집니다: 미기록은 나의 일상 기록하기, 기록 완료는 오늘의 작은 돌봄 보기, 세 행동 완료는 오늘의 작은 돌봄 다시보기입니다. 다시보기는 별도 care_history 경로입니다. 세 행동 완료 반응 후에는 Home으로 돌아갑니다. 돌봄에서 뒤로가면 기록 화면, 기록 첫 질문에서 뒤로가면 정원으로 돌아갑니다. 기록 화면에서는 이전 질문으로 이동할 수 있습니다.

- 로컬 저장을 읽기 전에는 기록/돌봄 화면을 렌더링하지 않습니다.
- 오늘의 유효한 기록이 없으면 돌봄 화면은 렌더링하지 않고 기록 화면으로 이동합니다.
- MainActivity는 ComponentActivity의 retained non-configuration instance가 있는 구성 변경에서만 savedInstanceState를 전달합니다. 새 Activity/프로세스 실행은 이전 NavController 상태를 복원하지 않습니다. 화면 회전은 진행 중 화면과 질문을 유지합니다. DataStore 기록은 이 분기와 독립적입니다. 기존 Activity로 단순 복귀하는 것은 새 실행과 구별합니다.
- 앱이 foreground로 돌아올 때와 foreground에서 날짜를 확인합니다. 자정 이후 오늘 기록이 없으면 돌봄 접근을 차단합니다.
- 수면·에너지·식사·기분 4개가 모두 유효해야 저장됩니다. 메모는 선택 사항입니다.
- 쓰기 실패 시 이동하지 않고 입력을 유지합니다. 읽기 오류 시 기존 저장 파일을 삭제하거나 빈 데이터로 대체하지 않습니다.
- 같은 날 기록을 수정해도 완료한 돌봄은 유지합니다. 중복 완료는 추가 적립하지 않습니다.
- 좋은 기분 여부와 무관하게 서로 다른 기록 날짜가 쌓입니다. 연속 기록·점수·랭킹·결석 페널티가 없습니다.
- DataStore 파일 `little_garden_v1.preferences_pb`, 키 `garden_json_v1`, 스키마 버전 1입니다. 기록마다 날짜, 답변, 메모, 식물 상태, 완료 행동 ID가 저장됩니다.
- 브라우저 localStorage를 자동으로 Android로 가져오지는 않습니다. 새 앱의 로컬 저장소이며 웹 데이터는 그대로 남습니다. 계정/서버 동기화도 이 MVP 범위에는 없습니다.

## 원본 Rive 연결

`app/src/main/res/raw/plant_original.riv`은 원본의 수정 없는 복사입니다.

SHA-256: `67BBCAA505A52C6B56C04AFFA5A0DEC7FBC9DDEEE6C806FA9293763CAB784B47`

- Artboard: `Artboard 1`, 500 × 500, Contain, 비율 유지.
- State Machine: `클리어2`, `클리어1`, `lowlow_ver.`, `basic`, `base`.
- 이 5개 State Machine의 Boolean / Number / Trigger Input은 0개입니다.

| 앱 상황 | 실제 원본 타임라인 |
| --- | --- |
| 기본 / 오늘 상태 | `idle` / `low_energy` 반복 |
| 식물 터치 | `touch`, 한 번, 약 1초 |
| 작은 행동 완료 | `잎만 통통`, 한 번, 1초 |
| 세 행동 완료 | `통통`, 한 번, 2.35초, 원본 반짝임 포함 |
| 새 날짜의 기록 저장 | `new_leaf 뿅`, 한 번, 2.25초 |

완료 반응 뒤 오늘의 상태로 돌아옵니다. 완료했다고 저장된 기분을 좋음으로 덮어쓰지 않습니다. `cloud`, `클리어버전1`, `클리어버전2`, `eye` 등 다른 원본 타임라인은 존재하지만 웹에서 사용하지 않던 의미를 임의로 연결하지 않았습니다.

Rive의 새 Compose API는 직접 타임라인 재생을 지원하지 않으므로, 원본을 변경하지 않기 위해 legacy 네이티브 `RiveAnimationView`를 얇은 Compose 어댑터에 격리했습니다. 이것은 WebView가 아닙니다. [Rive 공식 migration 안내](https://rive.app/docs/runtimes/android/migrating-from-legacy#linear-animations).

모션 줄이기 또는 재생 오류 시 원본에서 렌더링한 PNG를 표시합니다. 영구적인 새 잎/꽃/크기/정원 확장이나 행동별 독립적인 잎 색·각도·구름 제어는 이 asset의 입력으로 지원되지 않으므로 구현됐다고 표시하지 않습니다. 현재 성장은 기록 누적과 원본 성장 반응으로 표현합니다.

## Android Studio에서 실행

1. 이 `android` 폴더를 프로젝트로 엽니다.
2. Android Studio가 SDK 경로를 설정하도록 하고 API 37 SDK를 설치합니다. minSdk는 26입니다.
3. Gradle 동기화 후 `app`을 선택하여 API 35 이상 에뮬레이터 또는 기기에 실행합니다.
4. Gradle 9.4.1 / AGP 9.2.1 / Compose compiler 2.3.10 / Rive 11.9.2가 고정되어 있습니다. 네트워크 연결이 필요한 최초 동기화를 완료해야 합니다.

터미널에서:

```powershell
cd android
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:assembleDebugAndroidTest
.\gradlew.bat :app:connectedDebugAndroidTest
```

APK 예상 경로: `app/build/outputs/apk/debug/app-debug.apk` (빌드 성공 후 생성).

## 테스트

SDK 없이 실제 도메인 Kotlin 코드만 검사하려면 캐시된 Kotlin 2.3.10 컴파일러와 JDK/Node가 있는 환경에서:

```powershell
node android/scripts/test-domain.mjs
```

이 스크립트는 도메인 20개 검사와 Kotlin 소스 구문 파서를 실행합니다. 구문 파서는 Android 타입 검사/리소스 링크/앱 빌드를 대체하지 않습니다.

`GardenDataTest`: 도메인 규칙 + JSON 왕복 복원 + 손상 데이터 처리.
`PersistenceInstrumentedTest`: 임시 DataStore를 닫고 다시 열어 날짜별 기록·기분·완료 상태 복원 확인. 실제 앱 데이터는 초기화하지 않습니다.
`GardenFlowInstrumentedTest`: 테스트 저장소로 정원 → 4개 질문 → 돌봄 3개 완료 → 정원 → 기록 흐름 및 스크린샷. 모션을 줄여 재현성 있게 레이아웃을 검사합니다.

앱과 테스트 APK 빌드 후, 실행 중인 에뮬레이터를 명시하여 세 크기에서 실행:

```powershell
node android/scripts/qa-emulator.mjs emulator-5554
```

`ADB` 환경 변수로 adb 실행 파일 경로를 지정할 수 있습니다. 스크립트는 320dpi에서 720×1600 / 780×1688 / 824×1830px로 설정하여 각각 360×800 / 390×844 / 412×915dp를 검사합니다. 완료/실패 후 원래 화면 크기·밀도를 복원합니다. 로그와 스크린샷은 `android/build/device-qa/`에 저장됩니다. 실기기에는 화면 크기 변경 스크립트를 실행하지 않습니다.

추가 수동 QA: 시스템 뒤로가기, 메모 입력 중 IME, 글자 200%, TalkBack, background/resume, 앱 종료/재실행, 자정/시간대 변경, Rive 원본 상태 및 모든 완료 모션. 특히 모션 테스트는 실제 Rive가 재생되는 기기에서 별도로 확인해야 합니다.

## 주요 파일

- `app/src/main/java/com/littlegarden/app/navigation/GardenNavigation.kt`: 초기 화면, navigation, 돌봄 가드, insets, 날짜 확인.
- `GardenViewModel.kt`: 저장 완료 후 이동, 초안 복원, 오류·날짜·완료 이벤트.
- `data/model/GardenModels.kt`: 기록 검증, 날짜별 상태, 중복 방지, 기분과 성장 분리.
- `data/repository/GardenRepository.kt`, `data/local/GardenCodec.kt`: 원자적 로컬 저장과 엄격한 복원.
- `ui/`: 다섯 화면과 공통 테마.
- `components/`: 카드, 버튼, 하단 메뉴, 원본 벡터 아이콘.
- `rive/Plant.kt`: 원본 타임라인과 lifecycle 연결.



## 초기 진입 수정 원인 분석

이 프로젝트에는 수정 전에도 ‘오늘의 작은 돌봄 다시보기’ 문자열이나 todayRecord를 보고 Care로 자동 이동하는 코드는 없었습니다. 따라서 사용자가 본 화면이 이 APK였는지는 확인하지 못했습니다. 확인된 구조적 결함은 `MainActivity.super.onCreate(savedInstanceState)`의 무조건 복원과 `rememberNavController()`의 경로 복원, 그리고 온보딩 여부에 따른 가변 startDestination입니다. 이를 그대로 두면 이전 Care 경로가 새 Activity 시작 시 복원될 수 있습니다.

후속 시작 화면 요청에 따라 NavHost 시작점은 `GardenFlow.START`로 변경했습니다. [시작하기]에서만 Home으로 이동합니다. `GardenFlow`는 DailyRecordState를 식물 상태와 별도로 계산하며, 저장 데이터를 초기 Navigation 명령으로 변환하지 않습니다. `MainActivity`가 새 실행과 구성 변경의 복원 정책을 구분합니다. 저장 실패 또는 저장 중 자정 경과 시 돌봄으로 넘어가지 않습니다. 저장 스키마·기존 기록·Rive 파일은 바꾸지 않았습니다.

`LaunchFlowInstrumentedTest`에는 첫 실행, 기록 저장 후 돌봄, 돌봄에서 Activity 종료/재실행, Home에서 명시적 돌봄 열기, 세 행동 완료 후 Home/재실행, 전날 기록, 질문/돌봄 화면 회전 복원, 쓰기 실패 시 이동 차단 테스트가 있습니다. `GardenTestRunner`의 테스트 전용 Application/저장소를 사용하여 사용자의 DataStore를 변경하지 않습니다. 실제 기기 실행 여부는 위 검증 상태를 따릅니다. Activity 재생성 검사와 실제 OS 프로세스 강제 종료 검사는 동일하지 않으며, 후자는 기기에서 추가 확인해야 합니다.

복원 기준 API: [Android Activity.getLastNonConfigurationInstance](https://developer.android.com/reference/android/app/Activity#getLastNonConfigurationInstance()).
