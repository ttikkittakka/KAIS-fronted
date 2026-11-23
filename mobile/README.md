# 오늘의 정원 모바일 체험

Expo SDK 58 앱에서 동일한 Next.js 화면을 엽니다. Expo Go에서는 사용자가 카메라나 연락처를 직접 선택할 때 기기의 화면을 열어 줍니다. 연락처 기능의 최근·빈도는 앱에서 직접 표시한 연락으로 계산합니다.

## 같은 Wi-Fi에서 열기

1. 저장소 루트에서 `npm ci`, `npm run build`, `npm run start -- --hostname 0.0.0.0 --port 3000`을 실행합니다.
2. 별도 터미널에서 `cd mobile`, `npm ci`, `npm start -- --lan --port 8081`을 실행합니다.
3. 웹앱은 휴대폰 브라우저에서 `http://<PC Wi-Fi IPv4>:3000/demo`로 엽니다. Expo Go에서는 터미널의 QR 또는 `exp://<PC Wi-Fi IPv4>:8081`을 사용합니다. SDK 58을 지원하는 Expo Go가 필요합니다.
4. 앱이 다른 웹 호스트를 사용해야 하면 `.env.example`을 참고해 `EXPO_PUBLIC_GARDEN_WEB_URL`을 지정합니다. 실제 계정, 보호자 링크, 웹 카메라·위치 권한은 HTTPS 주소에서 사용합니다.

`/demo`는 별도 로그인 없이 예시 데이터로 시작합니다. 이 화면에서 작성한 기록은 열린 앱 문서의 메모리에 보관됩니다.

## 빌드

- 타입 검사 `npm run typecheck`
- 웹·Android·iOS 번들 `npm run export` → `dist/`
- 설치 파일은 SDK 58 기기 빌드 환경 또는 서명된 EAS Build가 준비되면 생성합니다. 번들 내보내기는 스토어용 설치 파일 배포와 별개입니다.
- LAN 주소가 바뀌면 `python make_preview_qr.py <web-url> <expo-url> <output.png>`로 QR을 새로 출력합니다. Pillow와 ReportLab을 사용합니다.

[Expo Go 개발 서버](https://docs.expo.dev/get-started/start-developing/) · [Expo 주소록 선택](https://docs.expo.dev/versions/v58.0.0/sdk/contacts/) · [Android 통화 기록 권한](https://developer.android.com/guide/topics/permissions/default-handlers)
