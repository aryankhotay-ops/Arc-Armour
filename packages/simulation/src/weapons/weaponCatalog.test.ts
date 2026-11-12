import { describe, expect, it } from 'vitest';

import { WEAPON_CATALOG } from '@artillery/content';

import { GameEngine } from '../match/GameEngine';
import { fireShot, findAim } from '../testing/harness';
import { assertValidArsenal, MAX_DAMAGE_CAP_PER_SHOT, validateWeapon } from './validateWeapon';

const EXPECTED_IDS = [
  'standard-shell',
  'heavy-shell',
  'cluster-bloom',
  'trident-shot',
  'ricochet-orb',
  'skyburst',
  'burrower',
  'landbreaker',
  'needle-dart',
  'time-capsule',
  'forking-star',
  'rail-punch',
];

describe('weapon catalog', () => {
  it('ships twelve unique, fully described original weapons', () => {
    expect(WEAPON_CATALOG.map((weapon) => weapon.id)).toEqual(EXPECTED_IDS);
    expect(new Set(WEAPON_CATALOG.map((weapon) => weapon.name)).size).toBe(12);
    expect(new Set(WEAPON_CATALOG.map((weapon) => weapon.icon)).size).toBe(12);
    for (const weapon of WEAPON_CATALOG) {
      expect(weapon.role.length).toBeGreaterThan(3);
      expect(weapon.description.length).toBeGreaterThan(20);
    }
  });

  it('passes validation and never allows a one-shot kill', () => {
    expect(() => assertValidArsenal(WEAPON_CATALOG)).not.toThrow();
    for (const weapon of WEAPON_CATALOG) {
      expect(validateWeapon(weapon)).toEqual([]);
      expect(weapon.damageCapPerShot).toBeLessThanOrEqual(MAX_DAMAGE_CAP_PER_SHOT);
    }
  });

  it('keeps Standard Shell as the single unlimited fallback', () => {
    const unlimited = WEAPON_CATALOG.filter((weapon) => weapon.ammo === 'unlimited');
    expect(unlimited.map((weapon) => weapon.id)).toEqual(['standard-shell']);
  });
});

describe('every weapon fires and resolves independently', () => {
  for (const weapon of WEAPON_CATALOG) {
    it(`${weapon.name}: launches, consumes one round, damages the target, and hands over the turn`, () => {
      // Find a real angle/power that lands on the opponent at the default spawn distance (or
      // from closer in for short-reach weapons), then verify the complete resolution.
      const engineOptions =
        weapon.id === 'heavy-shell' || weapon.id === 'landbreaker'
          ? { player1X: 560, player2X: 900 }
          : {};
      const aim = findAim(weapon.id, engineOptions, (result) => result.damageTo('player2'));
      expect(aim.score).toBeGreaterThan(0);

      const engine = new GameEngine({ wind: 0, ...engineOptions });
      expect(engine.selectWeapon(weapon.id)).toBe(true);
      const ammoBefore = engine.activeTank.inventory[weapon.id];
      engine.setAim(aim.angle, aim.power);
      expect(engine.fire()).toBe(true);

      expect(engine.state.projectiles).toHaveLength(weapon.launch.projectileCount);
      expect(engine.activeTank.inventory[weapon.id]).toBe(
        ammoBefore === 'unlimited' ? 'unlimited' : (ammoBefore as number) - 1,
      );

      const replay = fireShot({
        weaponId: weapon.id,
        angle: aim.angle,
        power: aim.power,
        engine: engineOptions,
      });
      expect(replay.damageTo('player2')).toBe(aim.score);
      expect(replay.damageTo('player2')).toBeLessThanOrEqual(weapon.damageCapPerShot);
      expect(replay.count('explosion')).toBeGreaterThan(0);
      expect(replay.engine.state.turnNumber).toBe(2);
      expect(replay.engine.state.activePlayerId).toBe('player2');
      expect(replay.engine.state.projectiles).toHaveLength(0);
    });
  }
});
