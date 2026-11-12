import type Phaser from 'phaser';
import type { TrailDefinition, WeaponDefinition, WeaponId } from '@artillery/content';
import {
  localToWorld,
  sampleMutableSurfaceY,
  type CombatEvent,
  type ExplosionState,
  type MutableTerrainState,
  type PlayerId,
  type ProjectileMotionSample,
  type ProjectileState,
  type TankState,
} from '@artillery/simulation';
import { ProjectileAnimation } from './ProjectileAnimation';
import { COLOR, WORLD_COLOR, lighten, darken } from '../ui/theme';
import { hash } from './LandscapeRenderer';

// All FX are original procedural art, driven by authoritative events. Analytic particles are
// presentation-only: no terrain, health, projectile or rule state is modified. Pools are capped
// and expire even after the match ends. No asynchronous emitters survive a scene shutdown.
interface TrailPoint {
  x: number;
  y: number;
  age: number;
  physicsAge: number;
}
interface Trail {
  readonly definition: TrailDefinition;
  readonly points: TrailPoint[];
  alive: boolean;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  radius: number;
  color: number;
  kind: 'smoke' | 'rock' | 'spark' | 'dust' | 'scrap';
  spin: number;
}
interface Flash {
  x: number;
  y: number;
  age: number;
  color: number;
}
interface ImpactRing {
  x: number;
  y: number;
  age: number;
  radius: number;
  color: number;
  ground: boolean;
}
const MAX_TRAIL_POINTS = 512;
const MAX_PARTICLES = 320;

export class CombatView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly trails = new Map<number, Trail>();
  private readonly particles: Particle[] = [];
  private readonly flashes: Flash[] = [];
  private readonly rings: ImpactRing[] = [];
  private readonly energy: {
    x: number;
    y: number;
    tx: number;
    ty: number;
    age: number;
    color: number;
  }[] = [];
  private readonly previousTanks = new Map<PlayerId, { x: number; y: number; dust: number }>();
  private readonly destroyed = new Set<PlayerId>();
  public readonly motion = new ProjectileAnimation();
  private readonly effectCounts: Record<string, number> = {};
  private movementSequence = 0;

  public constructor(
    scene: Phaser.Scene,
    private readonly weaponOf: (id: WeaponId) => WeaponDefinition,
    private readonly reducedMotion = false,
  ) {
    this.graphics = scene.add.graphics().setDepth(35);
  }

  public handleEvents(
    events: readonly CombatEvent[],
    tanks: readonly TankState[],
    terrain: MutableTerrainState,
  ): void {
    for (const event of events) {
      if (event.type === 'explosion') {
        const weapon = this.weaponOf(event.weaponId);
        const color = weapon.accent;
        // Energy arcs for every weapon that actually defines a beam strike (plus the web
        // burst). Driven by the catalog data, so new beam weapons get the visual for free.
        if (weapon.explosion.beam !== undefined || weapon.name === 'Spider') {
          for (const tank of tanks) {
            if (
              Math.hypot(tank.x - event.x, tank.groundY - 24 - event.y) <
              Math.max(event.blastRadius, weapon.explosion.beam?.reach ?? 80) + 60
            ) {
              this.energy.push({
                x: event.x,
                y: event.y,
                tx: tank.x,
                ty: tank.groundY - 25,
                age: 0,
                color,
              });
              if (this.energy.length > 48) this.energy.shift();
            }
          }
        }
        const count = this.reducedMotion ? 4 : Math.min(30, 12 + Math.round(event.blastRadius / 5));
        for (let i = 0; i < count; i++) {
          const seed = event.explosionId * 71 + i;
          const angle = -Math.PI * (0.05 + hash(seed) * 0.9);
          const speed =
            (60 + hash(seed + 22) * Math.min(230, event.blastRadius * 3)) *
            (this.reducedMotion ? 0.15 : 1);
          this.particles.push({
            x: event.x,
            y: event.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            age: 0,
            life: 0.7 + hash(seed + 34) * 0.8,
            radius: 1 + hash(seed + 3) * 2,
            color,
            kind: 'spark',
            spin: hash(seed + 7) * 12,
          });
        }
        for (let i = 0; i < (this.reducedMotion ? 2 : 9); i++) {
          const seed = event.explosionId * 9 + i;
          this.particles.push({
            x: event.x + (hash(seed) - 0.5) * event.blastRadius * 0.6,
            y: event.y - 8,
            vx: (hash(seed + 2) - 0.5) * 45,
            vy: -18 - hash(seed + 3) * 40,
            age: 0,
            life: 1.1 + hash(seed + 6) * 0.7,
            radius: 11 + hash(seed + 4) * 13,
            color: i % 2 === 0 ? 0x5f455c : 0x9c6b70,
            kind: 'smoke',
            spin: 0,
          });
        }
        this.count('explosion');
        this.rings.push({
          x: event.x,
          y: event.y,
          age: 0,
          radius: event.blastRadius,
          color,
          ground: false,
        });
      } else if (event.type === 'terrain-deformed') {
        // Emit along the NEW, actual crater edge. Collision/render terrain changes immediately;
        // only dust and debris linger. Airbursts with no removed terrain cannot throw dirt.
        const span = event.maxX - event.minX;
        for (let i = 0; i < 14; i++) {
          const x = event.minX + (span * i) / 13;
          const y = sampleMutableSurfaceY(terrain, x);
          this.burst(x, y, event.explosionId * 37 + i, WORLD_COLOR.topsoil, 2, 'rock', 115);
          this.burst(x, y, event.explosionId * 53 + i, 0xb99578, 1, 'dust', 36);
        }
        const x = (event.minX + event.maxX) / 2;
        this.rings.push({
          x,
          y: sampleMutableSurfaceY(terrain, x),
          age: 0,
          radius: Math.max(12, span / 2),
          color: WORLD_COLOR.exposedRim,
          ground: true,
        });
        this.count('terrain-impact');
      } else if (event.type === 'tank-damaged') {
        const tank = tanks.find((tank) => tank.playerId === event.tankId);
        if (tank !== undefined) {
          this.burst(
            tank.x,
            tank.groundY - 38,
            event.explosionId * 89,
            COLOR.gold,
            7,
            'spark',
            130,
          );
          this.count('tank-hit');
        }
      } else if (event.type === 'shot-fired') {
        this.flashes.push({
          x: event.x,
          y: event.y,
          age: 0,
          color: this.weaponOf(event.weaponId).accent,
        });
        this.burst(event.x, event.y, event.shotId * 113, 0xd2c3cf, 5, 'smoke', 24);
        this.count('muzzle-flash');
      } else if (event.type === 'projectile-bounced') {
        this.flashes.push({ x: event.x, y: event.y, age: 0, color: 0xb2f7ef });
        this.burst(
          event.x,
          event.y,
          event.projectileId * 23,
          WORLD_COLOR.exposedRim,
          6,
          'dust',
          60,
        );
        this.count('bounce');
      } else if (event.type === 'projectile-stuck') {
        this.burst(event.x, event.y, event.projectileId, 0xffd166, 6, 'spark', 70);
        this.count('sticky-contact');
      } else if (event.type === 'projectile-spawned' || event.type === 'projectile-drilling') {
        this.flashes.push({ x: event.x, y: event.y, age: 0, color: COLOR.gold });
        this.count(event.type === 'projectile-spawned' ? 'split' : 'drill-contact');
      } else if (event.type === 'tank-destroyed' && !this.destroyed.has(event.tankId)) {
        this.destroyed.add(event.tankId);
        this.count('tank-destruction');
        const y = event.y - 40;
        this.burst(event.x, y, event.tankId === 'player1' ? 777 : 999, 0x6c6484, 20, 'scrap', 160);
        this.burst(event.x, y, 261, 0xffb53f, 20, 'spark', 190);
        this.burst(event.x, y, 625, 0x4b405c, 16, 'smoke', 42);
        this.rings.push({ x: event.x, y, age: 0, radius: 90, color: COLOR.gold, ground: false });
      }
    }
    this.limitEffects();
  }

  private limitEffects(): void {
    if (this.particles.length > MAX_PARTICLES)
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    if (this.flashes.length > 32) this.flashes.splice(0, this.flashes.length - 32);
    if (this.rings.length > 32) this.rings.splice(0, this.rings.length - 32);
  }

  public update(
    dt: number,
    projectiles: readonly ProjectileState[],
    explosions: readonly ExplosionState[],
    samples: readonly ProjectileMotionSample[],
    alpha: number,
    tanks: readonly TankState[],
  ): void {
    this.motion.ingest(samples);
    this.motion.update(projectiles, alpha);
    this.observeMovement(tanks);
    this.advanceTrails(dt, projectiles, samples);
    this.graphics.clear();
    this.drawParticles(dt);
    for (const [id, trail] of this.trails) {
      const rendered = this.motion.renderedById.get(id);
      this.drawTrail(trail, rendered?.targetAge ?? Infinity);
      if (rendered !== undefined) {
        let tail: TrailPoint | undefined;
        for (let i = trail.points.length - 1; i >= 0; i--) {
          const point = trail.points[i]!;
          if (point.physicsAge <= rendered.targetAge) {
            tail = point;
            break;
          }
        }
        if (tail !== undefined) {
          this.graphics.lineStyle(trail.definition.width, trail.definition.color, 0.85);
          this.graphics.lineBetween(tail.x, tail.y, rendered.x, rendered.y);
        }
      }
    }
    for (const explosion of explosions) this.drawExplosion(explosion);
    for (let i = this.energy.length - 1; i >= 0; i--) {
      const beam = this.energy[i]!;
      beam.age += dt;
      if (beam.age > 0.28) {
        this.energy.splice(i, 1);
        continue;
      }
      const alpha = (1 - beam.age / 0.28) * (this.reducedMotion ? 0.35 : 0.8);
      // Jagged electric arc: deterministic per-beam jitter perpendicular to the strike line.
      // Pure presentation — damage was already applied by the authoritative beam event.
      const dx = beam.tx - beam.x;
      const dy = beam.ty - beam.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / length;
      const ny = dx / length;
      const segments = this.reducedMotion ? 2 : Math.min(7, 2 + Math.round(length / 60));
      const jag = this.reducedMotion ? 0 : Math.min(14, length * 0.06);
      const seedBase = Math.round(beam.x * 13 + beam.ty * 7);
      const phase = Math.floor(beam.age * 30); // re-jitters a few times while visible
      const pointAt = (i: number): { x: number; y: number } => {
        const t = i / segments;
        const wobble =
          i === 0 || i === segments ? 0 : (hash(seedBase + i * 17 + phase * 29) - 0.5) * 2 * jag;
        return { x: beam.x + dx * t + nx * wobble, y: beam.y + dy * t + ny * wobble };
      };
      for (const [width, color, a] of [
        [6, beam.color, alpha * 0.25],
        [2, 0xe9ffff, alpha],
      ] as const) {
        this.graphics.lineStyle(width, color, a);
        this.graphics.beginPath();
        const start = pointAt(0);
        this.graphics.moveTo(start.x, start.y);
        for (let i = 1; i <= segments; i++) {
          const point = pointAt(i);
          this.graphics.lineTo(point.x, point.y);
        }
        this.graphics.strokePath();
      }
    }
    for (const projectile of projectiles) {
      if ((projectile.launchDelay ?? 0) > 0) continue;
      const rendered = this.motion.renderedById.get(projectile.id);
      // Draw a copy. Never feed interpolated coordinates back into simulation or collision.
      this.drawProjectile(
        rendered === undefined ? projectile : { ...projectile, x: rendered.x, y: rendered.y },
        rendered?.direction,
      );
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]!;
      ring.age += dt;
      if (ring.age >= 0.55) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = ring.age / 0.55;
      this.graphics.lineStyle(2, ring.color, (1 - t) * (this.reducedMotion ? 0.25 : 0.65));
      const r = ring.radius * (this.reducedMotion ? 0.6 : 0.2 + t);
      this.graphics.strokeEllipse(ring.x, ring.y, r * 2, ring.ground ? r * 0.35 : r * 2);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const flash = this.flashes[i];
      if (flash === undefined) continue;
      flash.age += dt;
      if (flash.age > 0.23) {
        this.flashes.splice(i, 1);
        continue;
      }
      const t = flash.age / 0.23;
      this.graphics.fillStyle(flash.color, 0.3 * (1 - t));
      this.graphics.fillCircle(flash.x, flash.y, 20 * (this.reducedMotion ? 1 : 1 + t));
      this.graphics.lineStyle(2, 0xfff6db, 1 - t);
      this.graphics.strokeCircle(flash.x, flash.y, 8 + t * 22);
      this.star(flash.x, flash.y, 18 * (1 - t), 8, 0xffefbb, 1 - t, 0);
    }
  }

  public get activeTrailCount(): number {
    return this.trails.size;
  }
  public get activeParticleCount(): number {
    return this.particles.length + this.flashes.length + this.rings.length + this.energy.length;
  }
  public get animationCounts(): Readonly<Record<string, number>> {
    return this.effectCounts;
  }

  private count(name: string): void {
    this.effectCounts[name] = (this.effectCounts[name] ?? 0) + 1;
  }

  private burst(
    x: number,
    y: number,
    seed: number,
    color: number,
    count: number,
    kind: Particle['kind'],
    speed: number,
  ): void {
    const total = this.reducedMotion ? Math.min(3, count) : count;
    for (let i = 0; i < total; i++) {
      const n = seed + i * 31;
      const angle = -Math.PI * (0.08 + hash(n) * 0.84);
      const v = (0.3 + hash(n + 3) * 0.7) * speed * (this.reducedMotion ? 0.2 : 1);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        age: 0,
        life: kind === 'scrap' ? 1.5 : 0.5 + hash(n + 6) * 0.8,
        radius: kind === 'smoke' || kind === 'dust' ? 5 + hash(n + 9) * 9 : 2 + hash(n + 9) * 4,
        color,
        kind,
        spin: hash(n + 12) * 10,
      });
    }
  }

  private observeMovement(tanks: readonly TankState[]): void {
    for (const tank of tanks) {
      const previous = this.previousTanks.get(tank.playerId);
      let dust = previous?.dust ?? 0;
      if (previous !== undefined && tank.health > 0) {
        const dx = tank.x - previous.x;
        dust += Math.abs(dx);
        if (dust >= 7) {
          const contact = localToWorld(tank, dx > 0 ? -43 : 43, -2);
          this.burst(
            contact.x,
            contact.y,
            ++this.movementSequence,
            WORLD_COLOR.exposedRim,
            3,
            'dust',
            22,
          );
          this.count('movement-dust');
          dust %= 7;
        }
        if (tank.groundY - previous.y > 8) {
          this.burst(
            tank.x,
            tank.groundY,
            ++this.movementSequence,
            WORLD_COLOR.exposedRim,
            10,
            'dust',
            70,
          );
          this.count('landing');
        }
      }
      this.previousTanks.set(tank.playerId, { x: tank.x, y: tank.groundY, dust });
    }
    this.limitEffects();
  }

  private advanceTrails(
    dt: number,
    projectiles: readonly ProjectileState[],
    samples: readonly ProjectileMotionSample[],
  ): void {
    for (const trail of this.trails.values()) {
      trail.alive = false;
      for (const point of trail.points) point.age += dt;
    }
    for (const p of samples) {
      const definition = this.weaponOf(p.weaponId).trail;
      if (definition.style === 'none') continue;
      let trail = this.trails.get(p.id);
      if (trail === undefined) {
        trail = { definition, points: [], alive: true };
        this.trails.set(p.id, trail);
      }
      trail.alive = true;
      if (p.mode === 'flying') {
        const last = trail.points[trail.points.length - 1];
        if (last?.x === p.x && last.y === p.y) continue;
        // Collision now samples every terrain column for faster long-range rounds. Keep
        // the head's full history, but don't redraw a smoke circle per invisible subpixel:
        // trail knots are still exact observed points, spaced by at most ~4 screen pixels.
        if (
          last !== undefined &&
          Math.hypot(p.x - last.x, p.y - last.y) < 6 &&
          p.ageSeconds - last.physicsAge < 1 / 30
        )
          continue;
        trail.points.push({ x: p.x, y: p.y, age: 0, physicsAge: p.ageSeconds });
        if (trail.points.length > MAX_TRAIL_POINTS) trail.points.shift();
      }
    }
    for (const p of projectiles) {
      const trail = this.trails.get(p.id);
      if (trail !== undefined) trail.alive = true;
    }
    for (const [id, trail] of this.trails) {
      while (
        trail.points.length > 0 &&
        (trail.points[0]?.age ?? 0) > trail.definition.lifetimeSeconds
      )
        trail.points.shift();
      if (!trail.alive && trail.points.length === 0) this.trails.delete(id);
    }
  }

  private drawTrail(trail: Trail, targetAge: number): void {
    const { definition: d, points } = trail;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (a === undefined || b === undefined) continue;
      if (b.physicsAge > targetAge) continue;
      const fade = Math.max(0, 1 - b.age / d.lifetimeSeconds);
      if (d.style === 'dashed' && i % 4 >= 2) continue;
      if (d.style === 'smoke') {
        const r = d.width * (0.6 + b.age * 2.5);
        this.graphics.fillStyle(COLOR.ink, 0.15 * fade);
        this.graphics.fillCircle(b.x, b.y, r + 1);
        this.graphics.fillStyle(lighten(d.color, 0.25), 0.4 * fade);
        this.graphics.fillCircle(b.x, b.y, r);
      } else {
        this.graphics.lineStyle(d.width * 3, d.color, 0.13 * fade);
        this.graphics.lineBetween(a.x, a.y, b.x, b.y);
        this.graphics.lineStyle(d.width, d.color, 0.85 * fade);
        this.graphics.lineBetween(a.x, a.y, b.x, b.y);
        this.graphics.lineStyle(1, 0xffffff, 0.65 * fade);
        this.graphics.lineBetween(a.x, a.y, b.x, b.y);
        if (d.style === 'spark' && i % 5 === 0)
          this.star(b.x + Math.sin(i) * 6, b.y + Math.cos(i) * 6, 3, 4, d.color, fade, i);
      }
    }
  }

  private drawProjectile(p: ProjectileState, direction?: number): void {
    const w = this.weaponOf(p.weaponId),
      g = this.graphics;
    // Bright rim + dark keyline distinguish the warhead against both sky and terrain. Visual
    // halo is not a hitbox; the coloured core retains the exact simulation radius.
    const r = p.radius;
    g.fillStyle(w.accent, 0.18);
    g.fillCircle(p.x, p.y, r + 7);
    g.fillStyle(0xfff4d6, 0.9);
    g.fillCircle(p.x, p.y, r + 2.5);
    g.fillStyle(COLOR.ink);
    g.fillCircle(p.x, p.y, r + 1);
    const dir = direction ?? Math.atan2(p.velocityY, p.velocityX);
    if (w.icon === 'dart' || w.icon === 'rail' || w.icon === 'drill') {
      const ux = Math.cos(dir),
        uy = Math.sin(dir);
      g.fillStyle(w.accent);
      g.fillTriangle(
        p.x + ux * (r + 5),
        p.y + uy * (r + 5),
        p.x - ux * r - uy * r,
        p.y - uy * r + ux * r,
        p.x - ux * r + uy * r,
        p.y - uy * r - ux * r,
      );
      g.lineStyle(1.5, 0xffffff);
      g.lineBetween(p.x, p.y, p.x + ux * r, p.y + uy * r);
    } else if (w.icon === 'fork' || w.icon === 'cluster') {
      this.star(p.x, p.y, r, w.icon === 'fork' ? 5 : 6, w.accent, 1, p.ageSeconds * 3);
    } else {
      g.fillStyle(w.accent);
      g.fillCircle(p.x, p.y, r);
      g.fillStyle(darken(w.accent, 0.35));
      g.fillEllipse(p.x + r * 0.25, p.y + r * 0.3, r, r * 0.7);
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(p.x - r * 0.3, p.y - r * 0.3, Math.max(1.2, r * 0.3));
    }
    if (p.mode === 'stuck' && p.fuseRemaining !== undefined) {
      const fraction = Math.max(0, (p.fuseRemaining ?? 0) / (w.projectile.fuseSeconds ?? 1));
      g.lineStyle(3, COLOR.ink);
      g.strokeCircle(p.x, p.y, r + 10);
      g.lineStyle(2, COLOR.bad);
      g.beginPath();
      g.arc(p.x, p.y, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
      g.strokePath();
      g.fillStyle(0xffffff, 0.5 + Math.sin(p.ageSeconds * 25) * 0.5);
      g.fillCircle(p.x, p.y, 2);
    } else if (p.mode === 'drilling') {
      g.lineStyle(2, w.accent);
      g.strokeCircle(p.x, p.y, r + 9);
      this.star(p.x, p.y, r + 7, 4, w.accent, 0.5, p.ageSeconds * 18);
    }
  }

  private drawExplosion(e: ExplosionState): void {
    const t = Math.min(1, e.ageSeconds / e.durationSeconds),
      fade = 1 - t;
    const radius = e.blastRadius * (this.reducedMotion ? 0.6 : Math.min(1, 0.2 + t * 5));
    const g = this.graphics;
    g.fillStyle(0xff973e, 0.16 * fade);
    g.fillCircle(e.x, e.y, radius * 1.35);
    g.lineStyle(3 * fade + 1, 0xffedb5, 0.85 * fade);
    g.strokeCircle(e.x, e.y, e.blastRadius * (0.3 + t * 1.1));
    // A scalloped billowing fireball with an ink silhouette, orange body and lemon centre.
    for (let layer = 0; layer < 3; layer++) {
      const size = radius * (1 - layer * 0.24) * (1 - t * 0.48);
      const color = [0xd84c32, 0xff932b, 0xffe783][layer] ?? 0xffe783;
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const x = e.x + Math.cos(angle) * size * 0.48;
        const y = e.y + Math.sin(angle) * size * 0.42 - t * 28;
        if (layer === 0) {
          g.fillStyle(COLOR.ink, 0.35 * fade);
          g.fillCircle(x, y, size * 0.5 + 2);
        }
        g.fillStyle(color, Math.min(1, fade * 1.7));
        g.fillCircle(x, y, size * 0.5);
      }
    }
    this.star(e.x, e.y - t * 18, radius * 0.33 * fade, 8, 0xfffce9, fade, 0.1);
  }

  private drawParticles(dt: number): void {
    const g = this.graphics;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p === undefined) continue;
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.age / p.life,
        fade = 1 - t;
      const x = p.x + p.vx * p.age;
      const y =
        p.y +
        p.vy * p.age +
        (p.kind === 'smoke' || p.kind === 'dust' || this.reducedMotion ? 0 : 130 * p.age * p.age);
      if (p.kind === 'smoke' || p.kind === 'dust') {
        g.fillStyle(p.color, 0.43 * fade);
        g.fillCircle(x, y, p.radius * (0.5 + t));
        g.fillStyle(lighten(p.color, 0.3), 0.12 * fade);
        g.fillCircle(x - 3, y - 4, p.radius * (0.4 + t * 0.5));
      } else if (p.kind === 'rock' || p.kind === 'scrap') {
        const a = p.spin * p.age,
          r = p.radius;
        const pts = Array.from({ length: 5 }, (_, n) => ({
          x: x + Math.cos(a + n * 1.256) * r,
          y: y + Math.sin(a + n * 1.256) * r * 0.7,
        }));
        g.fillStyle(COLOR.ink, fade);
        g.fillPoints(pts, true);
        g.fillStyle(p.color, fade);
        g.fillCircle(x, y, r * 0.65);
      } else {
        g.lineStyle(2, p.color, fade);
        g.lineBetween(x - p.vx * 0.04, y - (p.vy + 260 * p.age) * 0.04, x, y);
        g.fillStyle(0xfff6d7, fade);
        g.fillCircle(x, y, p.radius);
      }
    }
  }

  private star(
    x: number,
    y: number,
    r: number,
    tips: number,
    color: number,
    alpha: number,
    spin: number,
  ): void {
    const points = Array.from({ length: tips * 2 }, (_, i) => {
      const a = spin + (i * Math.PI) / tips,
        rad = i % 2 === 0 ? r : r * 0.42;
      return { x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad };
    });
    this.graphics.fillStyle(color, alpha);
    this.graphics.fillPoints(points, true);
  }
}
