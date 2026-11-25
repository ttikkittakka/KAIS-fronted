export * from '../../backend/src/catalog/cares';
import type { Care } from '../../backend/src/catalog/cares';

// Saved recommendations retain their original catalog. These labels describe today's actions.
const todayCopy: Partial<Record<string, Pick<Care, 'title' | 'copy' | 'instruction' | 'helper' | 'example'>>> = {
  water: {
    title: '물 몇 모금 마시기',
    copy: '가까이 있는 물을 천천히 마셔요.',
    instruction: '물컵을 들고 편한 만큼 몇 모금씩 천천히 마셔 보세요.',
    helper: '한 컵을 다 비우지 않아도 돼요.',
  },
  pause: {
    title: '2분 명상하기',
    copy: '편하게 앉아 자연스러운 숨을 느껴요.',
    instruction: '편하게 앉아 숨이 들어오고 나가는 감각에 잠시 집중해 보세요.',
    helper: '생각이 떠오르면 잠시 두고 다시 호흡을 느껴 봐요.',
  },
  'ask-help': {
    title: '긍정적인 단어 생각하기',
    copy: '오늘 마음에 두고 싶은 단어를 골라요.',
    instruction: '마음이 가벼워지는 긍정적인 단어를 하나 떠올려 보세요.',
    example: '온기, 여유, 다정함',
    helper: '마음에 드는 단어가 있으면 속으로 천천히 되뇌어 보세요.',
  },
};

export function presentTodayCare(care: Care): Care {
  const minutes = care.minutes ?? (Number(care.meta.match(/^(\d+)분/)?.[1]) || undefined);
  return { ...care, ...todayCopy[care.id], minutes };
}
