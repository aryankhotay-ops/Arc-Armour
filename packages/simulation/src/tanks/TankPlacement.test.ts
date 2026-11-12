import { describe, expect, it } from 'vitest';

import { TANK_SPAWN_X, createBattlefieldTerrain, sampleSurfaceY } from '../terrain/TerrainProfile';
import { TANK_TRACK_HALF_WIDTH, placeTankOnTerrain } from './TankPlacement';

describe('tank terrain placement', () => {
  it.each([
    ['player1', TANK_SPAWN_X.player1],
    ['player2', TANK_SPAWN_X.player2],
  ] as const)('rests %s track endpoints on the terrain', (playerId, x) => {
    const terrain = createBattlefieldTerrain();
    const placement = placeTankOnTerrain(terrain, playerId, x);
    const sine = Math.sin(placement.hullAngle);
    const renderedLeftContactY = placement.groundY - TANK_TRACK_HALF_WIDTH * sine;
    const renderedRightContactY = placement.groundY + TANK_TRACK_HALF_WIDTH * sine;

    expect(renderedLeftContactY).toBeCloseTo(sampleSurfaceY(terrain, x - TANK_TRACK_HALF_WIDTH), 8);
    expect(renderedRightContactY).toBeCloseTo(
      sampleSurfaceY(terrain, x + TANK_TRACK_HALF_WIDTH),
      8,
    );
    expect(Math.abs(placement.hullAngle)).toBeLessThan(0.1);
  });
});
