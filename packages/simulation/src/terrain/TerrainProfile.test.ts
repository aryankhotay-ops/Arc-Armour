import { describe, expect, it } from 'vitest';

import { WORLD_BOUNDS } from '../index';
import {
  TANK_SPAWN_X,
  TERRAIN_STYLES,
  TERRAIN_GENERATION_VERSION,
  createBattlefieldTerrain,
  sampleSurfaceY,
} from './TerrainProfile';
import { GameEngine } from '../match/GameEngine';

const checksum = (samples: readonly number[]): string =>
  samples.map((sample) => sample.toFixed(6)).join('|');

describe('battlefield terrain', () => {
  it('is deterministic and spans the fixed gameplay world', () => {
    const first = createBattlefieldTerrain();
    const second = createBattlefieldTerrain();

    expect(first.width).toBe(WORLD_BOUNDS.width);
    expect(first.surfaceY).toHaveLength(WORLD_BOUNDS.width + 1);
    expect(checksum(first.surfaceY)).toBe(checksum(second.surfaceY));
  });

  it('keeps both tank spawn regions inside opposite halves of the battlefield', () => {
    const terrain = createBattlefieldTerrain();

    expect(TANK_SPAWN_X.player1).toBeLessThan(WORLD_BOUNDS.width / 2);
    expect(TANK_SPAWN_X.player2).toBeGreaterThan(WORLD_BOUNDS.width / 2);
    expect(sampleSurfaceY(terrain, TANK_SPAWN_X.player1)).toBeGreaterThan(400);
    expect(sampleSurfaceY(terrain, TANK_SPAWN_X.player2)).toBeGreaterThan(400);
  });

  it('reproduces the same seeded map while different seeds change both shape and layout', () => {
    const signatures = new Set<string>();
    const styles = new Set<string>();
    for (let seed = 0; seed < 120; seed++) {
      const first = createBattlefieldTerrain(seed);
      const second = createBattlefieldTerrain(seed);
      expect(first.surfaceY).toEqual(second.surfaceY);
      expect(first.generationVersion).toBe(TERRAIN_GENERATION_VERSION);
      signatures.add(checksum(first.surfaceY));
      styles.add(first.style);
    }
    expect(signatures.size).toBe(120);
    expect([...styles]).toEqual([...TERRAIN_STYLES]);
  });

  it('has bounded heights, finite one-column samples, drivable natural slopes and exact level spawns across 120 seeds', () => {
    for (let seed = 0; seed < 120; seed++) {
      const engine = new GameEngine({ terrainSeed: seed });
      expect(engine.terrainSeed).toBe(seed);
      for (const tank of engine.state.tanks) {
        expect(tank.hullAngle).toBe(0);
        expect(tank.leftContactY).toBe(tank.rightContactY);
        expect(tank.groundY).toBeGreaterThanOrEqual(WORLD_BOUNDS.height * 0.45);
        expect(tank.groundY).toBeLessThanOrEqual(WORLD_BOUNDS.height * 0.84);
        expect(tank.health).toBe(100);
      }
      const samples = engine.terrain.surfaceY;
      expect(samples.every(Number.isFinite)).toBe(true);
      const maxStep = samples.reduce(
        (max, y, x) => (x === 0 ? max : Math.max(max, Math.abs(y - samples[x - 1]!))),
        0,
      );
      expect(maxStep, `terrain seed ${seed}`).toBeLessThanOrEqual(0.450000001);
    }
  });

  it('does not recreate a mandatory central hump: some maps have valleys and off-center high ground', () => {
    const hills: number[] = [];
    for (let seed = 0; seed < 24; seed++) {
      const map = createBattlefieldTerrain(seed);
      const heights = map.surfaceY.slice(640, 2560);
      hills.push(heights.indexOf(Math.min(...heights)) + 640);
    }
    expect(new Set(hills).size).toBeGreaterThan(15);
    expect(hills.filter((x) => Math.abs(x - WORLD_BOUNDS.width / 2) > 400).length).toBeGreaterThan(
      10,
    );
  });
});
