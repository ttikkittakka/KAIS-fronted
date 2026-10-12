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

검증 명령: node --test scripts/checkin-flow.test.mjs scripts/record-store.test.mjs scripts/daily-checkin.test.mjs scripts/daily-cares.test.mjs scripts/recommend-cares.test.mjs scripts/rive-plant.test.mjs
