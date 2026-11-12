import { describe, expect, it } from 'vitest';
import { GameEngine, SIMULATION_STEP_SECONDS as STEP } from '@artillery/simulation';
import { ProjectileAnimation } from './ProjectileAnimation';

const frame = (): { engine: GameEngine; animation: ProjectileAnimation } => {
  const engine = new GameEngine({ captureProjectileMotion: true });
  const animation = new ProjectileAnimation();
  engine.fire();
  animation.ingest(engine.drainProjectileMotion());
  return { engine, animation };
};

describe('physics-locked projectile rendering', () => {
  it.each([30, 60, 144])(
    'interpolates only between actual sampled positions at %i render Hz',
    (hz) => {
      const { engine, animation } = frame();
      const history = engine.state.projectiles.map((p) => ({
        x: p.x,
        y: p.y,
        ageSeconds: p.ageSeconds,
      }));
      for (let n = 0; n < hz; n++) {
        engine.update(1 / hz);
        const samples = engine.drainProjectileMotion();
        history.push(...samples);
        animation.ingest(samples);
        const before = JSON.stringify(engine.state);
        animation.update(engine.state.projectiles, engine.interpolationAlpha);
        expect(JSON.stringify(engine.state)).toBe(before);
        const p = engine.state.projectiles[0]!;
        const rendered = animation.rendered[0]!;
        const age = Math.max(0, p.ageSeconds - STEP * (1 - engine.interpolationAlpha));
        let a = history[0]!;
        let expected = { x: p.x, y: p.y };
        for (const b of history.slice(1)) {
          if (b.ageSeconds >= age) {
            const t = Math.max(
              0,
              Math.min(1, (age - a.ageSeconds) / Math.max(1e-9, b.ageSeconds - a.ageSeconds)),
            );
            expected = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            break;
          }
          a = b;
        }
        expect(rendered.x).toBeCloseTo(expected.x, 9);
        expect(rendered.y).toBeCloseTo(expected.y, 9);
        expect(rendered.targetAge).toBeLessThanOrEqual(p.ageSeconds + 1e-9);
      }
    },
  );

  it('snaps stuck and drilling projectiles to their real attachment or depth', () => {
    const { engine, animation } = frame();
    const p = engine.state.projectiles[0]!;
    for (const mode of ['stuck', 'drilling'] as const) {
      p.mode = mode;
      p.x = 333;
      p.y = 555;
      animation.update([p], 0.25);
      expect(animation.rendered[0]).toMatchObject({ x: 333, y: 555 });
    }
  });

  it('discards a removed projectile immediately and does not extrapolate past an impact', () => {
    const { engine, animation } = frame();
    engine.update(STEP);
    animation.ingest(engine.drainProjectileMotion());
    animation.update(engine.state.projectiles, 0.5);
    expect(animation.rendered).toHaveLength(1);
    animation.update([], 0.9);
    expect(animation.rendered).toEqual([]);
  });

  it('keeps a new child at its actual split origin until real samples arrive', () => {
    const { engine, animation } = frame();
    const child = { ...engine.state.projectiles[0]!, id: 50, x: 500, y: 200, ageSeconds: 0 };
    animation.update([child], 0.5);
    expect(animation.rendered[0]).toMatchObject({ id: 50, x: 500, y: 200 });
  });
});
