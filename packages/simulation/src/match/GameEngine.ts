import {
  WEAPON_CATALOG,
  type SpawnTrigger,
  type WeaponDefinition,
  type WeaponId,
  type TankModelId,
  tankModelId,
} from '@artillery/content';

import { resolveExplosion } from '../combat/ExplosionSystem';
import { ShotLedger } from '../combat/ShotLedger';
import { COMBAT_LIMITS, SIMULATION_STEP_SECONDS, WORLD_BOUNDS } from '../config/SimulationConfig';
import { loadoutIdsFor, validateLoadouts, type Loadouts } from '../draft/Loadouts';
import type { CombatEvent, ExpiryReason } from '../events/CombatEvent';
import {
  carries,
  consumeAmmo,
  createInventory,
  cycleWeaponId,
  firstAvailableWeapon,
  hasAmmo,
} from '../inventory/WeaponInventory';
import { integrateBallistic, isInsideTerrainColumn, substepCount } from '../projectiles/Ballistics';
import { launchVolley, spawnChildren } from '../projectiles/ProjectileFactory';
import type {
  AimState,
  MatchState,
  ProjectileMotionSample,
  ProjectileState,
  TankState,
} from '../state/GameState';
import { distanceToTank, localToWorld, turretPivot, worldToLocal } from '../tanks/TankGeometry';
import { moveTankAlongTerrain, TURN_MOVEMENT_ALLOWANCE } from '../tanks/TankPhysics';
import { placeTankOnTerrain, type PlayerId } from '../tanks/TankPlacement';
import { TANK_SPAWN_X } from '../terrain/TerrainProfile';
import {
  createMutableTerrain,
  sampleMutableSurfaceY,
  type MutableTerrainState,
} from '../terrain/TerrainState';
import { assertValidArsenal } from '../weapons/validateWeapon';
import { normalizeSeed } from '../random/SeededRandom';
import { SeededRandom } from '../random/SeededRandom';
import { terrainCoating, carveCrater } from '../terrain/TerrainState';
import { placeTankOnTerrain as restingTank } from '../tanks/TankPlacement';

const MAX_FRAME_SECONDS = 0.05;
// Export the enforced limits so native aiming controls cannot drift from game rules.
export const MIN_POWER = 0.2;
export const MAX_POWER = 1;
export const MIN_ELEVATION_DEGREES = 5;
export const MAX_ELEVATION_DEGREES = 85;
const BELOW_WORLD_MARGIN = 40;

type Advance = 'alive' | 'removed';
type ContactResult = Advance | 'continue';

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const defaultWindForTurn = (turn: number): number => Math.round(Math.sin(turn * 1.73) * 24);

export interface GameEngineOptions {
  /** Model selections are fixed for the match, including contact, collision and gun geometry. */
  readonly tankModels?: readonly [TankModelId, TankModelId];
  /** Shared deterministic map seed; client chooses fresh entropy at each new-match boundary. */
  readonly terrainSeed?: number;
  /** Opt-in swept-path copies for animation; no callbacks, rule changes or RNG consumption. */
  readonly captureProjectileMotion?: boolean;
  /** Arsenal to use; defaults to the shipped catalog. Validated on construction. */
  readonly weapons?: readonly WeaponDefinition[];
  /** Constant wind for every turn. Omit for the deterministic per-turn wind cycle. */
  readonly wind?: number;
  readonly player1X?: number;
  readonly player2X?: number;
  readonly startingHealth?: number;
  /** Replaces the generated surface; must contain WORLD_BOUNDS.width + 1 samples. */
  readonly terrainSurface?: readonly number[];
  /**
   * Weapons each player carries, typically from the pre-match draft. Omit to give both
   * players the whole arsenal. Validated on construction: drafted weapons must be exclusive.
   */
  readonly loadouts?: Loadouts;
}

export class GameEngine {
  public readonly terrainSeed: number;
  public readonly terrain: MutableTerrainState;
  public readonly state: MatchState;
  public readonly weapons: readonly WeaponDefinition[];
  public readonly loadouts: Loadouts | undefined;

  private readonly weaponsById: ReadonlyMap<WeaponId, WeaponDefinition>;
  private readonly windOverride: number | undefined;
  private accumulatorSeconds = 0;
  private nextProjectileId = 1;
  private nextExplosionId = 1;
  private nextShotId = 1;
  private shot: ShotLedger | undefined;
  private spawnQueue: ProjectileState[] = [];
  private pendingEvents: CombatEvent[] = [];
  private readonly captureMotion: boolean;
  private motionSamples: ProjectileMotionSample[] = [];

  public constructor(options: GameEngineOptions = {}) {
    this.captureMotion = options.captureProjectileMotion ?? false;
    this.weapons = options.weapons ?? WEAPON_CATALOG;
    assertValidArsenal(this.weapons);
    this.weaponsById = new Map(this.weapons.map((weapon) => [weapon.id, weapon]));
    this.windOverride = options.wind;
    this.loadouts = options.loadouts;
    if (this.loadouts !== undefined) {
      const errors = validateLoadouts(this.loadouts, this.weapons);
      if (errors.length > 0) throw new Error(`Invalid loadouts:\n- ${errors.join('\n- ')}`);
    }

    this.terrainSeed = normalizeSeed(options.terrainSeed ?? 0);
    this.terrain = createMutableTerrain(this.terrainSeed);
    if (options.terrainSurface !== undefined) {
      if (options.terrainSurface.length !== this.terrain.surfaceY.length) {
        throw new Error(`terrainSurface must contain ${this.terrain.surfaceY.length} samples`);
      }
      this.terrain.surfaceY.splice(0, this.terrain.surfaceY.length, ...options.terrainSurface);
    }

    const health = options.startingHealth ?? 100;
    const createTank = (playerId: PlayerId, x: number): TankState => {
      const loadout = this.loadouts;
      const carried =
        loadout === undefined
          ? this.weapons
          : this.weapons.filter((weapon) => loadoutIdsFor(loadout, playerId).includes(weapon.id));
      const inventory = createInventory(carried);
      const selectedWeaponId = firstAvailableWeapon(inventory, this.weapons);
      if (selectedWeaponId === undefined) throw new Error(`${playerId} has no fireable weapon`);
      return {
        ...placeTankOnTerrain(
          this.terrain,
          playerId,
          x,
          tankModelId(
            options.tankModels?.[playerId === 'player1' ? 0 : 1],
            playerId === 'player1' ? 'marigold' : 'cobalt',
          ),
        ),
        health,
        movementRemaining: TURN_MOVEMENT_ALLOWANCE,
        aim: { angleDegrees: 45, power: 0.75 },
        selectedWeaponId,
        inventory,
      };
    };

    this.state = {
      phase: 'aiming',
      activePlayerId: 'player1',
      turnNumber: 1,
      wind: this.windForTurn(1),
      tanks: [
        createTank('player1', options.player1X ?? TANK_SPAWN_X.player1),
        createTank('player2', options.player2X ?? TANK_SPAWN_X.player2),
      ],
      projectiles: [],
      explosions: [],
      winnerId: undefined,
      message: 'Player 1: aim, move, choose a weapon, and fire.',
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------------------------

  public get activeTank(): TankState {
    return this.tank(this.state.activePlayerId);
  }

  public get inactiveTank(): TankState {
    return this.tank(this.state.activePlayerId === 'player1' ? 'player2' : 'player1');
  }

  /**
   * The aim the local player is steering toward. Locally this IS the active tank's aim;
   * networked mirrors override it with the latest intent still awaiting server
   * confirmation so successive single-axis edits (angle slider, then power slider)
   * compose instead of one overwriting the other with a stale value.
   */
  public get intendedAim(): AimState {
    return this.activeTank.aim;
  }

  public tank(playerId: PlayerId): TankState {
    return this.state.tanks[playerId === 'player1' ? 0 : 1];
  }

  public weapon(weaponId: WeaponId): WeaponDefinition {
    const definition = this.weaponsById.get(weaponId);
    if (definition === undefined) throw new Error(`Unknown weapon id: ${weaponId}`);
    return definition;
  }

  public get selectedWeapon(): WeaponDefinition {
    return this.weapon(this.activeTank.selectedWeaponId);
  }

  /** The weapons a player carries this match, in catalog order. */
  public carriedWeapons(playerId: PlayerId): WeaponDefinition[] {
    const inventory = this.tank(playerId).inventory;
    return this.weapons.filter((weapon) => carries(inventory, weapon.id));
  }

  public get acceptsInput(): boolean {
    return this.state.phase === 'aiming';
  }

  /** Highest elevation the given weapon allows. */
  public maxElevationFor(weaponId: WeaponId): number {
    return Math.min(
      MAX_ELEVATION_DEGREES,
      this.weapon(weaponId).launch.maxElevationDegrees ?? MAX_ELEVATION_DEGREES,
    );
  }

  /** Returns and clears the authoritative events produced since the previous drain. */
  public drainEvents(): CombatEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  /** Fraction of the next fixed tick, used only to interpolate known physics samples. */
  public get interpolationAlpha(): number {
    return this.accumulatorSeconds / SIMULATION_STEP_SECONDS;
  }

  public drainProjectileMotion(): ProjectileMotionSample[] {
    const samples = this.motionSamples;
    this.motionSamples = [];
    return samples;
  }

  private recordMotion(projectile: ProjectileState, age = projectile.ageSeconds): void {
    if (!this.captureMotion) return;
    // Bound retained observations even if a consumer stops draining them.
    if (this.motionSamples.length >= 4096) this.motionSamples.splice(0, 1024);
    this.motionSamples.push({
      id: projectile.id,
      weaponId: projectile.weaponId,
      x: projectile.x,
      y: projectile.y,
      ageSeconds: age,
      mode: projectile.mode,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Commands (all ignored outside the aiming phase)
  // ---------------------------------------------------------------------------------------------

  public setAim(angleDegrees: number, power: number): void {
    if (!this.acceptsInput) return;
    const tank = this.activeTank;
    this.replaceTank({
      ...tank,
      aim: {
        angleDegrees: clamp(
          angleDegrees,
          MIN_ELEVATION_DEGREES,
          this.maxElevationFor(tank.selectedWeaponId),
        ),
        power: clamp(power, MIN_POWER, MAX_POWER),
      },
    });
  }

  public adjustAim(angleDelta: number, powerDelta: number): void {
    const { aim } = this.activeTank;
    this.setAim(aim.angleDegrees + angleDelta, aim.power + powerDelta);
  }

  /** Pointer aiming: direction from the turret sets angle, distance sets power. */
  public aimAtPoint(worldX: number, worldY: number): void {
    if (!this.acceptsInput) return;
    const tank = this.activeTank;
    const pivot = turretPivot(tank);
    const horizontal = (worldX - pivot.x) * tank.facing;
    if (horizontal <= 5) return;
    const vertical = pivot.y - worldY;
    // Pointer chooses world direction; gun elevation is relative to the sloping chassis.
    const angle =
      (Math.atan2(vertical, horizontal) * 180) / Math.PI +
      (tank.facing * tank.hullAngle * 180) / Math.PI;
    // Physical drag distance is wider too; zooming out must not instantly peg power to 100%.
    const power = (Math.hypot(horizontal, vertical) - 40) / 735;
    this.setAim(angle, power);
  }

  public moveActiveTank(deltaX: number): void {
    if (!this.acceptsInput) return;
    this.replaceTank(
      moveTankAlongTerrain(this.activeTank, this.inactiveTank, this.terrain, deltaX),
    );
  }

  /** Selects a weapon the active player still has ammunition for. */
  public selectWeapon(weaponId: WeaponId): boolean {
    if (!this.acceptsInput || !this.weaponsById.has(weaponId)) return false;
    if (!hasAmmo(this.activeTank.inventory, weaponId)) return false;
    const tank = this.activeTank;
    this.replaceTank({
      ...tank,
      selectedWeaponId: weaponId,
      // A flat-fire weapon lowers the barrel to its own elevation limit.
      aim: {
        ...tank.aim,
        angleDegrees: Math.min(tank.aim.angleDegrees, this.maxElevationFor(weaponId)),
      },
    });
    return true;
  }

  public cycleWeapon(direction: -1 | 1): boolean {
    if (!this.acceptsInput) return false;
    const tank = this.activeTank;
    const next = cycleWeaponId(tank.inventory, this.weapons, tank.selectedWeaponId, direction);
    return next !== undefined && this.selectWeapon(next);
  }

  /** Fires the selected weapon. Consumes exactly one round, however many warheads it launches. */
  public fire(): boolean {
    if (!this.acceptsInput) return false;
    const tank = this.activeTank;
    const weapon = this.weapon(tank.selectedWeaponId);
    if (!hasAmmo(tank.inventory, weapon.id)) return false;

    const shotId = this.nextShotId;
    this.nextShotId += 1;
    this.shot = new ShotLedger(shotId, weapon.damageCapPerShot);
    const projectiles = launchVolley(shotId, tank, weapon, this.shot, () =>
      this.allocateProjectileId(),
    );
    if (weapon.projectile.utility === 'jump') {
      const p = projectiles[0]!;
      p.velocityX *= 0.25;
      p.velocityY *= 0.25;
      p.ignoredTankId = tank.playerId;
      p.tankArmSeconds = 20;
    } else if (weapon.projectile.utility === 'excavate-self') {
      const p = projectiles[0]!;
      p.x = tank.x;
      p.y = tank.groundY;
      p.velocityX = 0;
      p.velocityY = 0;
    }

    this.replaceTank({ ...tank, inventory: consumeAmmo(tank.inventory, weapon.id) });
    this.state.projectiles = projectiles;
    for (const projectile of projectiles) this.recordMotion(projectile);
    this.state.phase = 'projectile';
    this.state.message = `${weapon.name} fired!`;
    this.emit({
      type: 'shot-fired',
      shotId,
      playerId: tank.playerId,
      weaponId: weapon.id,
      projectileIds: projectiles.map((projectile) => projectile.id),
      x: projectiles[0]!.x,
      y: projectiles[0]!.y,
    });
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Fixed-step simulation
  // ---------------------------------------------------------------------------------------------

  public update(deltaSeconds: number): void {
    this.accumulatorSeconds += clamp(deltaSeconds, 0, MAX_FRAME_SECONDS);
    while (this.accumulatorSeconds >= SIMULATION_STEP_SECONDS) {
      this.step(SIMULATION_STEP_SECONDS);
      this.accumulatorSeconds -= SIMULATION_STEP_SECONDS;
    }
  }

  private step(dt: number): void {
    // Explosion records are presentation-only fades; their damage was applied when created.
    this.state.explosions = this.state.explosions.filter((explosion) => {
      explosion.ageSeconds += dt;
      return explosion.ageSeconds < explosion.durationSeconds;
    });

    // A destroyed tank ends the match immediately, whatever caused it, and cancels the shot.
    if (this.state.phase !== 'game-over' && this.state.tanks.some((tank) => tank.health <= 0)) {
      this.endMatch();
    }
    if (this.state.phase === 'game-over') {
      this.cancelShot();
      return;
    }

    if (this.state.phase === 'projectile') {
      const shot = this.shot;
      if (shot === undefined) {
        this.state.phase = 'resolving';
      } else {
        shot.elapsedSeconds += dt;
        if (shot.elapsedSeconds > COMBAT_LIMITS.maxShotSeconds) {
          this.expireAll(this.state.projectiles, 'shot-timeout');
          this.state.projectiles = [];
          this.state.phase = 'resolving';
        } else {
          this.updateProjectiles(dt);
        }
      }
    }

    if (
      this.state.phase === 'resolving' &&
      this.state.projectiles.length === 0 &&
      this.state.explosions.length === 0
    ) {
      this.finishTurn();
    }
  }

  private updateProjectiles(dt: number): void {
    const live = this.state.projectiles;
    const survivors: ProjectileState[] = [];
    this.spawnQueue = [];

    let index = 0;
    while (index < live.length && this.state.phase !== 'game-over') {
      const projectile = live[index];
      index += 1;
      if (projectile !== undefined) {
        const result = this.advance(projectile, dt);
        this.recordMotion(projectile);
        if (result === 'alive') survivors.push(projectile);
      }
    }

    // Children join the live list and start simulating on the next tick.
    const remaining = [...survivors, ...live.slice(index), ...this.spawnQueue];
    this.spawnQueue = [];

    if (this.state.phase === 'game-over') {
      this.state.projectiles = remaining;
      this.cancelShot();
      return;
    }

    this.state.projectiles = remaining;
    if (remaining.length === 0) this.state.phase = 'resolving';
  }

  private advance(projectile: ProjectileState, dt: number): Advance {
    const weapon = this.weapon(projectile.weaponId);
    if ((projectile.launchDelay ?? 0) > 0) {
      projectile.launchDelay = Math.max(0, projectile.launchDelay! - dt);
      return 'alive';
    }
    projectile.previousX = projectile.x;
    projectile.previousY = projectile.y;
    projectile.ageSeconds += dt;
    if (projectile.ageSeconds > weapon.projectile.maxLifetimeSeconds) {
      if (projectile.surfaceTravel !== undefined || projectile.tunnelTravel !== undefined)
        this.detonate(projectile, projectile.x, projectile.y, undefined);
      else this.expire(projectile, 'lifetime');
      return 'removed';
    }
    if (weapon.projectile.utility === 'excavate-self') {
      this.detonate(projectile, projectile.x, projectile.y, undefined);
      return 'removed';
    }
    if (projectile.surfaceTravel !== undefined) return this.advanceCruising(projectile, weapon, dt);
    if (projectile.tunnelTravel !== undefined && projectile.tunnelTravel >= 0)
      return this.advanceTunnel(projectile, weapon, dt);

    if (projectile.mode === 'stuck') return this.advanceStuck(projectile, dt);
    if (projectile.mode === 'drilling') return this.advanceDrilling(projectile, weapon, dt);
    if (projectile.ageSeconds > weapon.projectile.maxLifetimeSeconds) {
      this.expire(projectile, 'lifetime');
      return 'removed';
    }
    return this.advanceFlying(projectile, weapon, dt);
  }

  private advanceCruising(p: ProjectileState, w: WeaponDefinition, dt: number): Advance {
    const cruise = w.projectile.cruise!;
    p.surfaceTravel = (p.surfaceTravel ?? 0) + dt;
    const glue = terrainCoating(this.terrain, p.x) === 'glue';
    if (glue || p.surfaceTravel >= cruise.seconds) {
      this.detonate(p, p.x, p.y, undefined);
      return 'removed';
    }
    let direction = p.travelDirection ?? 1;
    if (cruise.kind === 'downhill') {
      const difference =
        sampleMutableSurfaceY(this.terrain, p.x + 4) - sampleMutableSurfaceY(this.terrain, p.x - 4);
      direction = Math.abs(difference) < 0.1 ? 0 : Math.sign(difference);
    }
    const next = Math.max(0, Math.min(this.terrain.width, p.x + direction * cruise.speed * dt));
    const steps = Math.max(1, Math.ceil(Math.abs(next - p.x)));
    const start = p.x;
    for (let i = 1; i <= steps; i++) {
      p.x = start + ((next - start) * i) / steps;
      p.y = sampleMutableSurfaceY(this.terrain, p.x) - p.radius;
      const hit = this.findStruckTank(p, p.ageSeconds);
      if (hit !== undefined) {
        this.detonate(p, p.x, p.y, hit);
        return 'removed';
      }
    }
    if (next === 0 || next === this.terrain.width) {
      this.detonate(p, p.x, p.y, undefined);
      return 'removed';
    }
    return 'alive';
  }

  private advanceTunnel(p: ProjectileState, w: WeaponDefinition, dt: number): Advance {
    const tunnel = w.projectile.tunnel!;
    const target = this.tank(p.ownerId === 'player1' ? 'player2' : 'player1');
    const direction = tunnel.home ? Math.sign(target.x - p.x) : (p.travelDirection ?? 1);
    const distance = tunnel.speed * dt;
    p.x = Math.max(0, Math.min(this.terrain.width, p.x + direction * distance));
    p.tunnelTravel = (p.tunnelTravel ?? 0) + distance;
    p.y = sampleMutableSurfaceY(this.terrain, p.x) + 18;
    // Heightfield adaptation: opens a narrow surface trench along the underground path,
    // not an enclosed B-rep tunnel; all changes participate in real terrain collisions.
    const cut = carveCrater(this.terrain, p.x, p.y, 6);
    if (cut.changed)
      this.emit({ type: 'terrain-deformed', explosionId: p.id, minX: cut.minX, maxX: cut.maxX });
    const finished =
      p.tunnelTravel >= tunnel.distance ||
      p.x <= 0 ||
      p.x >= this.terrain.width ||
      (tunnel.home && Math.abs(target.x - p.x) < 30);
    if (!finished) return 'alive';
    if (!tunnel.emerge) {
      this.detonate(p, p.x, p.y, undefined);
      return 'removed';
    }
    p.tunnelTravel = -1;
    p.mode = 'flying';
    p.y = sampleMutableSurfaceY(this.terrain, p.x) - p.radius - 2;
    p.velocityY = -260;
    p.velocityX = tunnel.home ? 0 : direction * 135;
    return 'alive';
  }

  private advanceStuck(projectile: ProjectileState, dt: number): Advance {
    projectile.fuseRemaining = (projectile.fuseRemaining ?? 0) - dt;

    if (projectile.struckTankId !== undefined) {
      // A charge on a tank rides along if that tank settles into a crater.
      const attached = localToWorld(
        this.tank(projectile.struckTankId),
        projectile.stuckLocalX,
        projectile.stuckLocalY,
      );
      projectile.x = attached.x;
      projectile.y = attached.y;
    } else {
      // A charge on the ground drops with the surface if a crater opens beneath it.
      const surfaceY = sampleMutableSurfaceY(this.terrain, projectile.x);
      projectile.y = Math.max(projectile.y, surfaceY - projectile.radius * 0.5);
    }

    if (projectile.fuseRemaining > 0) return 'alive';
    this.detonate(projectile, projectile.x, projectile.y, projectile.struckTankId);
    return 'removed';
  }

  private advanceDrilling(
    projectile: ProjectileState,
    weapon: WeaponDefinition,
    dt: number,
  ): Advance {
    const target = projectile.drillTargetY ?? projectile.y;
    const speed = weapon.projectile.drill?.speed ?? 100;
    projectile.y = Math.min(target, projectile.y + speed * dt);
    if (projectile.y < target) return 'alive';
    this.detonate(projectile, projectile.x, projectile.y, undefined);
    return 'removed';
  }

  /**
   * Swept flight: the tick is split into substeps so the projectile moves at most a few world
   * units between collision samples. Behaviour checks run in a fixed priority order per substep.
   */
  private advanceFlying(
    projectile: ProjectileState,
    weapon: WeaponDefinition,
    dt: number,
  ): Advance {
    const steps = substepCount(projectile.velocityX, projectile.velocityY, dt);
    const h = dt / steps;
    const startAge = projectile.ageSeconds - dt;
    const spawn = weapon.projectile.spawn;
    const airburst = projectile.generation === 0 ? weapon.projectile.airburst : undefined;

    for (let substep = 1; substep <= steps; substep += 1) {
      const age = startAge + h * substep;
      const velocityYBefore = projectile.velocityY;
      if (projectile.generation === 0 && weapon.projectile.guidance !== undefined) {
        const target = this.tank(projectile.ownerId === 'player1' ? 'player2' : 'player1');
        const distance = distanceToTank(target, projectile.x, projectile.y);
        if (
          weapon.projectile.guidance === 'seek' &&
          distance < (weapon.projectile.proximityRadius ?? 240)
        ) {
          const dx = target.x - projectile.x,
            dy = target.groundY - 25 - projectile.y;
          const norm = Math.hypot(dx, dy) || 1,
            speed = Math.hypot(projectile.velocityX, projectile.velocityY);
          const mix = 1 - Math.exp(-8 * h);
          projectile.velocityX += ((dx / norm) * speed - projectile.velocityX) * mix;
          projectile.velocityY += ((dy / norm) * speed - projectile.velocityY) * mix;
        } else if (
          weapon.projectile.guidance === 'drop' &&
          Math.abs(target.x - projectile.x) < 28 &&
          projectile.y < target.groundY
        ) {
          projectile.velocityX = 0;
        }
      }
      integrateBallistic(projectile, this.state.wind, h);
      if (projectile.generation === 0 && weapon.projectile.utility === 'jump') {
        const tank = this.tank(projectile.ownerId);
        this.replaceTank({
          ...tank,
          x: Math.max(90, Math.min(this.terrain.width - 90, projectile.x)),
          groundY: projectile.y + 55,
          leftContactY: projectile.y + 55,
          rightContactY: projectile.y + 55,
          hullAngle: 0,
        });
      }
      this.recordMotion(projectile, age);
      if (
        projectile.generation === 0 &&
        weapon.projectile.proximityRadius !== undefined &&
        weapon.projectile.guidance !== 'drop' &&
        age > 0.25
      ) {
        const target = this.tank(projectile.ownerId === 'player1' ? 'player2' : 'player1');
        if (
          distanceToTank(target, projectile.x, projectile.y) < weapon.projectile.proximityRadius
        ) {
          if (spawn?.trigger === 'proximity' && this.split(projectile, weapon, 'proximity'))
            return 'removed';
          if (weapon.projectile.guidance === undefined || weapon.explosion.terrainRadius === 0) {
            this.detonate(projectile, projectile.x, projectile.y, undefined);
            return 'removed';
          }
        }
      }

      // 1. Mid-air splits (generation 0 only; spawnChildren enforces single use).
      if (spawn !== undefined && !projectile.hasSpawned) {
        const timerDue = spawn.trigger === 'timer' && age >= (spawn.delaySeconds ?? Infinity);
        const apexDue =
          spawn.trigger === 'apex' && velocityYBefore < 0 && projectile.velocityY >= 0;
        if ((timerDue || apexDue) && this.split(projectile, weapon, spawn.trigger)) {
          return 'removed';
        }
      }

      // 2. Timed airburst.
      if (airburst?.afterSeconds !== undefined && age >= airburst.afterSeconds) {
        this.detonate(projectile, projectile.x, projectile.y, undefined);
        return 'removed';
      }

      // 3. Tank contact.
      const struckTankId = this.findStruckTank(projectile, age);
      if (struckTankId !== undefined) {
        const result = this.handleContact(projectile, weapon, struckTankId, projectile.y);
        if (result !== 'continue') return result;
        continue;
      }

      // 4. Proximity airburst, only while descending.
      const inColumn = isInsideTerrainColumn(this.terrain, projectile.x);
      const surfaceY = inColumn ? sampleMutableSurfaceY(this.terrain, projectile.x) : Infinity;
      if (
        airburst?.altitude !== undefined &&
        age >= airburst.armSeconds &&
        projectile.velocityY > 0 &&
        surfaceY - projectile.y <= airburst.altitude
      ) {
        this.detonate(projectile, projectile.x, projectile.y, undefined);
        return 'removed';
      }

      // 5. Terrain contact.
      if (inColumn && projectile.y + projectile.radius >= surfaceY) {
        const result = this.handleContact(projectile, weapon, 'terrain', surfaceY);
        if (result !== 'continue') return result;
        continue;
      }

      // 6. Left the battlefield.
      if (
        projectile.x < -COMBAT_LIMITS.sideMargin ||
        projectile.x > WORLD_BOUNDS.width + COMBAT_LIMITS.sideMargin ||
        projectile.y > WORLD_BOUNDS.height + BELOW_WORLD_MARGIN
      ) {
        this.expire(projectile, 'out-of-bounds');
        return 'removed';
      }
    }
    return 'alive';
  }

  private findStruckTank(projectile: ProjectileState, age: number): PlayerId | undefined {
    let closest: PlayerId | undefined;
    let closestDistance = Infinity;
    for (const tank of this.state.tanks) {
      if (tank.health <= 0) continue;
      if (projectile.ignoredTankId === tank.playerId && age < projectile.tankArmSeconds) continue;
      const distance = distanceToTank(tank, projectile.x, projectile.y);
      if (distance <= projectile.radius && distance < closestDistance) {
        closest = tank.playerId;
        closestDistance = distance;
      }
    }
    return closest;
  }

  /** Resolves first contact. Behaviours apply to launched warheads only; children just explode. */
  private handleContact(
    projectile: ProjectileState,
    weapon: WeaponDefinition,
    target: 'terrain' | PlayerId,
    contactY: number,
  ): ContactResult {
    const behaviours =
      projectile.generation === 0 || weapon.projectile.childEffects ? weapon.projectile : undefined;
    const struckTankId = target === 'terrain' ? undefined : target;
    if (struckTankId !== undefined) projectile.struckTankId = struckTankId;
    if (weapon.projectile.utility === 'jump') {
      const tank = this.tank(projectile.ownerId);
      const other = this.tank(projectile.ownerId === 'player1' ? 'player2' : 'player1');
      let x = Math.max(90, Math.min(this.terrain.width - 90, projectile.x));
      if (Math.abs(x - other.x) < 170)
        x = Math.max(
          90,
          Math.min(this.terrain.width - 90, other.x + (tank.facing === 1 ? -170 : 170)),
        );
      this.replaceTank({ ...tank, ...restingTank(this.terrain, tank.playerId, x, tank.modelId) });
      this.detonate(projectile, x, sampleMutableSurfaceY(this.terrain, x), undefined);
      return 'removed';
    }
    if (
      behaviours?.verticalHops !== undefined &&
      struckTankId === undefined &&
      (projectile.hopCount ?? 0) < behaviours.verticalHops
    ) {
      this.detonate(projectile, projectile.x, contactY, undefined);
      if (this.state.phase === 'game-over' || (this.shot?.reserveProjectiles(1) ?? 0) === 0)
        return 'removed';
      projectile.id = this.allocateProjectileId();
      projectile.hopCount = (projectile.hopCount ?? 0) + 1;
      projectile.y = sampleMutableSurfaceY(this.terrain, projectile.x) - projectile.radius - 1;
      projectile.velocityX = 0;
      projectile.velocityY = -230;
      return 'continue';
    }
    if (
      behaviours?.tunnel !== undefined &&
      struckTankId === undefined &&
      projectile.tunnelTravel === undefined
    ) {
      projectile.tunnelTravel = 0;
      projectile.mode = 'drilling';
      projectile.travelDirection = Math.sign(projectile.velocityX) || 1;
      return 'alive';
    }
    if (behaviours?.cruise !== undefined && struckTankId === undefined) {
      projectile.surfaceTravel = 0;
      projectile.mode = 'stuck';
      projectile.travelDirection =
        behaviours.cruise.kind === 'return'
          ? -Math.sign(projectile.velocityX)
          : Math.sign(projectile.velocityX);
      projectile.y = contactY - projectile.radius;
      return 'alive';
    }
    if (
      struckTankId === undefined &&
      terrainCoating(this.terrain, projectile.x) === 'rubber' &&
      (projectile.rubberBounces ?? 0) < 3
    ) {
      projectile.bouncesRemaining = Math.max(1, projectile.bouncesRemaining);
      if (this.bounce(projectile, 0.8, 5, contactY)) {
        projectile.rubberBounces = (projectile.rubberBounces ?? 0) + 1;
        return 'continue';
      }
    }

    // Sticky delayed detonation: clings to terrain or armour until its fuse expires.
    if (behaviours?.fuseSeconds !== undefined) {
      projectile.mode = 'stuck';
      projectile.fuseRemaining = behaviours.fuseSeconds;
      projectile.velocityX = 0;
      projectile.velocityY = 0;
      if (struckTankId === undefined) {
        projectile.y = contactY - projectile.radius * 0.5;
      } else {
        const local = worldToLocal(this.tank(struckTankId), projectile.x, projectile.y);
        projectile.stuckLocalX = local.x;
        projectile.stuckLocalY = local.y;
      }
      this.emit({
        type: 'projectile-stuck',
        projectileId: projectile.id,
        target,
        x: projectile.x,
        y: projectile.y,
      });
      return 'alive';
    }

    // Drilling: burrows into terrain. Armour stops a drill, so a tank hit detonates directly.
    if (behaviours?.drill !== undefined && struckTankId === undefined) {
      projectile.mode = 'drilling';
      projectile.velocityX = 0;
      projectile.velocityY = 0;
      projectile.y = contactY;
      projectile.drillTargetY = Math.min(
        WORLD_BOUNDS.height - 6,
        contactY + behaviours.drill.depth,
      );
      this.emit({
        type: 'projectile-drilling',
        projectileId: projectile.id,
        x: projectile.x,
        y: projectile.y,
      });
      return 'alive';
    }

    // Bouncing: terrain only, bounded by count, restitution < 1 and a minimum speed.
    if (
      behaviours?.bounce !== undefined &&
      terrainCoating(this.terrain, projectile.x) !== 'glue' &&
      struckTankId === undefined &&
      projectile.bouncesRemaining > 0 &&
      this.bounce(projectile, behaviours.bounce.restitution, behaviours.bounce.minSpeed, contactY)
    ) {
      return 'continue';
    }

    this.detonate(projectile, projectile.x, Math.min(projectile.y, contactY), struckTankId);
    return 'removed';
  }

  /** Reflects off the local surface normal. Returns false if too slow to keep skipping. */
  private bounce(
    projectile: ProjectileState,
    restitution: number,
    minSpeed: number,
    surfaceY: number,
  ): boolean {
    const leftY = sampleMutableSurfaceY(this.terrain, projectile.x - 3);
    const rightY = sampleMutableSurfaceY(this.terrain, projectile.x + 3);
    const length = Math.hypot(rightY - leftY, 6);
    const normalX = (rightY - leftY) / length;
    const normalY = -6 / length;
    const dot = projectile.velocityX * normalX + projectile.velocityY * normalY;
    if (dot < 0) {
      projectile.velocityX = (projectile.velocityX - 2 * dot * normalX) * restitution;
      projectile.velocityY = (projectile.velocityY - 2 * dot * normalY) * restitution;
    }
    if (Math.hypot(projectile.velocityX, projectile.velocityY) < minSpeed) return false;

    projectile.bouncesRemaining -= 1;
    projectile.y = surfaceY - projectile.radius - 0.5;
    this.emit({
      type: 'projectile-bounced',
      projectileId: projectile.id,
      x: projectile.x,
      y: projectile.y,
    });
    return true;
  }

  /** Mid-air split. Returns false if no children could be created (the parent flies on). */
  private split(
    projectile: ProjectileState,
    weapon: WeaponDefinition,
    trigger: SpawnTrigger,
  ): boolean {
    const shot = this.shot;
    if (shot === undefined) return false;
    const children = spawnChildren(
      projectile,
      weapon,
      trigger,
      { x: projectile.x, y: projectile.y },
      shot,
      () => this.allocateProjectileId(),
    );
    if (children.length === 0) return false;
    this.spawnQueue.push(...children);
    for (const child of children) this.recordMotion(child);
    this.emit({
      type: 'projectile-spawned',
      parentId: projectile.id,
      childIds: children.map((child) => child.id),
      trigger,
      x: children[0]!.x,
      y: children[0]!.y,
    });
    return true;
  }

  /** Detonates a warhead exactly once, then releases impact bomblets if the match continues. */
  private detonate(
    projectile: ProjectileState,
    x: number,
    y: number,
    directHitTankId: PlayerId | undefined,
  ): void {
    const shot = this.shot;
    if (shot === undefined || this.state.phase === 'game-over') return;
    if (!shot.claimDetonation(projectile.id)) return;

    const weapon = this.weapon(projectile.weaponId);
    if (weapon.explosion.tracer) {
      const target = this.tank(projectile.ownerId === 'player1' ? 'player2' : 'player1');
      const error = (x - target.x) * (projectile.ownerId === 'player1' ? 1 : -1);
      this.state.message = `${weapon.name}: ${Math.abs(Math.round(error))} units ${error > 0 ? 'long' : 'short'}; try ${error > 0 ? 'more' : 'less'} elevation on the next shot.`;
    }
    const explosionId = this.nextExplosionId;
    this.nextExplosionId += 1;
    const outcome = resolveExplosion(
      {
        explosionId,
        shotId: projectile.shotId,
        projectileId: projectile.id,
        weapon,
        x,
        y,
        damageScale: projectile.damageScale,
        blastScale: projectile.blastScale,
        terrainScale: projectile.terrainScale,
        directHitTankId,
      },
      this.terrain,
      this.state.tanks,
      shot,
    );
    this.state.tanks = outcome.tanks;
    this.state.explosions.push(outcome.explosion);
    for (const event of outcome.events) this.emit(event);

    const damage = outcome.events.flatMap((event) =>
      event.type === 'tank-damaged'
        ? [`${event.tankId === 'player1' ? 'P1' : 'P2'} -${event.amount}`]
        : [],
    );
    if (damage.length > 0) this.state.message = damage.join('  ');

    if (this.state.tanks.some((tank) => tank.health <= 0)) {
      this.endMatch();
      return;
    }
    const repeat = projectile.generation === 0 ? weapon.explosion.repeat : undefined;
    if (repeat !== undefined) {
      const count = shot.reserveProjectiles(repeat.count);
      const rng = new SeededRandom(
        projectile.shotId * 1709 + projectile.id * 37 + this.terrainSeed,
      );
      for (let i = 0; i < count && this.shot !== undefined; i++) {
        const dx = ((i + 0.5) / count - 0.5) * repeat.spread * 2;
        const px = Math.max(0, Math.min(this.terrain.width, x + dx));
        const py = repeat.vertical
          ? y + rng.next() * repeat.spread
          : sampleMutableSurfaceY(this.terrain, px) - 2;
        this.detonate(
          { ...projectile, id: this.allocateProjectileId(), generation: 1, hasSpawned: true },
          px,
          py,
          undefined,
        );
      }
    }

    if (weapon.projectile.spawn?.trigger === 'impact' && !projectile.hasSpawned) {
      const childRadius = projectile.radius * weapon.projectile.spawn.radiusScale;
      const surfaceY = isInsideTerrainColumn(this.terrain, x)
        ? sampleMutableSurfaceY(this.terrain, x)
        : Infinity;
      const children = spawnChildren(
        projectile,
        weapon,
        'impact',
        { x, y: Math.min(y, surfaceY - childRadius - 1) },
        shot,
        () => this.allocateProjectileId(),
      );
      if (children.length > 0) {
        this.spawnQueue.push(...children);
        for (const child of children) this.recordMotion(child);
        this.emit({
          type: 'projectile-spawned',
          parentId: projectile.id,
          childIds: children.map((child) => child.id),
          trigger: 'impact',
          x: children[0]!.x,
          y: children[0]!.y,
        });
      }
    }
  }

  private endMatch(): void {
    if (this.state.phase === 'game-over') return;
    const [player1, player2] = this.state.tanks;
    this.state.phase = 'game-over';
    this.state.winnerId =
      player1.health <= 0 && player2.health <= 0
        ? undefined
        : player1.health > 0
          ? 'player1'
          : 'player2';
    this.state.message =
      this.state.winnerId === undefined
        ? 'DRAW — both tanks disabled.'
        : `${this.state.winnerId === 'player1' ? 'PLAYER 1' : 'PLAYER 2'} WINS!`;
    for (const tank of this.state.tanks) {
      if (tank.health <= 0)
        this.emit({ type: 'tank-destroyed', tankId: tank.playerId, x: tank.x, y: tank.groundY });
    }
    this.emit({ type: 'match-ended', winnerId: this.state.winnerId });
  }

  /** After the match ends, no remaining warhead may move, detonate, or spawn. */
  private cancelShot(): void {
    if (this.state.projectiles.length > 0) {
      this.expireAll(this.state.projectiles, 'match-ended');
      this.state.projectiles = [];
    }
    this.spawnQueue = [];
    this.shot = undefined;
  }

  private finishTurn(): void {
    this.shot = undefined;
    if (this.state.tanks.some((tank) => tank.health <= 0)) {
      this.endMatch();
      return;
    }

    this.state.activePlayerId = this.state.activePlayerId === 'player1' ? 'player2' : 'player1';
    this.state.turnNumber += 1;
    this.state.wind = this.windForTurn(this.state.turnNumber);
    this.state.phase = 'aiming';

    // The incoming player's previous selection may have been spent on their last shot.
    const next = this.activeTank;
    const selectedWeaponId = hasAmmo(next.inventory, next.selectedWeaponId)
      ? next.selectedWeaponId
      : (firstAvailableWeapon(next.inventory, this.weapons) ?? next.selectedWeaponId);
    this.replaceTank({
      ...next,
      selectedWeaponId,
      aim: {
        ...next.aim,
        angleDegrees: Math.min(next.aim.angleDegrees, this.maxElevationFor(selectedWeaponId)),
      },
      movementRemaining: TURN_MOVEMENT_ALLOWANCE,
    });
    const tracerNote =
      this.state.message.includes('units long') || this.state.message.includes('units short')
        ? this.state.message
        : '';
    this.state.message = `${next.playerId === 'player1' ? 'Player 1' : 'Player 2'} turn.${tracerNote ? ` ${tracerNote}` : ''}`;
    this.emit({
      type: 'turn-started',
      turnNumber: this.state.turnNumber,
      playerId: next.playerId,
      wind: this.state.wind,
    });
  }

  private expire(projectile: ProjectileState, reason: ExpiryReason): void {
    this.emit({ type: 'projectile-expired', projectileId: projectile.id, reason });
  }

  private expireAll(projectiles: readonly ProjectileState[], reason: ExpiryReason): void {
    for (const projectile of projectiles) this.expire(projectile, reason);
  }

  private windForTurn(turn: number): number {
    return this.windOverride ?? defaultWindForTurn(turn);
  }

  private allocateProjectileId(): number {
    const id = this.nextProjectileId;
    this.nextProjectileId += 1;
    return id;
  }

  private emit(event: CombatEvent): void {
    this.pendingEvents.push(event);
  }

  private replaceTank(replacement: TankState): void {
    this.state.tanks[replacement.playerId === 'player1' ? 0 : 1] = replacement;
  }
}
