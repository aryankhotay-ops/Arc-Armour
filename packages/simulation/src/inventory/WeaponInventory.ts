import type { AmmoSupply, WeaponDefinition, WeaponId } from '@artillery/content';

export type WeaponInventory = Readonly<Record<WeaponId, AmmoSupply>>;

/** An inventory lists only the weapons a player carries; anything else is not theirs. */
export const createInventory = (weapons: readonly WeaponDefinition[]): WeaponInventory =>
  Object.freeze(Object.fromEntries(weapons.map((weapon) => [weapon.id, weapon.ammo])));

/** True when the weapon is part of this player's loadout (even if its ammunition is spent). */
export const carries = (inventory: WeaponInventory, weaponId: WeaponId): boolean =>
  Object.hasOwn(inventory, weaponId);

export const ammoOf = (inventory: WeaponInventory, weaponId: WeaponId): AmmoSupply =>
  inventory[weaponId] ?? 0;

export const hasAmmo = (inventory: WeaponInventory, weaponId: WeaponId): boolean => {
  const ammo = ammoOf(inventory, weaponId);
  return ammo === 'unlimited' || ammo > 0;
};

/** Returns a new inventory with one round consumed. Unlimited weapons are never depleted. */
export const consumeAmmo = (inventory: WeaponInventory, weaponId: WeaponId): WeaponInventory => {
  const ammo = ammoOf(inventory, weaponId);
  if (ammo === 'unlimited') return inventory;
  if (ammo <= 0) throw new Error(`No ammunition left for ${weaponId}`);
  return Object.freeze({ ...inventory, [weaponId]: ammo - 1 });
};

/** First weapon in catalog order that can still be fired. */
export const firstAvailableWeapon = (
  inventory: WeaponInventory,
  weapons: readonly WeaponDefinition[],
): WeaponId | undefined => weapons.find((weapon) => hasAmmo(inventory, weapon.id))?.id;

/** Next fireable weapon in the given direction, skipping depleted entries and wrapping. */
export const cycleWeaponId = (
  inventory: WeaponInventory,
  weapons: readonly WeaponDefinition[],
  currentId: WeaponId,
  direction: -1 | 1,
): WeaponId | undefined => {
  const count = weapons.length;
  const start = weapons.findIndex((weapon) => weapon.id === currentId);
  for (let offset = 1; offset <= count; offset += 1) {
    const index = (((start + direction * offset) % count) + count) % count;
    const candidate = weapons[index];
    if (candidate !== undefined && hasAmmo(inventory, candidate.id)) return candidate.id;
  }
  return undefined;
};

export const formatAmmo = (ammo: AmmoSupply): string => (ammo === 'unlimited' ? '∞' : `${ammo}`);
