import type { WeaponId } from '@artillery/content';

import type { PlayerId } from '../tanks/TankPlacement';

export type ExpiryReason = 'out-of-bounds' | 'lifetime' | 'shot-timeout' | 'match-ended';
export type ContactTarget = 'terrain' | PlayerId;

/**
 * Authoritative simulation outcomes. The client consumes these for presentation; the future
 * server will broadcast them. They describe what happened and never drive game rules.
 */
export type CombatEvent =
  | {
      readonly type: 'shot-fired';
      readonly shotId: number;
      readonly playerId: PlayerId;
      readonly weaponId: WeaponId;
      readonly projectileIds: readonly number[];
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'projectile-bounced';
      readonly projectileId: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'projectile-spawned';
      readonly parentId: number;
      readonly childIds: readonly number[];
      readonly trigger: 'apex' | 'timer' | 'impact' | 'proximity';
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'projectile-stuck';
      readonly projectileId: number;
      readonly target: ContactTarget;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'projectile-drilling';
      readonly projectileId: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'tank-destroyed';
      readonly tankId: PlayerId;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'explosion';
      readonly explosionId: number;
      readonly shotId: number;
      readonly projectileId: number;
      readonly weaponId: WeaponId;
      readonly x: number;
      readonly y: number;
      readonly blastRadius: number;
      readonly terrainRadius: number;
      readonly directHitTankId: PlayerId | undefined;
    }
  | {
      readonly type: 'tank-damaged';
      readonly explosionId: number;
      readonly shotId: number;
      readonly tankId: PlayerId;
      readonly amount: number;
      readonly cause: 'blast' | 'direct-hit' | 'fall';
      readonly remainingHealth: number;
    }
  | {
      readonly type: 'terrain-deformed';
      readonly explosionId: number;
      readonly minX: number;
      readonly maxX: number;
    }
  | {
      readonly type: 'projectile-expired';
      readonly projectileId: number;
      readonly reason: ExpiryReason;
    }
  | {
      readonly type: 'turn-started';
      readonly turnNumber: number;
      readonly playerId: PlayerId;
      readonly wind: number;
    }
  | { readonly type: 'match-ended'; readonly winnerId: PlayerId | undefined };
