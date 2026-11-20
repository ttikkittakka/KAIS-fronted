'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { INTERACTIONS, unlockLabel } from '../chat';
import { bondName, bondRule } from '../companions';
import { MIND_NAMES, unlocked, type Growth } from '../pet-growth';
import { Icon, type IconName } from './PetIcon';

export type MenuItem = { id: string; label: string; icon: IconName; locked?: string };

// Escape closes; the latest onClose is read through a ref so re-renders never re-run the focus effect.
function useEscape(onClose: () => void) {
  const latest = useRef(onClose);
  useEffect(() => { latest.current = onClose; });
  useEffect(() => {
    const esc = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') latest.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
}

/** Interactions fan out in a ring around the friend, one after another like a folding fan opening.
 *  The parent draws the backdrop that closes it. */
export function PetMenu({ items, onPick, onClose }: { items: MenuItem[]; onPick: (id: string) => void; onClose: () => void }) {
  const ring = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const size = 4;
  const pages = Math.ceil(items.length / size);
  const visible = items.slice(page * size, (page + 1) * size);
  useEscape(onClose);
  useEffect(() => { ring.current?.querySelector('button')?.focus(); }, [page]);
  // Arrow keys walk around the ring.
  const step = (event: KeyboardEvent) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const buttons = Array.from(ring.current?.querySelectorAll('button') ?? []);
    buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + delta + buttons.length) % buttons.length]?.focus();
  };
  return <div className="pet-menu" role="menu" aria-label="함께할 일" ref={ring} onKeyDown={step}>
      {visible.map((item, i) => <button key={item.id} type="button" role="menuitem" className={'pet-menu__item' + (item.locked ? ' pet-menu__item--locked' : '')}
        style={{ '--a': (i * 360) / visible.length + 'deg', '--i': i } as CSSProperties}
        aria-label={item.locked ? `${item.label}, ${item.locked}에 열려요` : item.label} onClick={() => onPick(item.id)}>
        <span className="pet-menu__icon"><Icon name={item.icon}/>{item.locked && <i className="pet-menu__lock"><Icon name="lock" size={11}/></i>}</span>
        <span className="pet-menu__label" aria-hidden="true">{item.label}</span>
      </button>)}
      {pages > 1 && <button className="pet-menu__next" type="button" role="menuitem" aria-label={`다른 펫 동작 보기 (${page + 1}/${pages})`} onClick={() => setPage((page + 1) % pages)}><Icon name="more" size={20}/></button>}
  </div>;
}

const GESTURES: [IconName, string, string][] = [
  ['sparkle', '한 번 누르기', '동작 메뉴를 열어요. 가운데 점 세 개를 누르면 다른 동작이 나와요.'],
  ['pet', '옆으로 쓸어 주기', '살살 쓰다듬어 줘요.'],
  ['hug', '꾹 누르고 있기', '꼭 안아 줘요.'],
  ['mic', '말풍선 · 마이크', '말풍선을 누르면 대화창이 열리고, 마이크로 말하면 들은 대로 전해져요.'],
];

/** 도움말 풍선: how to play, how the friend grows, and what opens next. */
export function HelpSheet({ name, growth, onClose }: { name: string; growth: Growth; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEscape(onClose);
  useEffect(() => {
    close.current?.focus();
    const behind = Array.from(document.querySelectorAll<HTMLElement>('.phone-frame > :not(.help-sheet)'));
    behind.forEach(el => { el.inert = true; });
    return () => behind.forEach(el => { el.inert = false; });
  }, []);
  const rule = bondRule();
  const { bond, mind } = growth;
  const meters = [
    { label: '레벨', level: growth.level, max: 6, note: '친밀도와 마음 성숙도가 오를 때마다 함께 올라요.' },
    { label: '친밀도', level: bond.level, max: 3, note: bondName(bond.level) + ' · ' + (bond.level === 1 ? `정원에 들른 날 ${bond.visitDays}/${rule.visitDays}일` : bond.level === 2 ? `작은 돌봄을 한 날 ${bond.careDays}/${rule.careDays}일` : '단짝이 되었어요') },
    { label: '마음 성숙도', level: mind.level, max: 4, note: MIND_NAMES[mind.level - 1] + ' · ' + (mind.next ? `오늘의 나를 기록한 날 ${mind.days}/${mind.next}일` : `기록한 날 ${mind.days}일`) },
  ];
  return createPortal(<section className="help-sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
    <header className="chat-head"><div><h2 id="help-title">{name}와 함께하는 법</h2><p>천천히 함께할수록 할 수 있는 일이 늘어나요</p></div>
      <button type="button" ref={close} className="chat-close" onClick={onClose} aria-label="도움말 닫기"><Icon name="close"/></button></header>
    <div className="help-body">
      <h3>함께 자라요</h3>
      <ul className="help-meters">{meters.map(m => <li key={m.label}><div><strong>{m.label} Lv.{m.level}</strong><span>{m.note}</span></div>
        <i role="img" aria-label={`${m.label} ${m.level}/${m.max}`} style={{ '--fill': (m.level / m.max) * 100 + '%' } as CSSProperties}/></li>)}</ul>
      <p className="help-note">친밀도는 정원에 들르고 작은 돌봄을 한 날만큼, 마음 성숙도는 오늘의 나를 기록한 날만큼 자라요. 쉬어 간 날이 있어도 줄어들지 않아요.</p>
      <h3>이렇게 놀아요</h3>
      <ul className="help-gestures">{GESTURES.map(([icon, title, copy]) => <li key={title}><span><Icon name={icon} size={20}/></span><div><strong>{title}</strong><p>{copy}</p></div></li>)}</ul>
      <h3>함께할 수 있는 일</h3>
      <ul className="help-unlocks">{INTERACTIONS.map(action => { const open = unlocked(growth, action.unlock); return <li key={action.id} className={open ? '' : 'help-locked'}>
        <span><Icon name={open ? action.id : 'lock'} size={18}/></span><strong>{action.label}</strong><small>{open ? '할 수 있어요' : unlockLabel(action.unlock!) + '에 열려요'}</small></li>; })}</ul>
      {growth.unlockAll && <p className="help-note">개발자 무제한 모드라 모든 상호작용이 열려 있어요.</p>}
      <p className="help-note">지원 제도가 필요하면 메뉴의 <strong>도움 찾기</strong>를 누르거나 {name}에게 &ldquo;지원 제도 도와줘&rdquo;라고 말해 보세요. 신청까지 같이 해 줘요. 지금 많이 힘들다면 <a href="#safety">도움 받을 수 있는 곳(109)</a>을 먼저 봐 주세요.</p>
    </div>
  </section>, document.querySelector('.phone-frame') ?? document.body);
}
