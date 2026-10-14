export type ShopCategory = 'character' | 'decoration' | 'background';
export type ShopItem = { id: string; name: string; category: ShopCategory; price: number; icon: string; description: string; defaultOwned?: boolean; rewardDays?: 50 | 100 };
export const SHOP_CATEGORIES: { id: ShopCategory; label: string }[] = [
  { id: 'character', label: '캐릭터' }, { id: 'decoration', label: '꾸미기' }, { id: 'background', label: '배경' },
];
export const SHOP_CATALOG: readonly ShopItem[] = [
  { id: 'momo', name: '모모', category: 'character', price: 150, icon: '🐰', description: '정원 곁에서 함께 쉬는 포근한 토끼 친구예요.' },
  { id: 'pori', name: '포리', category: 'character', price: 200, icon: '🍄', description: '작은 행복을 발견하는 다정한 버섯 친구예요.' },
  { id: 'lulu', name: '루루', category: 'character', price: 250, icon: '🌸', description: '잔잔한 꽃향기를 전하는 꽃 친구예요.' },
  { id: 'yellow-flower', name: '노란 꽃', category: 'decoration', price: 30, icon: '🌼', description: '작은 노란 꽃으로 정원 한쪽을 밝혀요.' },
  { id: 'pebble-path', name: '조약돌 길', category: 'decoration', price: 60, icon: '🪨', description: '천천히 걸어 보고 싶은 작은 돌길이에요.' },
  { id: 'small-bench', name: '작은 벤치', category: 'decoration', price: 100, icon: '🪑', description: '잠깐 쉬어 갈 자리를 정원에 놓아요.' },
  { id: 'default-sky', name: '기본 하늘', category: 'background', price: 0, icon: '☁️', description: '익숙하고 편안한 정원의 하늘이에요.', defaultOwned: true },
  { id: 'sunset-garden', name: '노을 정원', category: 'background', price: 180, icon: '🌅', description: '살구빛과 연보라빛 노을이 정원을 감싸요.' },
  { id: 'starlight-garden', name: '별빛 정원', category: 'background', price: 220, icon: '🌙', description: '부드러운 보랏빛 밤하늘에 작은 별이 반짝여요.' },
];
export const GROWTH_ITEMS: readonly ShopItem[] = [
  { id: 'anniversary-friend', name: '누리 · 50일 친구', category: 'character', price: 0, icon: '🌟', rewardDays: 50, description: '함께한 50일을 기억하는 별빛 친구예요. 햇살로 구매할 수 없는 기념 선물이에요.' },
  { id: 'anniversary-sky', name: '오로라 정원 · 100일', category: 'background', price: 0, icon: '🌌', rewardDays: 100, description: '민트빛과 연보라빛이 천천히 어우러지는 100일 기념 하늘이에요.' },
  { id: 'anniversary-flower', name: '백일의 꽃', category: 'decoration', price: 0, icon: '🪷', rewardDays: 100, description: '차곡차곡 쌓인 시간을 담은 기념 꽃이에요. 꽃자리에 놓을 수 있어요.' },
];
export const ALL_GARDEN_ITEMS = [...SHOP_CATALOG, ...GROWTH_ITEMS];
export const shopItem = (id: string) => ALL_GARDEN_ITEMS.find(item => item.id === id);
