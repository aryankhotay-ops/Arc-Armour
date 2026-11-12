import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import {
  BACKGROUNDS,
  BACKGROUND_STORAGE_KEY,
  backgroundId,
  backgroundKey,
  loadBackground,
  preloadBackgrounds,
} from './BackgroundCatalog';
import type Phaser from 'phaser';

afterEach(() => vi.unstubAllGlobals());

describe('five cosmetic background plates', () => {
  it('preserves the original three and adds two distinct stable identities and local asset URLs', () => {
    expect(BACKGROUNDS.map((item) => item.id)).toEqual([
      'golden-valley',
      'desert-canyon',
      'moonlit-alpine',
      'pencil-study',
      'lunar-earthrise',
    ]);
    expect(new Set(BACKGROUNDS.map((item) => backgroundKey(item.id))).size).toBe(5);
    for (const item of BACKGROUNDS) expect(item.url).toContain(`${item.id}.webp`);
  });
  it.each([null, undefined, '', 'bogus', '../../image', {}, 5])(
    'rejects invalid saved/query identities: %s',
    (value) => {
      expect(backgroundId(value)).toBe('golden-valley');
    },
  );
  it('loads valid saves, defaults unknown values and tolerates denied storage', () => {
    const getItem = vi.fn(() => 'moonlit-alpine');
    expect(loadBackground({ getItem })).toBe('moonlit-alpine');
    expect(getItem).toHaveBeenCalledWith(BACKGROUND_STORAGE_KEY);
    expect(loadBackground({ getItem: () => 'bad' })).toBe('golden-valley');
    expect(
      loadBackground({
        getItem: () => {
          throw new Error('Denied');
        },
      }),
    ).toBe('golden-valley');
  });
  it('queues only missing textures, so menu/battle/rematch reuse the cache', () => {
    const image = vi.fn();
    const scene = {
      textures: { exists: (key: string) => key === backgroundKey('golden-valley') },
      load: { image },
    };
    preloadBackgrounds(scene as unknown as Phaser.Scene);
    expect(image.mock.calls.map(([key]) => key)).toEqual([
      backgroundKey('desert-canyon'),
      backgroundKey('moonlit-alpine'),
      backgroundKey('pencil-study'),
      backgroundKey('lunar-earthrise'),
    ]);
  });
  it('retains session selection when browser storage is denied', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {
      location: { search: '' },
      get localStorage() {
        throw new Error('Denied');
      },
    });
    const catalog = await import('./BackgroundCatalog');
    expect(catalog.currentBackground()).toBe('golden-valley');
    expect(catalog.chooseBackground('desert-canyon')).toBe('desert-canyon');
    expect(catalog.currentBackground()).toBe('desert-canyon');
  });
  it('allows an explicit preview link without changing gameplay configuration', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { location: { search: '?draft=off&background=moonlit-alpine' } });
    const catalog = await import('./BackgroundCatalog');
    expect(catalog.currentBackground()).toBe('moonlit-alpine');
  });
  it('ships real WebP files within the combined transfer budget and editable 16:9 masters', () => {
    let total = 0;
    for (const item of BACKGROUNDS) {
      const url = new URL(`../assets/backgrounds/${item.id}.webp`, import.meta.url);
      const bytes = readFileSync(url);
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
      total += statSync(url).size;
      if (item.id === 'pencil-study' || item.id === 'lunar-earthrise') {
        const png = readFileSync(
          new URL(`../../../../art/backgrounds/${item.id}-master.png`, import.meta.url),
        );
        expect(png.subarray(1, 4).toString()).toBe('PNG');
        expect(png.readUInt32BE(16)).toBe(1920);
        expect(png.readUInt32BE(20)).toBe(1080);
        expect(statSync(url).size).toBeLessThan(300_000);
        continue;
      }
      const svg = readFileSync(
        new URL(`../../../../art/backgrounds/${item.id}.svg`, import.meta.url),
        'utf8',
      );
      expect(svg).toContain('viewBox="0 0 1920 1080"');
      expect(svg).not.toMatch(/<text|<image|foreignObject/);
    }
    expect(total).toBeLessThan(450_000);
  });
});
