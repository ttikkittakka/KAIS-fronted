type GardenDestination = 'shop' | 'decorate';

export const GARDEN_DESTINATIONS = {
  shop: { title: '작은 정원 상점', description: '이곳에서 새로운 정원 친구들과 꾸미기 아이템을 만나게 될 거예요.' },
  decorate: { title: '나의 정원 꾸미기', description: '앞으로 이곳에서 나만의 정원을 꾸밀 수 있어요.' },
};

// A future balance source can supply this prop without changing storage now.
export function SunshineBalance({ balance }: { balance: number }) {
  return <span className="sunshine-balance" role="status" aria-label={'햇살 ' + balance + '개'}>
    <span aria-hidden="true">☀️</span><span aria-hidden="true">{balance}</span>
  </span>;
}

function GardenToolIcon({ kind }: { kind: GardenDestination }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'shop' ? <><path d="M5 8h14l1 12H4L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></> : <><path d="m4 20 4-1 11-11-3-3L5 16l-1 4Zm10-13 3 3M5 16l3 3"/><path d="M5 3v4M3 5h4M19 15v4M17 17h4"/></>}
  </svg>;
}

export function GardenTools({ onOpen }: { onOpen: (destination: GardenDestination) => void }) {
  return <div className="garden-tools" role="group" aria-label="정원 메뉴">
    <button type="button" onClick={() => onOpen('shop')}><GardenToolIcon kind="shop"/>상점</button>
    <button type="button" onClick={() => onOpen('decorate')}><GardenToolIcon kind="decorate"/>보관함 · 꾸미기</button>
  </div>;
}

export function GardenPreparation({ kind, onReturn }: { kind: GardenDestination; onReturn: () => void }) {
  return <div className="garden-preparation-content">
    <div className="garden-preparation-card">
      <span className="garden-preparation-icon"><GardenToolIcon kind={kind}/></span>
      <p className="eyebrow">천천히 준비하고 있어요</p>
      <p>{GARDEN_DESTINATIONS[kind].description}</p>
    </div>
    <button type="button" className="primary-button" onClick={onReturn}>정원으로 돌아가기</button>
  </div>;
}
