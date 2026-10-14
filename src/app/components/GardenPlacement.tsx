import { GARDEN_SLOTS, type GardenLayout } from '../garden-layout';
import { shopItem } from '../shop-catalog';

export default function GardenPlacement({ layout }: { layout: GardenLayout | null }) {
  if (!layout) return null;
  return <div className="garden-placements" aria-label="배치된 정원 친구와 장식">
    {GARDEN_SLOTS.filter(slot => slot.id !== 'background').map(slot => {
      const id = layout[slot.id];
      const item = id ? shopItem(id) : undefined;
      if (!item) return null;
      return <span key={slot.id} data-slot={slot.id} role="img" className={'garden-placed garden-placed--' + item.category}
        style={{ left: slot.x + '%', top: slot.y + '%', width: slot.width + '%', height: slot.height + '%' }}
        aria-label={slot.label + ': ' + item.name + ' (임시 아이콘)'} title={slot.label + ': ' + item.name + ' · 임시 아이콘'}>
        <span aria-hidden="true">{item.icon}</span>
      </span>;
    })}
  </div>;
}
