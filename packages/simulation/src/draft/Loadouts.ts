import type { WeaponDefinition, WeaponId } from '@artillery/content';

import type { PlayerId } from '../tanks/TankPlacement';

/**
 * The weapons each player brings into a match.
 * - `shared` is standard issue carried by both players (by default the unlimited Standard
 *   Shell, so a player can always fire). Shared weapons are never draftable.
 * - `player1` / `player2` are exclusive: no weapon may appear in both lists.
 */
export interface Loadouts {
  readonly shared: readonly WeaponId[];
  readonly player1: readonly WeaponId[];
  readonly player2: readonly WeaponId[];
}

export const loadoutIdsFor = (loadouts: Loadouts, playerId: PlayerId): WeaponId[] => [
  ...loadouts.shared,
  ...loadouts[playerId],
];

/** Returns every problem with a pair of loadouts; an empty list means they are valid. */
export const validateLoadouts = (
  loadouts: Loadouts,
  weapons: readonly WeaponDefinition[],
): string[] => {
  const errors: string[] = [];
  const known = new Map(weapons.map((weapon) => [weapon.id, weapon]));
  const owners = new Map<WeaponId, string>();

  const lists = [
    ['shared', loadouts.shared],
    ['player1', loadouts.player1],
    ['player2', loadouts.player2],
  ] as const;
  for (const [listName, ids] of lists) {
    for (const id of ids) {
      if (!known.has(id)) errors.push(`${listName}: unknown weapon "${id}"`);
      const previousOwner = owners.get(id);
      if (previousOwner === undefined) {
        owners.set(id, listName);
      } else if (previousOwner === listName) {
        errors.push(`${listName}: "${id}" is listed more than once`);
      } else {
        errors.push(`"${id}" cannot belong to both ${previousOwner} and ${listName}`);
      }
    }
  }

  for (const playerId of ['player1', 'player2'] as const) {
    const ids = loadoutIdsFor(loadouts, playerId);
    if (!ids.some((id) => known.get(id)?.ammo === 'unlimited')) {
      errors.push(`${playerId} must carry at least one unlimited weapon so they can always fire`);
    }
  }
  return errors;
};
