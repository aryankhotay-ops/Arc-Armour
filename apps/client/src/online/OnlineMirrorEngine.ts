import { FULL_DEPOT_CATALOG } from '@artillery/content';
import type { AppliedCommandBody, PlayerSlot } from '@artillery/protocol';
import {
  GameEngine,
  MAX_POWER,
  MIN_POWER,
  MIN_ELEVATION_DEGREES,
  type AimState,
} from '@artillery/simulation';

import type { AppliedCommand, OnlineClient } from './OnlineClient';

// Deterministic mirror of the server's authoritative engine. Local input NEVER mutates
// this engine directly: every public input method is overridden to send an INTENT to the
// server, and only `applyServerCommand` (driven by the server's command-applied
// rebroadcasts) calls the real engine mutations. Both clients therefore replay the exact
// same accepted-command stream into engines built with identical options, so projectile
// trajectories, explosions and terrain changes are byte-identical on every screen while
// health/damage/results remain server-owned.

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/** Builds the exact engine options the server room uses; any drift breaks determinism. */
export const mirrorEngineOptions = (terrainSeed: number) =>
  ({ terrainSeed, weapons: FULL_DEPOT_CATALOG }) as const;

export class OnlineMirrorEngine extends GameEngine {
  /** Pending throttled intents; flushed by the scene clock to respect server rate limits. */
  private pendingAim: { angleDegrees: number; power: number } | undefined;
  private pendingMove = 0;
  private aimFlushAt = 0;
  private moveFlushAt = 0;

  public constructor(
    private readonly client: OnlineClient,
    public readonly localSlot: PlayerSlot,
    terrainSeed: number,
  ) {
    super({ ...mirrorEngineOptions(terrainSeed), captureProjectileMotion: true });
  }

  /** True when the mirror says the LOCAL player may act; the server re-validates anyway. */
  public get localTurn(): boolean {
    return this.state.activePlayerId === this.localSlot && this.acceptsInput;
  }

  /**
   * Aim as the local player currently intends it: the pending (not yet server-echoed)
   * intent when one exists, otherwise the confirmed mirror state. HUD sliders read this
   * so changing power right after angle sends both new values rather than reverting the
   * angle to the stale confirmed figure.
   */
  public override get intendedAim(): AimState {
    return this.pendingAim ?? this.activeTank.aim;
  }

  // -------------------------------------------------------------------------------------
  // Local input -> intents. Values are computed against mirror state so sliders and
  // pointer aiming feel normal, but nothing mutates until the server accepts it.
  // -------------------------------------------------------------------------------------

  public override setAim(angleDegrees: number, power: number): void {
    if (!this.localTurn) return;
    this.pendingAim = {
      angleDegrees: clamp(angleDegrees, MIN_ELEVATION_DEGREES, 85),
      power: clamp(power, MIN_POWER, MAX_POWER),
    };
  }

  public override adjustAim(angleDelta: number, powerDelta: number): void {
    const aim = this.intendedAim;
    this.setAim(aim.angleDegrees + angleDelta, aim.power + powerDelta);
  }

  public override aimAtPoint(worldX: number, worldY: number): void {
    if (!this.localTurn) return;
    // Reuse the engine's pointer math by probing a scratch copy is overkill; replicate the
    // absolute-aim outcome by letting the base class compute on the mirror, then convert
    // the result into an intent and roll the mirror back via the pending buffer only.
    const before = this.activeTank.aim;
    super.aimAtPoint(worldX, worldY);
    const after = this.activeTank.aim;
    if (after !== before) {
      // Revert the direct mutation; the server rebroadcast will reapply it identically.
      super.setAim(before.angleDegrees, before.power);
      this.pendingAim = { angleDegrees: after.angleDegrees, power: after.power };
    }
  }

  public override moveActiveTank(deltaX: number): void {
    if (!this.localTurn) return;
    this.pendingMove += deltaX;
  }

  public override selectWeapon(weaponId: string): boolean {
    if (!this.localTurn) return false;
    const exists = this.weapons.some((weapon) => weapon.id === weaponId);
    if (!exists) return false;
    this.client.sendIntent({ type: 'select-weapon', weaponId });
    return true;
  }

  public override cycleWeapon(direction: -1 | 1): boolean {
    if (!this.localTurn) return false;
    const carried = this.carriedWeapons(this.localSlot);
    const index = carried.findIndex((weapon) => weapon.id === this.activeTank.selectedWeaponId);
    const next = carried[(index + direction + carried.length) % carried.length];
    return next !== undefined && this.selectWeapon(next.id);
  }

  public override fire(): boolean {
    if (!this.localTurn) return false;
    this.flushIntents(0, true); // latest aim/move must reach the server before the shot
    // Fire carries the mirror's turn number: the server accepts at most one shot per
    // turn, so a double-tap or retried/delayed command can never launch a second volley.
    this.client.sendIntent({ type: 'fire', turn: this.state.turnNumber });
    return true;
  }

  /** Called once per frame by the scene: paces aim/move intents under the rate limit. */
  public flushIntents(now: number, force = false): void {
    if (this.pendingAim !== undefined && (force || now >= this.aimFlushAt)) {
      this.client.sendIntent({ type: 'aim', ...this.pendingAim });
      this.pendingAim = undefined;
      this.aimFlushAt = now + 80;
    }
    if (this.pendingMove !== 0 && (force || now >= this.moveFlushAt)) {
      const step = clamp(this.pendingMove, -40, 40);
      this.pendingMove = 0;
      this.client.sendIntent({ type: 'move', deltaX: step });
      this.moveFlushAt = now + 110;
    }
  }

  // -------------------------------------------------------------------------------------
  // Server-accepted commands -> real engine mutations (both mirrors, identical order).
  // -------------------------------------------------------------------------------------

  /** Returns false when the mirror is still resolving and the command must wait. */
  public applyServerCommand(applied: AppliedCommand): boolean {
    return this.applyCommandBody(applied.slot, applied.command);
  }

  private applyCommandBody(slot: PlayerSlot, command: AppliedCommandBody): boolean {
    if (!this.acceptsInput || this.state.activePlayerId !== slot) return false;
    switch (command.type) {
      case 'aim':
        super.setAim(command.angleDegrees, command.power);
        return true;
      case 'move':
        super.moveActiveTank(command.deltaX);
        return true;
      case 'select-weapon':
        super.selectWeapon(command.weaponId);
        return true;
      case 'fire':
        super.fire();
        return true;
    }
  }

  /**
   * Rebuilds this mirror's state after a reconnect by replaying the server's accepted
   * command log from match start. Between commands the engine settles exactly like the
   * live render loop, so the rebuilt state matches every other mirror byte for byte.
   */
  public replayCommandLog(
    log: readonly { readonly slot: PlayerSlot; readonly command: AppliedCommandBody }[],
  ): void {
    for (const entry of log) {
      for (let tick = 0; tick < 3600 && !this.applyCommandBody(entry.slot, entry.command); tick++) {
        this.update(1 / 60);
      }
    }
    // Settle any trailing shot so the mirror lands on the same turn as the server.
    for (let tick = 0; tick < 3600 && !this.acceptsInput && this.state.phase !== 'game-over'; tick++) {
      this.update(1 / 60);
    }
    this.drainEvents();
    this.drainProjectileMotion();
  }
}
