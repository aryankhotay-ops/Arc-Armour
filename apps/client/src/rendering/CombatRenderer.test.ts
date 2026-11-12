import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import {
  GameEngine,
  SIMULATION_STEP_SECONDS as STEP,
  type CombatEvent,
} from '@artillery/simulation';
import { CombatView } from './CombatRenderer';

// Rendering command sink: no Phaser/DOM runtime, so we can assert observation is read-only.
const viewFor = (engine: GameEngine, reducedMotion = false): CombatView => {
  const graphics: object = new Proxy({}, { get: () => () => graphics });
  const scene = { add: { graphics: () => graphics } } as unknown as Phaser.Scene;
  return new CombatView(scene, (id) => engine.weapon(id), reducedMotion);
};
const present = (engine: GameEngine, view: CombatView, dt = STEP): void => {
  view.handleEvents(engine.drainEvents(), engine.state.tanks, engine.terrain);
  view.update(
    dt,
    engine.state.projectiles,
    engine.state.explosions,
    engine.drainProjectileMotion(),
    engine.interpolationAlpha,
    engine.state.tanks,
  );
};

describe('gameplay-event feedback', () => {
  it('does not animate driving for held/rejected input or stationary tanks', () => {
    const engine = new GameEngine();
    const view = viewFor(engine);
    present(engine, view);
    for (let n = 0; n < 30; n++) present(engine, view);
    expect(view.animationCounts['movement-dust']).toBeUndefined();
    engine.moveActiveTank(20);
    present(engine, view);
    expect(view.animationCounts['movement-dust']).toBe(1);
    engine.fire();
    engine.moveActiveTank(20); // Rejected by the in-flight phase.
    present(engine, view);
    expect(view.animationCounts['movement-dust']).toBe(1);
    expect(view.animationCounts['muzzle-flash']).toBe(1);
  });

  it('uses real explosions and terrain deformation and releases every effect', () => {
    const engine = new GameEngine({ captureProjectileMotion: true });
    const view = viewFor(engine);
    present(engine, view);
    engine.fire();
    for (let n = 0; n < 1000 && engine.state.turnNumber === 1; n++) {
      engine.update(STEP);
      present(engine, view);
    }
    expect(view.animationCounts.explosion).toBeGreaterThan(0);
    expect(view.animationCounts['terrain-impact']).toBeGreaterThan(0);
    expect(engine.terrain.revision).toBeGreaterThan(0);
    const state = JSON.stringify(engine.state);
    const terrain = JSON.stringify(engine.terrain);
    for (let n = 0; n < 180; n++) view.update(STEP, [], [], [], 0, engine.state.tanks);
    expect(view.activeTrailCount).toBe(0);
    expect(view.activeParticleCount).toBe(0);
    expect(JSON.stringify(engine.state)).toBe(state);
    expect(JSON.stringify(engine.terrain)).toBe(terrain);
  });

  it('does not throw terrain debris for an air explosion without deformation', () => {
    const engine = new GameEngine();
    const view = viewFor(engine);
    const explosion: CombatEvent = {
      type: 'explosion',
      explosionId: 1,
      shotId: 1,
      projectileId: 1,
      weaponId: 'standard-shell',
      x: 500,
      y: 100,
      blastRadius: 60,
      terrainRadius: 44,
      directHitTankId: undefined,
    };
    view.handleEvents([explosion], engine.state.tanks, engine.terrain);
    expect(view.animationCounts.explosion).toBe(1);
    expect(view.animationCounts['terrain-impact']).toBeUndefined();
    expect(engine.terrain.revision).toBe(0);
  });

  it('plays destruction once, including after game over, with bounded cleanup', () => {
    const engine = new GameEngine();
    const view = viewFor(engine);
    const event: CombatEvent = { type: 'tank-destroyed', tankId: 'player2', x: 1000, y: 500 };
    view.handleEvents([event, event], engine.state.tanks, engine.terrain);
    expect(view.animationCounts['tank-destruction']).toBe(1);
    expect(view.activeParticleCount).toBeGreaterThan(0);
    for (let n = 0; n < 150; n++) view.update(STEP, [], [], [], 0, engine.state.tanks);
    expect(view.activeParticleCount).toBe(0);
    view.handleEvents([event], engine.state.tanks, engine.terrain);
    expect(view.activeParticleCount).toBe(0);
  });

  it('reduces nonessential effects without suppressing real impact cues', () => {
    const engine = new GameEngine();
    const normal = viewFor(engine);
    const reduced = viewFor(engine, true);
    const event: CombatEvent = { type: 'tank-destroyed', tankId: 'player1', x: 200, y: 500 };
    for (const view of [normal, reduced])
      view.handleEvents([event], engine.state.tanks, engine.terrain);
    expect(reduced.activeParticleCount).toBeLessThan(normal.activeParticleCount);
    expect(reduced.animationCounts['tank-destruction']).toBe(1);
  });
});
