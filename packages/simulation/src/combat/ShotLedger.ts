import { COMBAT_LIMITS } from '../config/SimulationConfig';
import type { PlayerId } from '../tanks/TankPlacement';

/**
 * Per-shot accounting that makes damage and spawning idempotent and bounded:
 * - each projectile detonates at most once,
 * - total damage to any one tank never exceeds the weapon's per-shot cap,
 * - the shot can never create more than COMBAT_LIMITS.maxProjectilesPerShot projectiles.
 */
export class ShotLedger {
  public readonly shotId: number;
  public readonly damageCap: number;
  public elapsedSeconds = 0;

  private readonly damageByTank: Record<PlayerId, number> = { player1: 0, player2: 0 };
  private readonly detonatedProjectiles = new Set<number>();
  private projectilesCreated = 0;

  public constructor(shotId: number, damageCap: number) {
    this.shotId = shotId;
    this.damageCap = Math.max(0, damageCap);
  }

  /** Records a projectile's detonation; returns false if that projectile already detonated. */
  public claimDetonation(projectileId: number): boolean {
    if (this.detonatedProjectiles.has(projectileId)) return false;
    this.detonatedProjectiles.add(projectileId);
    return true;
  }

  public get detonationCount(): number {
    return this.detonatedProjectiles.size;
  }

  /** Clamps a requested amount to the remaining cap for that tank and records it. */
  public applyDamage(tankId: PlayerId, requested: number): number {
    const remaining = Math.max(0, this.damageCap - this.damageByTank[tankId]);
    const granted = Math.max(0, Math.min(remaining, Math.round(requested)));
    this.damageByTank[tankId] += granted;
    return granted;
  }

  public damageDealtTo(tankId: PlayerId): number {
    return this.damageByTank[tankId];
  }

  /** Reserves up to `requested` projectile slots and returns how many were granted. */
  public reserveProjectiles(requested: number): number {
    const remaining = Math.max(0, COMBAT_LIMITS.maxProjectilesPerShot - this.projectilesCreated);
    const granted = Math.max(0, Math.min(remaining, Math.floor(requested)));
    this.projectilesCreated += granted;
    return granted;
  }

  public get totalProjectiles(): number {
    return this.projectilesCreated;
  }
}
