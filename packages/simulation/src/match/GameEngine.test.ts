import { describe, expect, it } from 'vitest';

import { GameEngine } from './GameEngine';

describe('turn-based combat engine', () => {
  it('locks controls during a shot and advances to the other player after resolution', () => {
    const engine = new GameEngine();
    const initialX = engine.activeTank.x;

    expect(engine.fire()).toBe(true);
    expect(engine.state.phase).toBe('projectile');
    engine.moveActiveTank(20);
    expect(engine.state.tanks[0].x).toBe(initialX);

    for (let index = 0; index < 1_800 && engine.state.turnNumber === 1; index += 1) {
      engine.update(1 / 60);
    }

    expect(engine.state.turnNumber).toBe(2);
    expect(engine.state.activePlayerId).toBe('player2');
    expect(engine.state.phase).toBe('aiming');
  });

  it('clamps angle and power to playable bounds', () => {
    const engine = new GameEngine();
    engine.setAim(-999, 99);
    expect(engine.activeTank.aim.angleDegrees).toBe(5);
    expect(engine.activeTank.aim.power).toBe(1);

    engine.setAim(999, -99);
    expect(engine.activeTank.aim.angleDegrees).toBe(85);
    expect(engine.activeTank.aim.power).toBe(0.2);
  });
});
