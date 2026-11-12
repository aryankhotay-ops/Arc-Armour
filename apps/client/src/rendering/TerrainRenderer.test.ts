import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { createMutableTerrain, carveCrater } from '@artillery/simulation';
import { TerrainView } from './TerrainRenderer';
import { terrainTheme } from './TerrainTheme';
import type { BackgroundId } from './BackgroundCatalog';

afterEach(() => vi.unstubAllGlobals());

function fixture(id: BackgroundId) {
  const calls = new Map<string, ReturnType<typeof vi.fn>>();
  const context = new Proxy(
    {},
    {
      get: (_target, key: string) => {
        if (key === 'createLinearGradient') return () => ({ addColorStop: vi.fn() });
        if (!calls.has(key)) calls.set(key, vi.fn());
        return calls.get(key);
      },
    },
  );
  const refresh = vi.fn();
  const sprite = { setOrigin: () => sprite, setDepth: () => sprite };
  const scene = {
    textures: { exists: () => false, createCanvas: () => ({ context, refresh }) },
    add: { image: () => sprite },
  };
  vi.stubGlobal('document', { body: { dataset: {} } });
  return { view: new TerrainView(scene as unknown as Phaser.Scene, id), refresh, calls };
}

describe('matching cosmetic terrain materials', () => {
  it('leaves the first three materials unchanged and provides graphite/regolith without grass bands', () => {
    expect(terrainTheme('golden-valley')).toBe(terrainTheme('desert-canyon'));
    expect(terrainTheme('golden-valley')).toBe(terrainTheme('moonlit-alpine'));
    expect(terrainTheme('pencil-study')).toMatchObject({ style: 'graphite', soilBands: [] });
    expect(terrainTheme('lunar-earthrise')).toMatchObject({ style: 'regolith', soilBands: [] });
  });
  it.each(['golden-valley', 'pencil-study', 'lunar-earthrise'] as const)(
    '%s is clipped to the actual surface and cached across ordinary frames',
    (id) => {
      const { view, refresh, calls } = fixture(id);
      const terrain = createMutableTerrain();
      const before = JSON.stringify(terrain);
      view.update(terrain);
      expect(calls.get('clip')).toHaveBeenCalledOnce();
      expect(refresh).toHaveBeenCalledOnce();
      view.update(terrain);
      view.update(terrain);
      expect(refresh).toHaveBeenCalledOnce();
      expect(JSON.stringify(terrain)).toBe(before);
    },
  );
  it('redraws matching material on switch while paused, retaining crater samples and the initial surface', () => {
    const { view, refresh, calls } = fixture('golden-valley');
    const terrain = createMutableTerrain();
    view.update(terrain);
    const y = terrain.surfaceY[400]!;
    carveCrater(terrain, 400, y, 80);
    view.update(terrain);
    const before = JSON.stringify(terrain);
    for (const id of ['pencil-study', 'lunar-earthrise', 'golden-valley'] as const) {
      view.setBackground(id);
      view.update(terrain);
      expect(JSON.stringify(terrain)).toBe(before);
    }
    expect(refresh).toHaveBeenCalledTimes(5);
    // The pale cut-edge still gets drawn after returning to the original palette.
    expect(calls.get('stroke')!.mock.calls.length).toBeGreaterThan(0);
    view.setBackground('desert-canyon');
    view.update(terrain);
    expect(refresh).toHaveBeenCalledTimes(5);
  });
});
