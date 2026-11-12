import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTerrainSeed } from './MatchSetup';

afterEach(() => vi.unstubAllGlobals());

describe('new match terrain seed boundaries', () => {
  it('accepts explicit reproducible map links independently of draft seeds', () => {
    expect(resolveTerrainSeed('?seed=90&terrainSeed=1234')).toBe(1234);
    expect(resolveTerrainSeed('?terrainSeed=0')).toBe(0);
    expect(resolveTerrainSeed('?terrainSeed=4294967295')).toBe(4294967295);
  });
  it('draws fresh entropy for ordinary matches and refuses malformed seeds', () => {
    let next = 200;
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values[0] = next++;
        return values;
      },
    });
    expect(resolveTerrainSeed('?seed=1')).toBe(200);
    expect(resolveTerrainSeed('?seed=1')).toBe(201);
    expect(resolveTerrainSeed('?terrainSeed=-1')).toBe(202);
    expect(resolveTerrainSeed('?terrainSeed=abc')).toBe(203);
    expect(resolveTerrainSeed('?terrainSeed=4294967296')).toBe(204);
    expect(resolveTerrainSeed('?terrainSeed=')).toBe(205);
  });
  it('avoids accidental repeat entropy for a new rematch', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values[0] = 77;
        return values;
      },
    });
    expect(resolveTerrainSeed('', 77)).toBe(78);
    expect(resolveTerrainSeed('?terrainSeed=77', 77)).toBe(77);
  });
});
