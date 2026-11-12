import type Phaser from 'phaser';
import type { SettingsStorage } from '../settings/LocalSettings';

// Original illustration fallback after both image-generation attempts failed. Each 16:9
// plate contains scenery only: collision ground, craters, tanks and effects remain live.
// Vite fingerprints these local files; no third-party host or per-frame rasterization.
export const BACKGROUNDS = [
  {
    id: 'golden-valley',
    name: 'Golden Valley',
    description: 'Lavender peaks at sunset',
    url: new URL('../assets/backgrounds/golden-valley.webp', import.meta.url).href,
  },
  {
    id: 'desert-canyon',
    name: 'Desert Canyon',
    description: 'Terracotta mesas and dusty dunes',
    url: new URL('../assets/backgrounds/desert-canyon.webp', import.meta.url).href,
  },
  {
    id: 'moonlit-alpine',
    name: 'Moonlit Alpine',
    description: 'Blue peaks under a quiet aurora',
    url: new URL('../assets/backgrounds/moonlit-alpine.webp', import.meta.url).href,
  },
  {
    id: 'pencil-study',
    name: 'Pencil Study',
    description: 'Graphite mountains, cross-hatching and warm sketchbook paper',
    url: new URL('../assets/backgrounds/pencil-study.webp', import.meta.url).href,
  },
  {
    id: 'lunar-earthrise',
    name: 'Lunar Earthrise',
    description: 'Cratered lunar highlands with NASA’s Apollo 17 Earth in black space',
    url: new URL('../assets/backgrounds/lunar-earthrise.webp', import.meta.url).href,
  },
] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number]['id'];
export const BACKGROUND_STORAGE_KEY = 'arc-and-armor.background.v1';
export const backgroundId = (value: unknown): BackgroundId =>
  BACKGROUNDS.find((item) => item.id === value)?.id ?? 'golden-valley';
export const backgroundKey = (id: BackgroundId): string => `arc-backdrop-${id}`;

export function loadBackground(storage: Pick<SettingsStorage, 'getItem'>): BackgroundId {
  try {
    return backgroundId(storage.getItem(BACKGROUND_STORAGE_KEY));
  } catch {
    return 'golden-valley';
  }
}

// Retain the choice between scenes even if private browsing denies storage.
let sessionChoice: BackgroundId | undefined;
export function currentBackground(): BackgroundId {
  if (sessionChoice !== undefined) return sessionChoice;
  const query = new URLSearchParams(window.location.search).get('background');
  if (query !== null) sessionChoice = backgroundId(query);
  else {
    try {
      sessionChoice = loadBackground(window.localStorage);
    } catch {
      sessionChoice = 'golden-valley';
    }
  }
  return sessionChoice;
}
export function chooseBackground(value: unknown): BackgroundId {
  sessionChoice = backgroundId(value);
  try {
    window.localStorage.setItem(BACKGROUND_STORAGE_KEY, sessionChoice);
  } catch {
    /* Session selection still works when storage is denied. */
  }
  return sessionChoice;
}

export function preloadBackgrounds(scene: Phaser.Scene): void {
  for (const item of BACKGROUNDS) {
    if (!scene.textures.exists(backgroundKey(item.id)))
      scene.load.image(backgroundKey(item.id), item.url);
  }
}

export function backgroundOptions(): string {
  return BACKGROUNDS.map(
    (item) =>
      `<option value="${item.id}"${item.id === currentBackground() ? ' selected' : ''}>${item.name}</option>`,
  ).join('');
}
