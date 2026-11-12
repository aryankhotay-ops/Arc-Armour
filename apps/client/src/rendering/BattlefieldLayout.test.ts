import { describe, expect, it } from 'vitest';
import { GameEngine, muzzlePosition, WORLD_BOUNDS } from '@artillery/simulation';
import { BATTLEFIELD_SCALE, VIEW_BOUNDS, screenToBattlefield } from './BattlefieldLayout';

describe('independent battlefield projection and readable UI', () => {
  it('fits the entire larger world into the unchanged 1280 x 720 logical viewport', () => {
    expect(VIEW_BOUNDS).toEqual({ width: 1280, height: 720 });
    expect(WORLD_BOUNDS.width * BATTLEFIELD_SCALE).toBeCloseTo(1280, 10);
    expect(WORLD_BOUNDS.height * BATTLEFIELD_SCALE).toBeCloseTo(720, 10);
    // The drawn chassis is 106 physical units wide; it must be a smaller target on screen.
    expect(106 * BATTLEFIELD_SCALE).toBeLessThan(62);
  });

  it('round-trips a visible muzzle and pointer input through the same uniform transform', () => {
    const engine = new GameEngine();
    for (const tank of engine.state.tanks) {
      const muzzle = muzzlePosition(tank, tank.aim.angleDegrees);
      const restored = screenToBattlefield(
        muzzle.x * BATTLEFIELD_SCALE,
        muzzle.y * BATTLEFIELD_SCALE,
      );
      expect(restored.x).toBeCloseTo(muzzle.x, 9);
      expect(restored.y).toBeCloseTo(muzzle.y, 9);
    }
  });
});
