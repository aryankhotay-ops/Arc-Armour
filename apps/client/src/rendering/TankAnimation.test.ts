import { describe, expect, it } from 'vitest';
import { GameEngine } from '@artillery/simulation';
import { TankAnimation } from './TankAnimation';

describe('gameplay-driven tank animation', () => {
  it('advances tracks only for actual movement, including reverse and slope distance', () => {
    const engine = new GameEngine();
    const tank = engine.activeTank;
    const animation = new TankAnimation(tank);
    animation.update(tank, 1);
    expect(animation.trackDistance).toBe(0);
    const moved = { ...tank, x: tank.x + 12, groundY: tank.groundY + 5 };
    expect(animation.update(moved, 0.1)).toBe(13);
    expect(animation.trackDistance).toBe(13);
    animation.update(tank, 0.1);
    expect(animation.trackDistance).toBe(0);
  });

  it('eases barrel changes without mutating aim and synchronizes on a real launch', () => {
    const engine = new GameEngine();
    const animation = new TankAnimation(engine.activeTank);
    engine.setAim(80, 0.8);
    const tank = engine.activeTank;
    animation.update(tank, 1 / 60);
    expect(animation.angle).toBeGreaterThan(45);
    expect(animation.angle).toBeLessThan(80);
    engine.fire();
    animation.handleEvents(tank, engine.drainEvents());
    expect(animation.angle).toBe(80);
    animation.update(tank, 0.03);
    expect(animation.recoil).toBeGreaterThan(0);
    animation.update(tank, 1);
    expect(animation.recoil).toBe(0);
    expect(tank.aim.angleDegrees).toBe(80);
  });

  it('does not replay a launch recoil or fire for another player', () => {
    const engine = new GameEngine();
    const animation = new TankAnimation(engine.activeTank);
    engine.fire();
    const events = engine.drainEvents();
    animation.handleEvents(engine.inactiveTank, events);
    expect(animation.recoil).toBe(0);
    animation.handleEvents(engine.activeTank, events);
    animation.update(engine.activeTank, 0.4);
    animation.handleEvents(engine.activeTank, events);
    expect(animation.recoil).toBe(0);
  });

  it('fades hit feedback and transitions once to a persistent destroyed state', () => {
    const engine = new GameEngine();
    const animation = new TankAnimation(engine.activeTank);
    const tank = { ...engine.activeTank, health: 0 };
    const damage = {
      type: 'tank-damaged' as const,
      explosionId: 1,
      shotId: 1,
      tankId: tank.playerId,
      amount: 100,
      cause: 'blast' as const,
      remainingHealth: 0,
    };
    animation.handleEvents(tank, [damage]);
    expect(animation.destroyed).toBe(true);
    expect(animation.hitAlpha).toBeGreaterThan(0);
    animation.update(tank, 0.5);
    animation.handleEvents(tank, []);
    expect(animation.destructionAge).toBe(0.5);
    expect(animation.hitAlpha).toBe(0);
    expect(animation.recoil).toBe(0);
  });

  it('honors reduced motion without suppressing damage/destruction status', () => {
    const engine = new GameEngine();
    const animation = new TankAnimation(engine.activeTank, true);
    engine.setAim(80, 0.8);
    animation.update(engine.activeTank, 0.01);
    expect(animation.angle).toBe(80);
    engine.fire();
    animation.handleEvents(engine.activeTank, engine.drainEvents());
    animation.update(engine.activeTank, 0.03);
    expect(animation.recoil).toBe(0);
    animation.handleEvents({ ...engine.activeTank, health: 0 }, []);
    expect(animation.destroyed).toBe(true);
  });
});
