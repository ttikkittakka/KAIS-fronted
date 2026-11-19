type QuickDestination = 'shop' | 'companions' | 'rewards';

const TOOL_PATHS: Record<QuickDestination, React.ReactNode> = {
  shop: <><path d="M5 8h14l1 12H4L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></>,
  companions: <><circle cx="6.5" cy="10" r="1.7"/><circle cx="10" cy="6.3" r="1.7"/><circle cx="14" cy="6.3" r="1.7"/><circle cx="17.5" cy="10" r="1.7"/><path d="M12 11.5c-3 0-5.5 3.3-5.5 5.6 0 1.6 1.3 2.4 2.8 2.4 1 0 1.7-.5 2.7-.5s1.7.5 2.7.5c1.5 0 2.8-.8 2.8-2.4 0-2.3-2.5-5.6-5.5-5.6Z"/></>,
  rewards: <><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3.6-5.3-1.5C6.4 8.4 10 8 12 8Zm0 0c1.5-3 5-3.6 5.3-1.5.3 1.9-3.3 1.5-5.3 1.5Z"/></>,
};

const QUICK_TOOLS: [QuickDestination, string][] = [['shop', '상점'], ['rewards', '선물'], ['companions', '친구들']];

/** One row of labelled icon shortcuts in the 꾸미기 tab: the shop, anniversary gifts and the friends. */
export function GardenTools({ onOpen, giftPending = false }: { onOpen: (destination: QuickDestination) => void; giftPending?: boolean }) {
  return <nav className="garden-tools" aria-label="정원 메뉴">
    {QUICK_TOOLS.map(([kind, label]) => {
      const badge = kind === 'rewards' && giftPending;
      return <button key={kind} type="button" className="garden-tool" onClick={() => onOpen(kind)} aria-label={badge ? label + ' (새 선물 도착)' : label}>
        <span className="garden-tool__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TOOL_PATHS[kind]}</svg>
          {badge && <i className="garden-tool__badge" aria-hidden="true"/>}</span>
        <span className="garden-tool__label" aria-hidden="true">{label}</span>
      </button>;
    })}
  </nav>;
}
