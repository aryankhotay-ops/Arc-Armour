import type { WeaponId } from '@artillery/content';

import type { WeaponInventory } from '../inventory/WeaponInventory';
import type { PlayerId, TankPlacement } from '../tanks/TankPlacement';

export type MatchPhase = 'aiming' | 'projectile' | 'resolving' | 'game-over';

export interface AimState {
  /** Degrees above the tank's forward horizon, clamped to 5..85. */
  angleDegrees: number;
  /** Fraction of the weapon's launch speed, clamped to 0.2..1. */
  power: number;
}

export interface TankState extends TankPlacement {
  health: number;
  movementRemaining: number;
  aim: AimState;
  selectedWeaponId: WeaponId;
  inventory: WeaponInventory;
}

/**
 * flying   – ballistic flight with swept terrain/tank collision.
 * stuck    – sticky charge waiting on its fuse, attached to terrain or to a tank.
 * drilling – burrowing straight down toward its detonation depth.
 */
export type ProjectileMode = 'flying' | 'stuck' | 'drilling';

/** Optional, copied physics observations for rendering. Never read by game rules. */
export interface ProjectileMotionSample {
  readonly id: number;
  readonly weaponId: WeaponId;
  readonly x: number;
  readonly y: number;
  readonly ageSeconds: number;
  readonly mode: ProjectileMode;
}

export interface ProjectileState {
  launchDelay?: number;
  surfaceTravel?: number;
  travelDirection?: number;
  hopCount?: number;
  tunnelTravel?: number;
  rubberBounces?: number;
  id: number;
  shotId: number;
  ownerId: PlayerId;
  weaponId: WeaponId;
  /** 0 = launched warhead (may use weapon behaviours); 1 = spawned child (plain impact warhead). */
  generation: number;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  ageSeconds: number;
  radius: number;
  gravityScale: number;
  windScale: number;
  bouncesRemaining: number;
  hasSpawned: boolean;
  mode: ProjectileMode;
  fuseRemaining: number | undefined;
  /** Tank this warhead physically struck; only that tank receives the direct-hit bonus. */
  struckTankId: PlayerId | undefined;
  /** Sticky charge attachment in the stuck tank's hull-local space. */
  stuckLocalX: number;
  stuckLocalY: number;
  drillTargetY: number | undefined;
  /** This tank is ignored until `tankArmSeconds` (muzzle exit, or bomblets leaving a struck hull). */
  ignoredTankId: PlayerId | undefined;
  tankArmSeconds: number;
  damageScale: number;
  blastScale: number;
  terrainScale: number;
}

/** Presentation record of a resolved explosion; damage was applied once when it was created. */
export interface ExplosionState {
  id: number;
  shotId: number;
  weaponId: WeaponId;
  x: number;
  y: number;
  blastRadius: number;
  terrainRadius: number;
  ageSeconds: number;
  durationSeconds: number;
}

export interface DamageEvent {
  tankId: PlayerId;
  amount: number;
  cause: 'blast' | 'direct-hit' | 'fall';
  remainingHealth: number;
}

export interface MatchState {
  phase: MatchPhase;
  activePlayerId: PlayerId;
  turnNumber: number;
  wind: number;
  tanks: [TankState, TankState];
  projectiles: ProjectileState[];
  explosions: ExplosionState[];
  winnerId: PlayerId | undefined;
  message: string;
}
