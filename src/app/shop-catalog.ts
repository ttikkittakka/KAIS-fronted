export type ShopCategory = 'character' | 'decoration' | 'background' | 'outfit';
export type DecorationSlot = 'flower' | 'path' | 'bench' | 'prop' | 'sky';
export type OutfitSlot = 'head' | 'face' | 'neck';
// icon is only a fallback for an item whose picture (public/garden/<id>.webp, outfits public/wardrobe/<id>.webp) fails to load.
export type ShopItem = { id: string; name: string; category: ShopCategory; price: number; icon: string; description: string; slot?: DecorationSlot; wear?: OutfitSlot; defaultOwned?: boolean; rewardDays?: 50 | 100 };
export const SHOP_CATEGORIES: { id: ShopCategory; label: string }[] = [
  { id: 'character', label: '캐릭터' }, { id: 'decoration', label: '꾸미기' }, { id: 'background', label: '배경' }, { id: 'outfit', label: '옷' },
];
export const OUTFIT_SLOTS: { id: OutfitSlot; label: string }[] = [{ id: 'head', label: '머리' }, { id: 'face', label: '얼굴' }, { id: 'neck', label: '목' }];
export const SHOP_CATALOG: readonly ShopItem[] = [
  { id: 'momo', name: '모모', category: 'character', price: 150, icon: '🐰', description: '정원 곁에서 함께 쉬는 포근한 토끼 친구예요.' },
  { id: 'pori', name: '포리', category: 'character', price: 200, icon: '🍄', description: '작은 행복을 발견하는 다정한 버섯 친구예요.' },
  { id: 'lulu', name: '루루', category: 'character', price: 250, icon: '🌸', description: '잔잔한 꽃향기를 전하는 꽃 친구예요.' },
  { id: 'yellow-flower', name: '노란 꽃', category: 'decoration', slot: 'flower', price: 30, icon: '🌼', description: '작은 노란 꽃으로 정원 한쪽을 밝혀요.' },
  { id: 'pink-tulip', name: '분홍 튤립', category: 'decoration', slot: 'flower', price: 40, icon: '🌷', description: '두 송이 분홍 튤립이 바람에 살랑거려요.' },
  { id: 'sunflower', name: '꼬마 해바라기', category: 'decoration', slot: 'flower', price: 50, icon: '🌻', description: '해를 닮은 작은 해바라기가 정원을 환하게 해요.' },
  { id: 'pebble-path', name: '조약돌 길', category: 'decoration', slot: 'path', price: 60, icon: '🪨', description: '천천히 걸어 보고 싶은 작은 돌길이에요.' },
  { id: 'small-bench', name: '작은 벤치', category: 'decoration', slot: 'bench', price: 100, icon: '🪑', description: '잠깐 쉬어 갈 자리를 정원에 놓아요.' },
  { id: 'tree-stump', name: '그루터기 의자', category: 'decoration', slot: 'bench', price: 70, icon: '🪵', description: '작은 새싹이 돋은 나무 그루터기 의자예요.' },
  { id: 'watering-can', name: '민트 물뿌리개', category: 'decoration', slot: 'prop', price: 40, icon: '🪣', description: '정원을 돌보는 민트빛 물뿌리개예요.' },
  { id: 'mushroom-lamp', name: '버섯 램프', category: 'decoration', slot: 'prop', price: 80, icon: '🍄', description: '밤이 되면 은은하게 빛나는 버섯 램프예요.' },
  { id: 'garden-lantern', name: '정원 랜턴', category: 'decoration', slot: 'prop', price: 90, icon: '🏮', description: '따뜻한 불빛으로 정원을 포근하게 비춰요.' },
  { id: 'birdhouse', name: '작은 새집', category: 'decoration', slot: 'prop', price: 110, icon: '🏠', description: '지나가던 작은 새가 쉬어 갈 수 있는 집이에요.' },
  { id: 'butterflies', name: '나비 두 마리', category: 'decoration', slot: 'sky', price: 50, icon: '🦋', description: '정원 위를 팔랑팔랑 날아다녀요.' },
  { id: 'rainbow', name: '작은 무지개', category: 'decoration', slot: 'sky', price: 120, icon: '🌈', description: '비가 그친 뒤처럼 마음이 맑아지는 무지개예요.' },
  { id: 'hot-air-balloon', name: '꼬마 열기구', category: 'decoration', slot: 'sky', price: 150, icon: '🎈', description: '먼 곳까지 천천히 날아가 볼까요?' },
  { id: 'default-sky', name: '기본 하늘', category: 'background', price: 0, icon: '☁️', description: '익숙하고 편안한 정원의 하늘이에요.', defaultOwned: true },
  { id: 'sunset-garden', name: '노을 정원', category: 'background', price: 180, icon: '🌅', description: '살구빛과 연보라빛 노을이 정원을 감싸요.' },
  { id: 'starlight-garden', name: '별빛 정원', category: 'background', price: 220, icon: '🌙', description: '부드러운 보랏빛 밤하늘에 작은 별이 반짝여요.' },
  { id: 'straw-hat', name: '밀짚모자', category: 'outfit', wear: 'head', price: 80, icon: '👒', description: '민트 리본을 두른 작은 밀짚모자예요. 햇살 좋은 날 산책에 딱이에요.' },
  { id: 'flower-crown', name: '꽃 화관', category: 'outfit', wear: 'head', price: 90, icon: '🌸', description: '분홍·연보라 꽃을 엮은 화관이에요.' },
  { id: 'knit-beanie', name: '방울 털모자', category: 'outfit', wear: 'head', price: 70, icon: '🧶', description: '폭신한 방울이 달린 노란 털모자예요.' },
  { id: 'party-hat', name: '고깔모자', category: 'outfit', wear: 'head', price: 60, icon: '🎉', description: '기념하고 싶은 날 쓰는 줄무늬 고깔모자예요.' },
  { id: 'round-glasses', name: '동그란 안경', category: 'outfit', wear: 'face', price: 70, icon: '👓', description: '얇은 금테 동그란 안경이에요. 조금 똑똑해 보여요.' },
  { id: 'heart-sunglasses', name: '하트 선글라스', category: 'outfit', wear: 'face', price: 90, icon: '🕶️', description: '분홍빛 하트 선글라스예요.' },
  { id: 'mint-scarf', name: '민트 목도리', category: 'outfit', wear: 'neck', price: 80, icon: '🧣', description: '포근하게 감싸 주는 민트색 뜨개 목도리예요.' },
  { id: 'red-bowtie', name: '나비넥타이', category: 'outfit', wear: 'neck', price: 50, icon: '🎀', description: '반짝이는 산호빛 나비넥타이예요.' },
  { id: 'bell-collar', name: '방울 목걸이', category: 'outfit', wear: 'neck', price: 60, icon: '🔔', description: '작은 금방울이 달린 분홍 리본 목걸이예요.' },
];
export const GROWTH_ITEMS: readonly ShopItem[] = [
  { id: 'anniversary-friend', name: '누리 · 50일 친구', category: 'character', price: 0, icon: '🌟', rewardDays: 50, description: '함께한 50일을 기억하는 별빛 친구예요. 햇살로 구매할 수 없는 기념 선물이에요.' },
  { id: 'anniversary-sky', name: '오로라 정원 · 100일', category: 'background', price: 0, icon: '🌌', rewardDays: 100, description: '민트빛과 연보라빛이 천천히 어우러지는 100일 기념 하늘이에요.' },
  { id: 'anniversary-flower', name: '백일의 꽃', category: 'decoration', slot: 'flower', price: 0, icon: '🪷', rewardDays: 100, description: '차곡차곡 쌓인 시간을 담은 기념 꽃이에요. 꽃자리에 놓을 수 있어요.' },
];
export const ALL_GARDEN_ITEMS = [...SHOP_CATALOG, ...GROWTH_ITEMS];
export const shopItem = (id: string) => ALL_GARDEN_ITEMS.find(item => item.id === id);
