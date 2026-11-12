import { describe, expect, it } from 'vitest';

import { GameEngine } from '../match/GameEngine';
import { moveTankAlongTerrain, TANK_MAX_X, TANK_MIN_SEPARATION, TANK_MIN_X } from './TankPhysics';

describe('terrain-following tank movement', () => {
  it('moves along the surface and updates ground height and hull orientation', () => {
    const engine = new GameEngine();
    const before = engine.activeTank;

    engine.moveActiveTank(70);
    const after = engine.activeTank;

    expect(after.x).toBeGreaterThan(before.x);
    expect(after.groundY).not.toBeNaN();
    expect(Math.abs(after.hullAngle)).toBeLessThan(Math.PI / 2);
    expect(after.movementRemaining).toBeLessThan(before.movementRemaining);
  });

  it('prevents battlefield escape and tank overlap', () => {
    const leftEngine = new GameEngine();
    const unlimitedLeft = { ...leftEngine.activeTank, movementRemaining: 10_000 };
    const atLeftEdge = moveTankAlongTerrain(
      unlimitedLeft,
      leftEngine.inactiveTank,
      leftEngine.terrain,
      -10_000,
    );
    expect(atLeftEdge.x).toBe(TANK_MIN_X);

    const rightEngine = new GameEngine();
    const unlimitedRight = { ...rightEngine.activeTank, movementRemaining: 10_000 };
    const blockedByOpponent = moveTankAlongTerrain(
      unlimitedRight,
      rightEngine.inactiveTank,
      rightEngine.terrain,
      10_000,
    );
    expect(blockedByOpponent.x).toBeLessThanOrEqual(TANK_MAX_X);
    expect(Math.abs(rightEngine.inactiveTank.x - blockedByOpponent.x)).toBeGreaterThanOrEqual(
      TANK_MIN_SEPARATION,
    );
  });
});
