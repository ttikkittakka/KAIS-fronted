'use client';

import { useState } from 'react';
import Image from 'next/image';
import { GARDEN_SLOTS, type GardenLayout } from '../garden-layout';
import { shopItem, type ShopItem } from '../shop-catalog';

/** An item's picture: backgrounds are a small sky swatch, outfits public/wardrobe/<id>.webp, the rest public/garden/<id>.webp. */
export function ItemArt({ item }: { item: ShopItem }) {
  const [missing, setMissing] = useState(false);
  if (item.category === 'background') return <span className={'garden-scene item-swatch garden-scene--' + item.id} aria-hidden="true"/>;
  // A missing picture falls back to the catalog glyph instead of a broken image.
  if (missing) return <span className="item-glyph" aria-hidden="true">{item.icon}</span>;
  return <Image className="item-art" src={`/${item.category === 'outfit' ? 'wardrobe' : 'garden'}/${item.id}.webp`} alt="" width={256} height={256} unoptimized draggable={false} onError={() => setMissing(true)}/>;
}

export default function GardenPlacement({ layout }: { layout: GardenLayout | null }) {
  if (!layout) return null;
  return <div className="garden-placements" aria-label="배치된 정원 친구와 장식">
    {GARDEN_SLOTS.filter(slot => slot.id !== 'background').map(slot => {
      const id = layout[slot.id];
      const item = id ? shopItem(id) : undefined;
      if (!item) return null;
      return <span key={slot.id} data-slot={slot.id} data-item={item.id} role="img" className={'garden-placed garden-placed--' + item.category}
        style={{ left: slot.x + '%', top: slot.y + '%', width: slot.width + '%', height: slot.height + '%' }}
        aria-label={slot.label + ': ' + item.name} title={slot.label + ': ' + item.name}>
        <ItemArt key={item.id} item={item}/>
      </span>;
    })}
  </div>;
}
