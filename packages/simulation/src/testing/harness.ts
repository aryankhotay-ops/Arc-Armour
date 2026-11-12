// Test-only helpers for driving the engine deterministically. Not exported from the package.
import { WEAPON_CATALOG, getWeapon, type WeaponDefinition } from '@artillery/content';

import { WORLD_BOUNDS } from '../config/SimulationConfig';
import type { CombatEvent } from '../events/CombatEvent';
import { GameEngine, type GameEngineOptions } from '../match/GameEngine';
import type { PlayerId } from '../tanks/TankPlacement';

export const TICK = 1 / 60;
export const FLAT_Y = 520;

export const flatSurface = (y = FLAT_Y): number[] =>
  Array.from({ length: WORLD_BOUNDS.width + 1 }, () => y);

/** Smooth cosine bump (negative height = depression) added to a surface. */
export const withBump = (
  surface: readonly number[],
  centreX: number,
  halfWidth: number,
  height: number,
): number[] =>
  surface.map((y, x) => {
    const distance = Math.abs(x - centreX) / halfWidth;
    return distance >= 1 ? y : y - height * (0.5 + 0.5 * Math.cos(Math.PI * distance));
  });

/** Flat-floored pit: `depth` below the surrounding plain with cosine walls `wall` wide. */
export const withPit = (
  surface: readonly number[],
  centreX: number,
  floorHalfWidth: number,
  wall: number,
  depth: number,
): number[] =>
  surface.map((y, x) => {
    const distance = Math.abs(x - centreX);
    if (distance <= floorHalfWidth) return y + depth;
    if (distance >= floorHalfWidth + wall) return y;
    return y + depth * (0.5 + 0.5 * Math.cos((Math.PI * (distance - floorHalfWidth)) / wall));
  });

/** Clones a catalog weapon with nested overrides; handy for isolating one behaviour. */
export const variant = (
  baseId: string,
  overrides: {
    readonly id?: string;
    readonly ammo?: WeaponDefinition['ammo'];
    readonly damageCapPerShot?: number;
    readonly launch?: Partial<WeaponDefinition['launch']>;
    readonly projectile?: Partial<WeaponDefinition['projectile']>;
    readonly explosion?: Partial<WeaponDefinition['explosion']>;
  },
): WeaponDefinition => {
  const base = getWeapon(baseId);
  return {
    ...base,
    id: overrides.id ?? base.id,
    ammo: overrides.ammo ?? base.ammo,
    damageCapPerShot: overrides.damageCapPerShot ?? base.damageCapPerShot,
    launch: { ...base.launch, ...overrides.launch },
    projectile: { ...base.projectile, ...overrides.projectile },
    explosion: { ...base.explosion, ...overrides.explosion },
  };
};

/** The shipped arsenal with one weapon replaced (same id keeps catalog order). */
export const arsenalWith = (...replacements: WeaponDefinition[]): WeaponDefinition[] => {
  const byId = new Map(replacements.map((weapon) => [weapon.id, weapon]));
  const merged = WEAPON_CATALOG.map((weapon) => byId.get(weapon.id) ?? weapon);
  for (const weapon of replacements) {
    if (!WEAPON_CATALOG.some((existing) => existing.id === weapon.id)) merged.push(weapon);
  }
  return merged;
};

export interface ShotResult {
  readonly engine: GameEngine;
  readonly events: CombatEvent[];
  readonly ticks: number;
  readonly damageTo: (tankId: PlayerId) => number;
  readonly count: (type: CombatEvent['type']) => number;
}

export const collect = (engine: GameEngine, events: CombatEvent[]): ShotResult => ({
  engine,
  events,
  ticks: 0,
  damageTo: (tankId) =>
    events.reduce(
      (sum, event) =>
        event.type === 'tank-damaged' && event.tankId === tankId ? sum + event.amount : sum,
      0,
    ),
  count: (type) => events.filter((event) => event.type === type).length,
});

/** Advances until the shot resolves (turn passes or match ends) or the tick budget runs out. */
export const runUntilResolved = (engine: GameEngine, maxTicks = 3_000): ShotResult => {
  const events = engine.drainEvents();
  const startTurn = engine.state.turnNumber;
  let ticks = 0;
  while (
    ticks < maxTicks &&
    engine.state.turnNumber === startTurn &&
    engine.state.phase !== 'game-over'
  ) {
    engine.update(TICK);
    events.push(...engine.drainEvents());
    ticks += 1;
  }
  return { ...collect(engine, events), ticks };
};

export interface ShotSpec {
  readonly weaponId: string;
  readonly angle: number;
  readonly power: number;
  readonly engine?: GameEngineOptions;
}

export const fireShot = (spec: ShotSpec): ShotResult => {
  const engine = new GameEngine({ wind: 0, ...spec.engine });
  if (!engine.selectWeapon(spec.weaponId)) throw new Error(`Cannot select ${spec.weaponId}`);
  engine.setAim(spec.angle, spec.power);
  if (!engine.fire()) throw new Error(`Cannot fire ${spec.weaponId}`);
  return runUntilResolved(engine);
};

/** Net damage (to the opponent minus to self) for one shot; used by balance sweeps. */
export const netShotDamage = (spec: ShotSpec): number => {
  const result = fireShot(spec);
  return result.damageTo('player2') - result.damageTo('player1');
};

// Cover the full legal aim/power envelope, including shallow, low-power close-range shots
// after long-range launch speeds were retuned for the wider map.
export const SWEEP_ANGLES = Array.from({ length: 33 }, (_, index) => 5 + index * 2.5);
export const SWEEP_POWERS = Array.from({ length: 17 }, (_, index) => 0.2 + index * 0.05);

/**
 * Finds the aim that maximises the predicate's score by brute force over the angle × power
 * grid. Used so behaviour tests exercise real flights instead of hand-placed projectiles.
 */
export const findAim = (
  weaponId: string,
  engine: GameEngineOptions,
  score: (result: ShotResult) => number,
): { angle: number; power: number; result: ShotResult; score: number } => {
  let best: { angle: number; power: number; result: ShotResult; score: number } | undefined;
  for (const angle of SWEEP_ANGLES) {
    for (const power of SWEEP_POWERS) {
      const result = fireShot({ weaponId, angle, power, engine });
      const value = score(result);
      if (best === undefined || value > best.score) best = { angle, power, result, score: value };
    }
  }
  if (best === undefined) throw new Error('empty aim sweep');
  return best;
};
