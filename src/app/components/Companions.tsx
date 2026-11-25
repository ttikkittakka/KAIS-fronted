'use client';

import { usePersonalGarden } from './PersonalGarden';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import Image from 'next/image';
import { BOND_LEVELS, COMPANIONS, bond, bondName, bondRule, canAdopt, companion, type BondLevel, type CompanionId, type CompanionState } from '../companions';
import type { DailyCheckin } from '../daily-checkin';
import type { Emotion } from '../chat';
import { FIT, type Outfit } from '../wardrobe';
import { TREE_STAGES, treeGrowth, type TreeLevel } from '../pet-growth';
import { readMissionLog } from '../missions';

// Korean particles depend on whether the last syllable has a final consonant.
const final = (word: string) => { const code = word.charCodeAt(word.length - 1) - 0xac00; return code >= 0 && code < 11172 ? code % 28 : 0; };
const wa = (word: string) => word + (final(word) ? '과' : '와');
const ga = (word: string) => word + (final(word) ? '이' : '가');
// U+FE0E keeps ♥ a text glyph (some fonts draw it as a black emoji that ignores CSS color).
const hearts = (level: BondLevel) => '♥︎'.repeat(level) + '♡︎'.repeat(BOND_LEVELS.length - level);

const HOP_MS = 720; // matches companion-hop-* in companions.css
const GLOW_MS = 1200; // happy face lingers after petting; the body springs back in the first 550ms
const TAP_SLOP = 8; // px: less movement than this is a tap (hop), more is a stroke
const PET_DISTANCE = 90; // px of stroking before it counts as petting
const HOLD_MS = 550; // holding still this long is a hug
const EMOTE_MS = 1900; // matches the companion-emote-* animations; longer ones set their own ms
const FACES = ['normal', 'blink', 'low', 'happy', 'excited'] as const;
// Each friend blinks on its own phase so a grid of friends never blinks in unison.
const blinkDelay = (id: CompanionId) => -(COMPANIONS.findIndex(c => c.id === id) * 1.7) + 's';
// Each emotion = a face, a body motion (companions.css) and floating marks.
const EMOTES: Record<Emotion, { face: typeof FACES[number]; motion: string; mark: string; count: number; ms?: number }> = {
  joy: { face: 'happy', motion: 'hop', mark: '♥', count: 2 },
  excited: { face: 'excited', motion: 'celebrate', mark: '✦', count: 4 },
  comfort: { face: 'happy', motion: 'nod', mark: '♥', count: 2 },
  curious: { face: 'normal', motion: 'tilt', mark: '?', count: 1 },
  sleepy: { face: 'low', motion: 'doze', mark: 'z', count: 3 },
  love: { face: 'happy', motion: 'hug', mark: '♥', count: 5 },
  surprised: { face: 'excited', motion: 'startle', mark: '!', count: 1 },
  wave: { face: 'happy', motion: 'wave', mark: '✦', count: 3 },
  sing: { face: 'happy', motion: 'sing', mark: '♪', count: 5, ms: 2300 },
  dance: { face: 'excited', motion: 'dance', mark: '♪', count: 4, ms: 2300 },
  calm: { face: 'blink', motion: 'breathe', mark: '', count: 0, ms: 4200 },
  walk: { face: 'happy', motion: 'walk', mark: '✦', count: 2, ms: 2700 },
};
const MARK_CLASS: Record<string, string> = { '♥': 'heart', '✦': 'spark', '?': 'mark', '!': 'mark', z: 'zz', '♪': 'note' };
const CROWN_HEIGHT: Record<CompanionId, readonly number[]> = {
  bonsai: [49, 34, 24, 12],
  pine: [55, 38, 25, 12],
  oak: [51, 33, 17, 9],
  metasequoia: [63, 38, 22, 13],
};
// Outfit layers ride inside the body so they hop, sway and squash with the friend (fit numbers: wardrobe.ts).
function Wear({ id, stage, outfit }: { id: CompanionId; stage: TreeLevel; outfit: Outfit }) {
  return <>{Object.entries(outfit).map(([slot, item]) => {
    const anchor = FIT.anchors[slot as keyof typeof FIT.anchors];
    const y = slot === 'head' ? CROWN_HEIGHT[id][stage - 1] : anchor.y + (id === 'metasequoia' ? 2.8 : 0);
    const fit = FIT.items[item!] ?? { sink: 0, scale: 1 };
    // A missing picture hides itself rather than showing a broken-image icon on the friend.
    return <Image key={slot} className={'companion-art__wear companion-art__wear--' + slot} src={`/wardrobe/${item}.webp`} alt="" width={256} height={256} unoptimized draggable={false}
      onError={event => { event.currentTarget.style.display = 'none'; }} style={{ '--x': 50, '--y': y, '--w': anchor.w * fit.scale, '--r': 0, '--sink': fit.sink } as CSSProperties}/>;
  })}</>;
}
/** The potted tree and its expression move together.
 *  A new `emote.key` plays that emotion once. Tap = hop (+ onTap), stroke = pet, hold still = hug. */
export function CompanionArt({ id, stage = 1, low = false, celebrate = false, interactive = true, className = '', label, emote = null, outfit, onInteract, onTap }: {
  id: CompanionId; stage?: TreeLevel; low?: boolean; celebrate?: boolean; interactive?: boolean; className?: string; label?: string;
  emote?: { kind: Emotion; key: number } | null; outfit?: Outfit; onInteract?: (kind: 'pet' | 'hug') => void; onTap?: () => void;
}) {
  const [hopping, setHopping] = useState(false);
  const [petting, setPetting] = useState(false);
  const [glow, setGlow] = useState(false);
  const [lean, setLean] = useState(0);
  const [marks, setMarks] = useState<{ key: number; mark: string }[]>([]);
  // An emote that arrived before this mount is not replayed.
  const [seenEmote, setSeenEmote] = useState(emote?.key ?? 0);
  const [run, setRun] = useState<{ kind: Emotion; key: number } | null>(null);
  if (emote && emote.key !== seenEmote) { setSeenEmote(emote.key); setRun(emote); }
  const stroke = useRef({ down: false, x: 0, travel: 0, lastHeart: 0, press: 0, held: false });
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = (fn: () => void, ms: number) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };
  useEffect(() => { const pending = timers.current; return () => pending.forEach(clearTimeout); }, []);
  useEffect(() => {
    if (!hopping) return;
    const timer = setTimeout(() => setHopping(false), HOP_MS);
    return () => clearTimeout(timer);
  }, [hopping]);

  const spawn = (mark: string) => {
    const key = Date.now() + Math.random();
    setMarks(all => [...all.slice(-7), { key, mark }]);
    later(() => setMarks(all => all.filter(m => m.key !== key)), 1800);
  };
  const heart = () => spawn('♥');
  useEffect(() => {
    if (!run) return;
    const { mark, count, ms = EMOTE_MS } = EMOTES[run.kind];
    const pending = Array.from({ length: count }, (_, i) => setTimeout(() => spawn(mark), i * 150));
    pending.push(setTimeout(() => setRun(current => current === run ? null : current), ms));
    return () => pending.forEach(clearTimeout);
  }, [run]); // eslint-disable-line react-hooks/exhaustive-deps -- spawn only schedules state updates
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    const press = stroke.current.press + 1;
    stroke.current = { down: true, x: event.clientX, travel: 0, lastHeart: 0, press, held: false };
    later(() => {
      const s = stroke.current;
      if (s.press !== press || !s.down || s.travel >= TAP_SLOP) return;
      s.held = true;
      setRun({ kind: 'love', key: Date.now() });
      try { navigator.vibrate?.(25); } catch {} // a soft buzz where supported; iOS has no vibrate
      onInteract?.('hug');
    }, HOLD_MS);
    // Keeps the stroke when the finger slides past the edge; some browsers refuse capture, and the gesture still works.
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const s = stroke.current;
    if (!s.down || s.held) return; // a hug already answered this press
    const dx = event.clientX - s.x;
    s.x = event.clientX; s.travel += Math.abs(dx);
    if (s.travel < TAP_SLOP) return;
    setLean(Math.max(-1, Math.min(1, dx / 6))); // the body leans the way the hand moves
    if (s.travel > PET_DISTANCE) {
      if (!petting) { setPetting(true); setGlow(false); }
      if (s.travel - s.lastHeart > 120) { s.lastHeart = s.travel; heart(); }
    }
  };
  const up = () => {
    const s = stroke.current;
    if (!s.down) return;
    s.down = false;
    if (s.held) return; // the hug already played
    if (s.travel < TAP_SLOP) { setHopping(true); onTap?.(); return; } // mid-air the hop just continues; the menu still opens
    if (petting) { setPetting(false); setGlow(true); later(() => setGlow(false), GLOW_MS); onInteract?.('pet'); }
    else setLean(0);
  };

  const playing = run ? EMOTES[run.kind] : null;
  const face = petting || glow ? 'happy' : playing ? playing.face : celebrate ? 'excited' : low ? 'low' : 'normal';
  const classes = ['companion-art', 'companion-art--face-' + face, low && 'companion-art--low', celebrate && 'companion-art--celebrate',
    hopping && 'companion-art--hop', petting && 'companion-art--petting', glow && 'companion-art--glow',
    playing && !petting && 'companion-art--emote-' + playing.motion, className].filter(Boolean).join(' ');
  const name = label ?? `${companion(id).name} · ${TREE_STAGES[stage - 1].name}`;
  const style = { '--lean': lean, '--blink-delay': blinkDelay(id), '--pot-face-y': id === 'metasequoia' ? '83.3%' : '80.5%' } as CSSProperties;
  const figure = <>
    <span className="companion-art__shadow" aria-hidden="true"/>
    <span className="companion-art__jump"><span className="companion-art__body">
      <Image className="companion-art__img companion-art__tree" src={`/trees/${id}-${stage}.webp`} alt="" width={512} height={512} unoptimized draggable={false}/>
      <span className="tree-face" aria-hidden="true"><i className="tree-eye"/><i className="tree-eye"/><i className="tree-mouth"/></span>
      {outfit && <Wear id={id} stage={stage} outfit={outfit}/>}
    </span></span>
    {marks.length > 0 && <span className="companion-art__hearts" aria-hidden="true">{marks.map(({ key, mark }) => <i key={key} className={'mark-' + MARK_CLASS[mark]} style={{ '--drift': `${Math.round(((key * 997) % 1) * 60 - 30)}px` } as CSSProperties}>{mark === '♥' || mark === '♪' ? mark + '\uFE0E' : mark}</i>)}</span>}
  </>;
  return interactive
    ? <button type="button" className={classes} style={style}
        aria-label={`${name}. ${onTap ? '누르면 함께할 일을 골라요' : '누르면 점프해요'}. 옆으로 쓸어 주면 쓰다듬고, 꾹 누르고 있으면 안아 줘요.`} aria-haspopup={onTap ? 'menu' : undefined}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={event => { if (event.detail === 0) { setHopping(true); onTap?.(); } }}>{figure}</button>
    : <div className={classes} style={style} role="img" aria-label={name}>{figure}</div>;
}

export function CompanionPicker({ state, onAdopt }: { state: CompanionState | null; onAdopt: (id: CompanionId) => void }) {
  const choices = COMPANIONS.filter(c => !state?.adopted.some(a => a.id === c.id));
  const [selected, setSelected] = useState<CompanionId | null>(null);
  return <div className="settings-content companion-picker">
    <section className="companion-intro"><h2>{state ? '새 친구를 데려올까요?' : '함께할 친구를 골라 주세요'}</h2>
      <p>{state ? '단짝이 된 친구는 도감에서 언제든 다시 만날 수 있어요.' : '좋아하는 친구 하나면 충분해요. 단짝이 되면 다른 친구도 데려올 수 있어요.'}</p></section>
    <div className="companion-grid" role="radiogroup" aria-label="함께할 친구">{choices.map(c => <button key={c.id} type="button" role="radio" aria-checked={selected === c.id}
      className={'companion-card' + (selected === c.id ? ' companion-card--selected' : '')} onClick={() => setSelected(c.id)}>
      <CompanionArt id={c.id} interactive={false}/><strong>{c.name}</strong><span>{c.kind}</span>
    </button>)}</div>
    <button type="button" className="primary-button" disabled={!selected} onClick={() => selected && onAdopt(selected)}>{selected ? `${wa(companion(selected).name)} 함께할게요` : '친구를 골라 주세요'}</button>
  </div>;
}

export function CompanionCollection({ state, records, onChoose, onAdopt }: { state: CompanionState | null; records: DailyCheckin[]; onChoose: (id: CompanionId) => void; onAdopt: () => void }) {
  const names = usePersonalGarden()?.names;
  const bonding = !canAdopt(state, records);
  const missions = readMissionLog().done;
  return <div className="settings-content">
    {state && <p className="companion-rule">{bondProgress(state, records).copy}</p>}
    <div className="companion-grid">{COMPANIONS.map(c => {
      const adoption = state?.adopted.find(a => a.id === c.id);
      if (!adoption) return <article key={c.id} className="companion-card companion-card--locked"><CompanionArt id={c.id} interactive={false} label={`${c.name} · 아직 만나지 않은 친구`}/><strong>{c.name}</strong><span>{bonding ? '지금 친구와 단짝이 되면 만날 수 있어요' : '데려올 수 있어요'}</span></article>;
      const { level } = bond(records, adoption.adoptedOn);
      const growth = treeGrowth(records, adoption.adoptedOn, undefined, missions);
      const active = state!.active === c.id;
      return <article key={c.id} className={'companion-card' + (active ? ' companion-card--selected' : '')}>
        <CompanionArt id={c.id} stage={growth.stage.level} interactive={false}/><strong>{names?.[c.id] ?? c.name}</strong>
        <span>{growth.stage.name} · 함께 자란 날 {growth.days}일</span>
        <span><span className="companion-hearts" aria-hidden="true">{hearts(level)}</span> {bondName(level)} · {Number(adoption.adoptedOn.slice(5, 7))}월 {Number(adoption.adoptedOn.slice(8))}일부터</span>
        {active ? <span className="companion-badge">정원 대표</span> : <button type="button" className="shop-secondary" onClick={() => onChoose(c.id)}>정원 대표로</button>}
      </article>;
    })}</div>
    {!bonding && state && state.adopted.length < COMPANIONS.length && <button type="button" className="primary-button" onClick={onAdopt}>새 친구 데려오기</button>}
  </div>;
}

function bondProgress(state: CompanionState, records: DailyCheckin[]) {
  const adoption = state.adopted.find(a => a.id === state.active)!;
  const rule = bondRule();
  const { level, visitDays, careDays } = bond(records, adoption.adoptedOn, rule);
  const [done, goal, copy] = level === 1 ? [visitDays, rule.visitDays, '정원에 들러 주기만 해도 가까워져요.']
    : level === 2 ? [careDays, rule.careDays, '작은 돌봄을 한 날마다 더 가까워져요. 하루 하나면 충분하고, 쉬어 간 날도 그대로예요.'] : [1, 1, '단짝이 되었어요. 늘 곁에 있을게요.'];
  return { adoption, info: companion(state.active), level, percent: Math.min(100, (done / Math.max(goal, 1)) * 100), copy };
}

/** Home card shown only when the bond just deepened; the everyday status is the level pill and the help balloon. */
export function CompanionStatus({ state, records, onSeen, onOpen }: { state: CompanionState; records: DailyCheckin[]; onSeen: (level: BondLevel) => void; onOpen: (view: 'companion' | 'companions' | 'decorate') => void }) {
  const names = usePersonalGarden()?.names;
  const { adoption, info, level } = bondProgress(state, records);
  if (level <= adoption.seenLevel) return null;
  return <section className="companion-status companion-status--news" aria-live="polite">
    <p className="eyebrow">더 가까워졌어요</p><h2><span className="companion-hearts" aria-hidden="true">{hearts(level)}</span> {wa(names?.[info.id] ?? info.name)} {ga(bondName(level))} 되었어요</h2>
    {level === 3 ? <><p>다음엔 어떻게 할까요? 무엇을 골라도 괜찮아요.</p><div className="companion-actions">
      {state.adopted.length < COMPANIONS.length && <button type="button" onClick={() => { onSeen(level); onOpen('companion'); }}>새 친구 데려오기</button>}
      <button type="button" onClick={() => onSeen(level)}>이대로 함께 지내기</button>
      <button type="button" onClick={() => { onSeen(level); onOpen('decorate'); }}>정원 꾸미기</button>
    </div></> : <div className="companion-actions"><button type="button" onClick={() => onSeen(level)}>좋아요</button></div>}
  </section>;
}
