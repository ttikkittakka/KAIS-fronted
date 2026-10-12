// src/app/api/checkins/route.ts
import { NextResponse } from 'next/server';
import { selectQuests } from '../../modules/quest/questpolicy';

const SAFETY_KEYWORDS = ['도움', '도움이 필요', '위기', '상담', '힘들어', '자살', '죽고', '우울'];

function evaluateSafety(freeText?: string) {
  const text = freeText?.trim() || '';
  if (!text) return { isSafetyRoute: false };
  return { isSafetyRoute: SAFETY_KEYWORDS.some(k => text.includes(k)) };
}

// 가짜 AI 에이전트: 점수에 따라 맞춤형 멘트를 생성해주는 함수
function generateMockPlantSpeech(mood: number, energy: number, quests: { title: string }[]) {
  const questTitles = quests.map(q => `'${q.title}'`).join(', ');

  if (energy <= 2 || mood <= 2) {
    return `오늘 많이 지치고 힘든 하루였군요. 아무것도 하기 싫다면 ${questTitles} 중에서 딱 하나만 저랑 같이 해볼까요? 무리하지 않아도 괜찮아요. 🌱`;
  } 
  
  if (energy >= 4 && mood >= 4) {
    return `오늘 컨디션이 아주 좋아 보여서 저도 기뻐요! 이 기분 좋은 에너지를 이어서 ${questTitles} 같은 작은 행동을 해보는 건 어떨까요? ✨`;
  }

  return `상태를 기록해줘서 고마워요. 기분 전환을 위해 ${questTitles} 같은 가벼운 행동을 골라봤어요. 할 수 있는 만큼만 천천히 해봐요! 🌿`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { freeText, mood, energy, canGoOut } = body;

    const safetyResult = evaluateSafety(freeText);

    if (safetyResult.isSafetyRoute) {
      return NextResponse.json({
        success: true,
        routeType: 'SAFETY',
        safetyCenter: {
          message: "지금 많이 힘드신 것 같아요. 혼자 견디지 말고 언제든 아래로 연락해 주세요.",
          contacts: [
            { name: "24시간 자살예방상담전화", number: "109" },
            { name: "긴급 신고 및 구조", number: "112 / 119" }
          ]
        }
      }, { status: 200 });
    }

    // 1. 컨디션 기반 퀘스트 3개 추출 (상태가 안 좋으면 쉬운 행동, 좋으면 활동적인 행동 위주)
    const recommendedQuests = selectQuests({ mood, energy, canGoOut });

    // 2. 가짜 AI를 통해 식물 말풍선 멘트 생성
    const plantMessage = generateMockPlantSpeech(mood, energy, recommendedQuests);

    return NextResponse.json({
      success: true,
      routeType: 'NORMAL',
      recommendations: recommendedQuests,
      explanation: plantMessage 
    }, { status: 200 });

  } catch {
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}