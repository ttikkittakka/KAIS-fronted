import { appStorage, isDemo } from './app-storage';
import type { BondLevel } from './companions';
import type { TreeLevel } from './pet-growth';

export const DEMO_PLANT_MOODS = [
  { id: 'auto', label: '기본 표정', icon: 'leaf' },
  { id: 'happy', label: '기쁨', icon: 'smile' },
  { id: 'low', label: '속상함', icon: 'frown' },
  { id: 'excited', label: '신남', icon: 'sparkle' },
] as const;

export type DemoPlantSettings = {
  bondLevel: BondLevel;
  treeLevel: TreeLevel;
  mood: typeof DEMO_PLANT_MOODS[number]['id'];
};
export type DemoPlantControls = {
  settings: DemoPlantSettings;
  onChange: (changes: Partial<DemoPlantSettings>) => void;
};

const KEY = 'little-garden.demo-plant.v1';
const DEFAULTS: DemoPlantSettings = { bondLevel: 3, treeLevel: 1, mood: 'auto' };

export function readDemoPlantSettings(): DemoPlantSettings | null {
  if (!isDemo()) return null;
  try {
    const saved = JSON.parse(appStorage.getItem(KEY) ?? 'null') as DemoPlantSettings | null;
    if (saved && [1, 2, 3].includes(saved.bondLevel) && [1, 2, 3, 4].includes(saved.treeLevel) &&
      DEMO_PLANT_MOODS.some(mood => mood.id === saved.mood)) return saved;
  } catch { /* A malformed demo value falls back to the default preview. */ }
  return DEFAULTS;
}

export function updateDemoPlantSettings(changes: Partial<DemoPlantSettings>) {
  const current = readDemoPlantSettings();
  if (!current) return null;
  const settings = { ...current, ...changes };
  appStorage.setItem(KEY, JSON.stringify(settings));
  return settings;
}
