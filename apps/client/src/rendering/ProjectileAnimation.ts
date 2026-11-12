import {
  SIMULATION_STEP_SECONDS,
  type ProjectileMotionSample,
  type ProjectileState,
} from '@artillery/simulation';

export interface RenderedProjectile {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly targetAge: number;
  readonly direction: number;
}

// One fixed tick of interpolation, never extrapolation or an invented Bezier path.
// Substep observations preserve curves/bounces even when a render frame spans several ticks.
// Stuck/drilling modes snap to their authoritative attachment/depth; removed heads disappear
// on the impact frame instead of flying on toward an obsolete target.
export class ProjectileAnimation {
  private readonly history = new Map<number, ProjectileMotionSample[]>();
  public rendered: RenderedProjectile[] = [];
  /** Same data as `rendered`, keyed by projectile id for O(1) per-frame lookups. */
  public renderedById = new Map<number, RenderedProjectile>();

  public ingest(samples: readonly ProjectileMotionSample[]): void {
    for (const sample of samples) {
      let points = this.history.get(sample.id);
      if (points === undefined) {
        points = [];
        this.history.set(sample.id, points);
      }
      const previous = points[points.length - 1];
      if (previous?.ageSeconds === sample.ageSeconds) points[points.length - 1] = sample;
      else points.push(sample);
      if (points.length > 160) points.splice(0, points.length - 160);
    }
  }

  public update(projectiles: readonly ProjectileState[], alpha: number): void {
    const live = new Set(projectiles.map((p) => p.id));
    for (const id of this.history.keys()) if (!live.has(id)) this.history.delete(id);
    this.renderedById.clear();
    this.rendered = projectiles.map((p) => {
      const direction = Math.atan2(p.velocityY, p.velocityX);
      const targetAge = Math.max(
        0,
        p.ageSeconds - SIMULATION_STEP_SECONDS * (1 - Math.max(0, Math.min(1, alpha))),
      );
      if (p.mode !== 'flying')
        return { id: p.id, x: p.x, y: p.y, targetAge: p.ageSeconds, direction };
      const points = this.history.get(p.id);
      if (points === undefined || points.length < 2)
        return { id: p.id, x: p.x, y: p.y, targetAge: p.ageSeconds, direction };
      let a = points[0]!;
      for (let i = 1; i < points.length; i++) {
        const b = points[i]!;
        if (b.ageSeconds >= targetAge) {
          const t = Math.max(
            0,
            Math.min(1, (targetAge - a.ageSeconds) / Math.max(1e-9, b.ageSeconds - a.ageSeconds)),
          );
          return {
            id: p.id,
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            targetAge,
            direction:
              Math.hypot(b.x - a.x, b.y - a.y) > 1e-9
                ? Math.atan2(b.y - a.y, b.x - a.x)
                : direction,
          };
        }
        a = b;
      }
      return { id: p.id, x: p.x, y: p.y, targetAge: p.ageSeconds, direction };
    });
    for (const entry of this.rendered) this.renderedById.set(entry.id, entry);
  }
}
