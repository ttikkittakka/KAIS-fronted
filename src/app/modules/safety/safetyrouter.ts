// src/modules/safety/safetyrouter.ts

export interface SafetyCheckInput {
  freeText?: string;
}

export interface SafetyCheckResult {
  isSafetyRoute: boolean;
  reason?: string;
}

const SAFETY_KEYWORDS = [
  '도움', '도움이 필요', '위기', '상담', 
  '힘들어', '자살', '죽고', '우울'
];

export function evaluateSafety(input: SafetyCheckInput): SafetyCheckResult {
  const text = input.freeText?.trim() || '';

  if (!text) {
    return { isSafetyRoute: false };
  }

  const hasSafetyKeyword = SAFETY_KEYWORDS.some(keyword => text.includes(keyword));

  if (hasSafetyKeyword) {
    return {
      isSafetyRoute: true,
      reason: '도움 요청 또는 위기 키워드가 감지되었습니다.'
    };
  }

  return { isSafetyRoute: false };
}