import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { SunshineBalance, GardenTools, GardenPreparation } = loadTs(new URL('../src/app/components/GardenFeatures.tsx', import.meta.url));

test('garden entry controls open each preparation destination and both return to the garden', () => {
  const destinations = [];
  const tools = GardenTools({ onOpen: view => destinations.push(view) });
  for (const button of tools.props.children) button.props.onClick();
  assert.deepEqual(destinations, ['shop', 'decorate']);
  let returned = 0;
  for (const kind of destinations) {
    const screen = GardenPreparation({ kind, onReturn: () => returned++ });
    const button = screen.props.children.find(child => child.type === 'button');
    assert.equal(button.props.children, '정원으로 돌아가기');
    button.props.onClick();
  }
  assert.equal(returned, 2);
});

test('sunshine indicator supports supplied balances without a storage dependency', () => {
  for (const balance of [0, 125]) {
    const indicator = SunshineBalance({ balance });
    assert.equal(indicator.props['aria-label'], '햇살 ' + balance + '개');
    assert.equal(indicator.props.children[1].props.children, balance);
  }
});
