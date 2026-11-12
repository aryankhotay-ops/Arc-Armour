import { describe, expect, it } from 'vitest';

import { WEAPON_CATALOG } from '@artillery/content';

import { GameEngine } from '../match/GameEngine';
import { arsenalWith, runUntilResolved, variant } from '../testing/harness';
import {
  consumeAmmo,
  createInventory,
  cycleWeaponId,
  firstAvailableWeapon,
  formatAmmo,
  hasAmmo,
} from './WeaponInventory';

describe('weapon inventory', () => {
  it('starts each player with the catalog ammunition counts', () => {
    const inventory = createInventory(WEAPON_CATALOG);
    for (const weapon of WEAPON_CATALOG) expect(inventory[weapon.id]).toBe(weapon.ammo);
  });

  it('decrements finite ammunition, never unlimited, and refuses to go negative', () => {
    let inventory = createInventory(WEAPON_CATALOG);
    inventory = consumeAmmo(inventory, 'rail-punch');
    expect(inventory['rail-punch']).toBe(1);
    inventory = consumeAmmo(inventory, 'rail-punch');
    expect(inventory['rail-punch']).toBe(0);
    expect(hasAmmo(inventory, 'rail-punch')).toBe(false);
    expect(() => consumeAmmo(inventory, 'rail-punch')).toThrow();
    for (let index = 0; index < 50; index += 1)
      inventory = consumeAmmo(inventory, 'standard-shell');
    expect(inventory['standard-shell']).toBe('unlimited');
  });

  it('returns new objects so previous snapshots are never mutated', () => {
    const before = createInventory(WEAPON_CATALOG);
    const after = consumeAmmo(before, 'heavy-shell');
    expect(before['heavy-shell']).toBe(3);
    expect(after['heavy-shell']).toBe(2);
    expect(Object.isFrozen(after)).toBe(true);
  });

  it('cycles in both directions, wraps, and skips depleted weapons', () => {
    let inventory = createInventory(WEAPON_CATALOG);
    expect(cycleWeaponId(inventory, WEAPON_CATALOG, 'standard-shell', 1)).toBe('heavy-shell');
    expect(cycleWeaponId(inventory, WEAPON_CATALOG, 'standard-shell', -1)).toBe('rail-punch');
    expect(cycleWeaponId(inventory, WEAPON_CATALOG, 'rail-punch', 1)).toBe('standard-shell');
    inventory = consumeAmmo(
      consumeAmmo(consumeAmmo(inventory, 'heavy-shell'), 'heavy-shell'),
      'heavy-shell',
    );
    expect(cycleWeaponId(inventory, WEAPON_CATALOG, 'standard-shell', 1)).toBe('cluster-bloom');
  });

  it('formats unlimited ammunition with an infinity sign', () => {
    expect(formatAmmo('unlimited')).toBe('∞');
    expect(formatAmmo(3)).toBe('3');
    expect(firstAvailableWeapon(createInventory(WEAPON_CATALOG), WEAPON_CATALOG)).toBe(
      'standard-shell',
    );
  });
});

describe('selection and firing through the engine', () => {
  it('selects every weapon directly and by cycling through all twelve', () => {
    const engine = new GameEngine({ wind: 0 });
    for (const weapon of WEAPON_CATALOG) {
      expect(engine.selectWeapon(weapon.id)).toBe(true);
      expect(engine.activeTank.selectedWeaponId).toBe(weapon.id);
    }
    engine.selectWeapon('standard-shell');
    const visited = new Set<string>([engine.activeTank.selectedWeaponId]);
    for (let index = 0; index < WEAPON_CATALOG.length - 1; index += 1) {
      expect(engine.cycleWeapon(1)).toBe(true);
      visited.add(engine.activeTank.selectedWeaponId);
    }
    expect(visited.size).toBe(12);
    engine.cycleWeapon(1);
    expect(engine.activeTank.selectedWeaponId).toBe('standard-shell');
  });

  it('rejects unknown weapon ids and depleted weapons', () => {
    const engine = new GameEngine({ wind: 0 });
    expect(engine.selectWeapon('not-a-weapon')).toBe(false);
    expect(engine.activeTank.selectedWeaponId).toBe('standard-shell');
  });

  it('cannot fire a depleted weapon, and auto-reselects a fireable one next turn', () => {
    const engine = new GameEngine({ wind: 0 });
    for (let round = 0; round < 2; round += 1) {
      // Player 1 spends Rail Punch; player 2 fires a Standard Shell in between.
      expect(engine.selectWeapon('rail-punch')).toBe(true);
      expect(engine.fire()).toBe(true);
      runUntilResolved(engine);
      engine.fire();
      runUntilResolved(engine);
    }
    expect(engine.activeTank.playerId).toBe('player1');
    expect(engine.activeTank.inventory['rail-punch']).toBe(0);
    expect(engine.selectWeapon('rail-punch')).toBe(false);
    // The spent selection fell back to the first fireable weapon.
    expect(engine.activeTank.selectedWeaponId).toBe('standard-shell');
  });

  it('keeps each player’s ammunition separate', () => {
    const engine = new GameEngine({ wind: 0 });
    engine.selectWeapon('heavy-shell');
    engine.fire();
    runUntilResolved(engine);
    expect(engine.state.tanks[0].inventory['heavy-shell']).toBe(2);
    expect(engine.state.tanks[1].inventory['heavy-shell']).toBe(3);
  });

  it('locks selection, aiming, movement and firing while a shot is in flight', () => {
    const engine = new GameEngine({ wind: 0 });
    engine.selectWeapon('time-capsule');
    engine.fire();
    const snapshot = JSON.stringify(engine.activeTank);
    expect(engine.selectWeapon('heavy-shell')).toBe(false);
    expect(engine.cycleWeapon(1)).toBe(false);
    expect(engine.fire()).toBe(false);
    engine.setAim(10, 0.3);
    engine.adjustAim(5, 0.1);
    engine.aimAtPoint(900, 200);
    engine.moveActiveTank(40);
    expect(JSON.stringify(engine.activeTank)).toBe(snapshot);
  });

  it('applies a flat-fire weapon’s elevation limit on selection and while aiming', () => {
    const engine = new GameEngine({ wind: 0 });
    engine.setAim(70, 0.8);
    engine.selectWeapon('rail-punch');
    expect(engine.activeTank.aim.angleDegrees).toBe(30);
    engine.setAim(80, 0.8);
    expect(engine.activeTank.aim.angleDegrees).toBe(30);
    engine.selectWeapon('standard-shell');
    engine.setAim(80, 0.8);
    expect(engine.activeTank.aim.angleDegrees).toBe(80);
  });

  it('accepts a brand-new weapon purely as data, with no engine changes', () => {
    const mortar = variant('heavy-shell', {
      id: 'test-mortar',
      ammo: 1,
      launch: { speed: 300 },
      explosion: { blastRadius: 30, terrainRadius: 90, maxDamage: 10 },
    });
    const engine = new GameEngine({ wind: 0, weapons: arsenalWith(mortar) });
    expect(engine.selectWeapon('test-mortar')).toBe(true);
    expect(engine.fire()).toBe(true);
    const result = runUntilResolved(engine);
    expect(result.count('explosion')).toBe(1);
    expect(engine.state.tanks[0].inventory['test-mortar']).toBe(0);
  });

  it('rejects an invalid arsenal at construction with every problem listed', () => {
    const broken = variant('ricochet-orb', {
      projectile: { bounce: { count: 9, restitution: 1.2, minSpeed: -1 } },
    });
    expect(() => new GameEngine({ weapons: arsenalWith(broken) })).toThrow(
      /bounce\.count[\s\S]*restitution/,
    );
    expect(
      () => new GameEngine({ weapons: WEAPON_CATALOG.filter((w) => w.ammo !== 'unlimited') }),
    ).toThrow(/unlimited/);
  });
});
