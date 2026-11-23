# 오늘의 정원 백엔드 (AI·안전 API)

Hono + TypeScript 서버입니다. 설계안 v2의 "AI는 규칙이 고른 행동의 이유만 짧게 설명한다"를 맡습니다.
기록·사진은 여전히 브라우저에만 저장하며, 이 서버는 아무것도 저장하지 않습니다.

## 실행

```bash
cd backend
npm install
cp .env.example .env      # ANTHROPIC_API_KEY를 넣으면 AI 설명이 켜져요. 없으면 고정 문구만 사용
npm run dev               # http://localhost:8787
npm test                  # 평가 하네스 (가드·폴백·입력 검증)
npm run typecheck
```

프런트의 `/api/v1/*` Route Handler가 Hono의 `/v1/health`, `/v1/explain`, `/v1/benefits`를 호출합니다. Vercel에서는 `app`에 주입되는 `GARDEN_BACKEND_URL`을 사용합니다. 각각 따로 실행하는 로컬 개발에서는 기본값인 `http://localhost:8787` 또는 프런트의 `BACKEND_URL`을 사용합니다.

Vercel 로컬 검증은 저장소 루트에서 `vercel dev -L`로 실행합니다. Hono는 `src/app.ts`의 기본 내보내기를 사용하고, `src/server.ts`는 기존 단독 실행 명령을 지원합니다. [Vercel Services 안내](https://vercel.com/kb/guide/vercel-services)
백엔드가 꺼져 있어도 프런트는 고정 문구로 동작합니다.

## API

| 경로 | 설명 |
|---|---|
| `GET /v1/health` | `{ ok, llm, promptVersion }` — AI가 켜졌는지 확인 |
| `POST /v1/explain` | `{ answers: [sleep, energy, meal, mood], careIds: string[1..3] }` → `{ reason, source: 'ai' \| 'fallback', promptVersion }` |

## 안전 경계

- **입력:** `questions.ts`의 응답 값과 `cares.ts`의 돌봄 ID만 받습니다(zod, 4KB 제한, 알 수 없는 필드는 거부). 자유 입력은 받지 않습니다.
- **모델 입력:** 질문 라벨과 돌봄 제목만 보냅니다. AI는 돌봄을 고르거나 바꾸지 않습니다.
- **출력 가드:** 1~2문장, 140자 이하, 한국어여야 합니다. 진단·치료·약·병원·상담·위기 표현, 3자리 이상 숫자, 링크가 있으면 버리고 고정 문구를 씁니다.
- **실패:** 키가 없거나, 10초가 지나거나, 모델이 거절하거나, 가드를 통과하지 못하면 `source: 'fallback'`을 돌려줍니다. 로그에는 요청·응답 본문을 남기지 않습니다.
- **모델:** `claude-opus-5-5`, effort `low`, 서버 측 거절 대체(`fallbacks: "default"`)를 씁니다.

## 프런트와의 관계

- 카탈로그(`src/app/cares.ts`, `questions.ts`)의 원본은 프런트에 있고, 백엔드는 이를 읽기만 합니다. 카탈로그를 바꾸면 백엔드 검증도 함께 바뀝니다.
- 위기 표현 감지(`src/app/safety.ts`)와 안전센터는 **기기 안에서만** 동작합니다. 일기 원문은 서버로 보내지 않습니다.

## 다음 단계로 미룬 것

- rate limit·로그인 확인이 없습니다. 공개 배포 전에 IP별 제한이나 Supabase JWT 확인을 추가해야 합니다(`src/app.ts`의 `shortcut:` 주석).
- 계정 기반 기록 동기화는 아직 없습니다. `../supabase/migrations`가 그 다음 단계의 DB 설계입니다.
