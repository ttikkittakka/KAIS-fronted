'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { INTERACTIONS, unlockLabel } from '../chat';
import { BOND_LEVELS, bondName, bondRule, type BondLevel } from '../companions';
import type { DemoPlantControls } from '../demo-plant';
import { TREE_STAGES, unlocked, type Growth, type TreeLevel } from '../pet-growth';
import { Icon, type IconName } from './PetIcon';

export type MenuItem = { id: string; label: string; icon: IconName; locked?: string; selected?: boolean };

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
export function PetMenu({ items, onPick, onClose, label = '함께할 일', onBack }: {
  items: MenuItem[];
  onPick: (id: string) => void;
  onClose: () => void;
  label?: string;
  onBack?: () => void;
}) {
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
  return <div className="pet-menu" role="menu" aria-label={label} ref={ring} onKeyDown={step}>
      {visible.map((item, i) => <button key={item.id} type="button" role={item.selected === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.selected}
        className={'pet-menu__item' + (item.locked ? ' pet-menu__item--locked' : '')}
        style={{ '--a': (i * 360) / visible.length + 'deg', '--i': i } as CSSProperties}
        aria-label={item.locked ? `${item.label}, ${item.locked}에 열려요` : item.label} onClick={() => onPick(item.id)}>
        <span className="pet-menu__icon"><Icon name={item.icon}/>{item.locked && <i className="pet-menu__lock"><Icon name="lock" size={11}/></i>}</span>
        <span className="pet-menu__label" aria-hidden="true">{item.label}</span>
      </button>)}
      {onBack ? <button className="pet-menu__next" type="button" role="menuitem" aria-label="교감 메뉴로 돌아가기" onClick={onBack}><Icon name="back" size={20}/></button>
        : pages > 1 && <button className="pet-menu__next" type="button" role="menuitem" aria-label={`다른 펫 동작 보기 (${page + 1}/${pages})`} onClick={() => setPage((page + 1) % pages)}><Icon name="more" size={20}/></button>}
  </div>;
}

const GESTURES: [IconName, string, string][] = [
  ['sparkle', '한 번 누르기', '동작 메뉴를 열어요. 가운데 점 세 개를 누르면 다른 동작이 나와요.'],
  ['pet', '옆으로 쓸어 주기', '살살 쓰다듬어 줘요.'],
  ['hug', '꾹 누르고 있기', '꼭 안아 줘요.'],
  ['mic', '말풍선 · 마이크', '말풍선을 누르면 대화창이 열리고, 마이크로 말하면 들은 대로 전해져요.'],
];

/** 도움말 풍선: how to play, how the friend grows, and what opens next. */
export function HelpSheet({ name, growth, onClose, onDemoChange }: {
  name: string; growth: Growth; onClose: () => void; onDemoChange?: DemoPlantControls['onChange'];
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEscape(onClose);
  useEffect(() => {
    close.current?.focus();
    const behind = Array.from(document.querySelectorAll<HTMLElement>('.phone-frame > :not(.help-sheet)'));
    behind.forEach(el => { el.inert = true; });
    return () => behind.forEach(el => { el.inert = false; });
  }, []);
  const rule = bondRule();
  const { bond, tree } = growth;
  const meters = [
    { label: '친밀도', level: bond.level, max: 3, note: bondName(bond.level) + ' · ' + (bond.level === 1 ? `정원에 들른 날 ${bond.visitDays}/${rule.visitDays}일` : bond.level === 2 ? `작은 돌봄을 한 날 ${bond.careDays}/${rule.careDays}일` : '단짝이 되었어요') },
    { label: '나무 성장', level: tree.stage.level, max: TREE_STAGES.length, note: tree.stage.name + ' · ' + (tree.next ? `다음 단계까지 ${tree.next - tree.days}일` : `함께 자란 날 ${tree.days}일`) },
  ];
  return createPortal(<section className="help-sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
    <header className="chat-head"><div><h2 id="help-title">{name}와 함께하는 법</h2><p>천천히 함께할수록 할 수 있는 일이 늘어나요</p></div>
      <button type="button" ref={close} className="chat-close" onClick={onClose} aria-label="도움말 닫기"><Icon name="close"/></button></header>
    <div className="help-body">
      {onDemoChange && <fieldset className="demo-growth-controls">
        <legend>체험 성장 조절</legend>
        <label>친밀도
          <select value={bond.level} onChange={event => onDemoChange({ bondLevel: Number(event.currentTarget.value) as BondLevel })}>
            {BOND_LEVELS.map((label, index) => <option key={label} value={index + 1}>{index + 1}단계 · {label}</option>)}
          </select>
        </label>
        <label>나무 성장 단계
          <select value={tree.stage.level} onChange={event => onDemoChange({ treeLevel: Number(event.currentTarget.value) as TreeLevel })}>
            {TREE_STAGES.map(stage => <option key={stage.level} value={stage.level}>{stage.level}단계 · {stage.name}</option>)}
          </select>
        </label>
      </fieldset>}
      <h3>함께 자라요</h3>
      <ul className="help-meters">{meters.map(m => <li key={m.label}><div><strong>{m.label} {m.level}단계</strong><span>{m.note}</span></div>
        <i role="img" aria-label={`${m.label} ${m.level}/${m.max}`} style={{ '--fill': (m.level / m.max) * 100 + '%' } as CSSProperties}/></li>)}</ul>
      <p className="help-note">잔잔하거나 좋은 마음을 기록한 날, 또는 미션·마음 돌봄·일기를 남긴 날에 나무가 하루만큼 자라요. 쉬어 간 날에도 지금 크기를 간직해요.</p>
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
