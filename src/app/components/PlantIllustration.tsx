'use client';

// 화분 속 새싹이 미션(0~3개) 완료 개수에 따라 자라나
// 마지막 단계에서 꽃이 활짝 피는 일러스트 컴포넌트.
// 오늘의 컨디션(체크인 결과)에 따라 날씨 요소(비구름/맑음/화창함)가 함께 표시된다.

const LEAF_D = 'M0,0 C-15,-6 -16,-26 0,-40 C16,-26 15,-6 0,0 Z';
const PETAL_D = 'M0,0 C-13,-7 -13,-21 0,-30 C13,-21 13,-7 0,0 Z';

interface LeafProps {
  x: number;
  y: number;
  angle: number;
  scale?: number;
}

function Leaf({ x, y, angle, scale = 1 }: LeafProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <path d={LEAF_D} fill="url(#leafGrad)" stroke="#3F5D46" strokeWidth="0.6" strokeOpacity="0.3" />
      <path d="M0,-3 L0,-35" stroke="#3F5D46" strokeWidth="1" strokeOpacity="0.25" strokeLinecap="round" />
      <ellipse cx="-4" cy="-24" rx="4" ry="7" fill="#ffffff" opacity="0.2" transform="rotate(-20 -4 -24)" />
    </g>
  );
}

function Sepal({ x, y, angle, scale = 1 }: LeafProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <path d={LEAF_D} fill="url(#leafGrad)" opacity="0.9" />
    </g>
  );
}

function Petal({ x, y, angle, scale = 1 }: LeafProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <path d={PETAL_D} fill="url(#petalGrad)" stroke="#E7DFC9" strokeWidth="0.5" />
      <ellipse cx="-2" cy="-16" rx="3" ry="5" fill="#ffffff" opacity="0.4" />
    </g>
  );
}

function Sparkle({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <path
      d="M0,-7 L1.6,-1.6 L7,0 L1.6,1.6 L0,7 L-1.6,1.6 L-7,0 L-1.6,-1.6 Z"
      fill="#F2D99A"
      transform={`translate(${x} ${y}) scale(${s})`}
      className="animate-sparkle"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

function RainDrop({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  return (
    <path
      d="M0,-5 C2.6,-1.5 2.6,2 0,4 C-2.6,2 -2.6,-1.5 0,-5 Z"
      fill="#9FC4C9"
      transform={`translate(${x} ${y})`}
      className="animate-raindrop"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

function Cloud({ y }: { y: number }) {
  return (
    <g className="animate-cloud-drift" style={{ transformOrigin: `100px ${y}px` }}>
      <g transform={`translate(100 ${y})`}>
        <g transform="translate(0 3)">
          <ellipse cx="-17" cy="2" rx="15" ry="12" fill="url(#cloudGradBack)" />
          <ellipse cx="0" cy="-5" rx="19" ry="16" fill="url(#cloudGradBack)" />
          <ellipse cx="18" cy="0" rx="16" ry="13" fill="url(#cloudGradBack)" />
          <ellipse cx="2" cy="9" rx="23" ry="11" fill="url(#cloudGradBack)" />
        </g>
        <ellipse cx="-17" cy="0" rx="15" ry="12" fill="url(#cloudGradFront)" />
        <ellipse cx="0" cy="-7" rx="19" ry="16" fill="url(#cloudGradFront)" />
        <ellipse cx="18" cy="-2" rx="16" ry="13" fill="url(#cloudGradFront)" />
        <ellipse cx="2" cy="6" rx="23" ry="11" fill="url(#cloudGradFront)" />

        <RainDrop x={-14} y={17} delay={0} />
        <RainDrop x={2} y={20} delay={0.4} />
        <RainDrop x={16} y={16} delay={0.8} />
      </g>
    </g>
  );
}

function Sun({ great = false }: { great?: boolean }) {
  return (
    <g>
      <circle cx="150" cy="40" r="36" fill="url(#sunGlow)" />
      <circle cx="150" cy="40" r="13" fill="#F2D99A" stroke="#E4C079" strokeWidth="1" />
      <g stroke="#E4C079" strokeWidth="2" strokeLinecap="round">
        <line x1="150" y1="18" x2="150" y2="12" />
        <line x1="150" y1="62" x2="150" y2="68" />
        <line x1="128" y1="40" x2="122" y2="40" />
        <line x1="165" y1="25" x2="169" y2="21" />
        <line x1="165" y1="55" x2="169" y2="59" />
        <line x1="135" y1="25" x2="131" y2="21" />
      </g>
      {great && (
        <>
          <Sparkle x={62} y={62} s={0.75} delay={0} />
          <Sparkle x={140} y={82} s={0.6} delay={0.6} />
        </>
      )}
    </g>
  );
}

function PotAndSoil({ withSprouts = false }: { withSprouts?: boolean }) {
  return (
    <g>
      {/* 그림자 */}
      <ellipse cx="100" cy="219" rx="48" ry="6" fill="#00000014" />

      {/* 화분 */}
      <path d="M58,163 L142,163 L131,210 Q100,219 69,210 Z" fill="url(#potGrad)" stroke="#DDE8D8" strokeWidth="1.5" />
      <ellipse cx="100" cy="163" rx="44" ry="9" fill="url(#potRimGrad)" stroke="#DDE8D8" strokeWidth="1.5" />

      {/* 흙 */}
      <ellipse cx="100" cy="162" rx="37" ry="6.5" fill="url(#soilGrad)" />
      <ellipse cx="82" cy="160" rx="5" ry="2.6" fill="#7C6650" opacity="0.55" />
      <ellipse cx="119" cy="159.5" rx="4.5" ry="2.4" fill="#7C6650" opacity="0.55" />
      <ellipse cx="100" cy="158" rx="6" ry="2.8" fill="#7C6650" opacity="0.4" />

      {withSprouts && (
        <g opacity="0.85">
          <path d="M76,160 Q73,152 78,147" stroke="#6F8F72" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M124,159 Q128,151 123,146" stroke="#6F8F72" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </g>
      )}
    </g>
  );
}

function Defs() {
  return (
    <defs>
      <linearGradient id="leafGrad" x1="0" y1="-40" x2="0" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#A9C1AA" />
        <stop offset="100%" stopColor="#3F5D46" />
      </linearGradient>
      <linearGradient id="stemGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6F8F72" />
        <stop offset="100%" stopColor="#3F5D46" />
      </linearGradient>
      <linearGradient id="potGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#F3F1EA" />
      </linearGradient>
      <linearGradient id="potRimGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#F8F6F0" />
      </linearGradient>
      <radialGradient id="soilGrad" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#C7B199" />
        <stop offset="100%" stopColor="#9B8067" />
      </radialGradient>
      <linearGradient id="petalGrad" x1="0" y1="-30" x2="0" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#F3EFE4" />
      </linearGradient>
      <radialGradient id="coreGrad" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#FBE9B9" />
        <stop offset="100%" stopColor="#F2D99A" />
      </radialGradient>
      <radialGradient id="cloudGradFront" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#F2F7F7" />
        <stop offset="100%" stopColor="#DCE9EA" />
      </radialGradient>
      <radialGradient id="cloudGradBack" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#C3D6D7" />
        <stop offset="100%" stopColor="#A9BFC1" />
      </radialGradient>
      <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#F2D99A" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#F2D99A" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function Stage0() {
  // 새싹: 갓 튼 떡잎 두 장
  return (
    <g>
      <path d="M100,165 Q106,150 100,133" stroke="url(#stemGrad)" strokeWidth="5" strokeLinecap="round" fill="none" />
      <Leaf x={100} y={134} angle={-62} scale={0.85} />
      <Leaf x={100} y={134} angle={42} scale={0.72} />
      <PotAndSoil withSprouts />
    </g>
  );
}

function Stage1() {
  // 잎이 풍성해진 모종
  return (
    <g>
      <path d="M100,165 Q108,132 100,95" stroke="url(#stemGrad)" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <Leaf x={102} y={149} angle={-58} scale={0.55} />
      <Leaf x={98} y={149} angle={55} scale={0.5} />
      <Leaf x={101} y={112} angle={-42} scale={0.85} />
      <Leaf x={99} y={110} angle={40} scale={0.78} />
      <PotAndSoil />
    </g>
  );
}

function Stage2() {
  // 꽃봉오리
  return (
    <g>
      <path d="M100,165 Q112,120 100,62" stroke="url(#stemGrad)" strokeWidth="6" strokeLinecap="round" fill="none" />
      <Leaf x={104} y={150} angle={-56} scale={0.5} />
      <Leaf x={96} y={150} angle={54} scale={0.46} />
      <Leaf x={107} y={116} angle={-42} scale={0.68} />
      <Leaf x={94} y={114} angle={40} scale={0.62} />
      <Leaf x={103} y={82} angle={-32} scale={0.55} />
      <Leaf x={98} y={80} angle={30} scale={0.5} />

      <Sepal x={100} y={63} angle={-150} scale={0.4} />
      <Sepal x={100} y={63} angle={150} scale={0.4} />
      <g transform="translate(100 60)">
        <path d={PETAL_D} fill="url(#leafGrad)" transform="scale(1.3)" />
      </g>
      <PotAndSoil />
    </g>
  );
}

function Stage3() {
  // 활짝 핀 꽃
  const petalAngles = [0, 60, 120, 180, 240, 300];
  return (
    <g>
      <path d="M100,165 Q112,112 100,48" stroke="url(#stemGrad)" strokeWidth="6.5" strokeLinecap="round" fill="none" />
      <Leaf x={105} y={151} angle={-56} scale={0.5} />
      <Leaf x={95} y={151} angle={54} scale={0.46} />
      <Leaf x={109} y={119} angle={-42} scale={0.72} />
      <Leaf x={92} y={117} angle={40} scale={0.66} />
      <Leaf x={105} y={87} angle={-32} scale={0.6} />
      <Leaf x={97} y={85} angle={30} scale={0.55} />

      <g transform="translate(100 46)">
        {petalAngles.map((a) => (
          <Petal key={a} x={0} y={0} angle={a} scale={1.05} />
        ))}
        <circle r="11" fill="url(#coreGrad)" stroke="#E4C079" strokeWidth="0.6" />
        <circle cx="-3" cy="-4" r="1.4" fill="#E4C079" opacity="0.6" />
        <circle cx="3" cy="2" r="1.2" fill="#E4C079" opacity="0.6" />
        <circle cx="0" cy="4" r="1.3" fill="#E4C079" opacity="0.5" />
      </g>

      <Sparkle x={58} y={55} s={0.8} delay={0} />
      <Sparkle x={144} y={70} s={0.65} delay={0.5} />
      <Sparkle x={130} y={30} s={0.55} delay={1} />

      <PotAndSoil />
    </g>
  );
}

// 각 단계별 잎/봉오리/꽃의 실제 최상단 y좌표 기준, 먹구름이 여유 있게 위쪽에 떠 있도록 미리 계산한 위치
const STAGE_WEATHER_Y = [70, 48, 26, 20];

export type WeatherTier = 'low' | 'normal' | 'good' | 'great';

interface PlantIllustrationProps {
  stage: 0 | 1 | 2 | 3;
  weather?: WeatherTier;
  className?: string;
}

export default function PlantIllustration({ stage, weather = 'normal', className }: PlantIllustrationProps) {
  const stages = [Stage0, Stage1, Stage2, Stage3];
  const Stage = stages[stage];
  const cloudY = STAGE_WEATHER_Y[stage];

  return (
    <svg viewBox="0 0 200 225" className={className} role="img" aria-label="식물 성장 일러스트">
      <Defs />
      {/* 식물보다 먼저 그려서, 꽃/잎이 날씨 요소 앞쪽에 자연스럽게 겹치도록 함 */}
      {weather === 'low' && <Cloud y={cloudY} />}
      {(weather === 'good' || weather === 'great') && <Sun great={weather === 'great'} />}
      <g className="animate-plant-sway" style={{ transformOrigin: '100px 165px' }}>
        <Stage />
      </g>
    </svg>
  );
}
