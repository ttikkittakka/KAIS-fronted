import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { GardenTools } = loadTs(new URL('../src/app/components/GardenFeatures.tsx', import.meta.url));

test('garden icon row opens every destination and flags a waiting gift', () => {
  const destinations = [];
  const buttons = GardenTools({ onOpen: view => destinations.push(view), giftPending: true }).props.children;
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(destinations, ['shop', 'rewards', 'companions']);
  assert.ok(buttons.every(button => button.props['aria-label']), 'icon buttons keep an accessible name');
  assert.match(buttons[1].props['aria-label'], /새 선물/);
  assert.doesNotMatch(GardenTools({ onOpen() {} }).props.children[1].props['aria-label'], /새 선물/);
});
