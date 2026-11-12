import { describe, expect, it } from 'vitest';

import { WEAPON_CATALOG, type WeaponDefinition } from '@artillery/content';

import type { GameEngineOptions } from '../match/GameEngine';
import { WORLD_BOUNDS } from '../config/SimulationConfig';
import { MAX_DAMAGE_CAP_PER_SHOT } from '../weapons/validateWeapon';
import {
  flatSurface,
  netShotDamage,
  SWEEP_ANGLES,
  SWEEP_POWERS,
  withBump,
  withPit,
} from '../testing/harness';

// Empirical balance check. For every weapon, sweep angle × power in six battlefield situations
// and score two kinds of player:
//   expert – the single best shot available (perfect aim).
//   casual – the best 3×3 neighbourhood average, i.e. damage when the aim is slightly off.
// Then assert that no weapon dominates.

interface Scenario {
  readonly options: GameEngineOptions;
  readonly winds?: readonly number[];
}

const SCENARIOS: Record<string, Scenario> = {
  // Actual 2688-unit separation with real seeded cover, not the superseded center hump.
  long: { options: { terrainSeed: 4, wind: 0 } },
  // Tanks have driven to within 290 units on open ground.
  close: { options: { wind: 0, terrainSurface: flatSurface(940), player1X: 900, player2X: 1190 } },
  // The default map under three wind conditions, averaged.
  gusty: { options: { terrainSeed: 3 }, winds: [-30, 0, 30] },
  // Mid/close-range target dug into a steep-walled 120-unit pit: close-range
  // weapons need a second relevant situation, not five variants of a cross-map shot.
  bunker: {
    options: {
      wind: 0,
      terrainSurface: withPit(flatSurface(940), 910, 75, 24, 120),
      player2X: 910,
    },
  },
  // Tall cover that a flat-fire sniper cannot clear; ordinary lobs still have a solution.
  wall: {
    options: {
      wind: 0,
      terrainSurface: withBump(flatSurface(1300), WORLD_BOUNDS.width / 2, 125, 600),
      player1X: 256,
      player2X: WORLD_BOUNDS.width - 256,
    },
  },
  // Tanks at opposite map edges (3040 units).
  extreme: {
    options: {
      wind: 0,
      terrainSurface: flatSurface(940),
      player1X: 80,
      player2X: WORLD_BOUNDS.width - 80,
    },
  },
};

type Scores = Record<string, { expert: number; casual: number }>;

const sweep = (scenario: Scenario, weaponId: string): number[][] => {
  const winds = scenario.winds ?? [scenario.options.wind ?? 0];
  return SWEEP_ANGLES.map((angle) =>
    SWEEP_POWERS.map(
      (power) =>
        winds.reduce(
          (sum, wind) =>
            sum + netShotDamage({ weaponId, angle, power, engine: { ...scenario.options, wind } }),
          0,
        ) / winds.length,
    ),
  );
};

const casualScore = (grid: number[][]): number => {
  let best = -Infinity;
  for (let row = 1; row < grid.length - 1; row += 1) {
    for (let column = 1; column < (grid[0]?.length ?? 0) - 1; column += 1) {
      let sum = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) sum += grid[row + dr]?.[column + dc] ?? 0;
      }
      best = Math.max(best, sum / 9);
    }
  }
  return best;
};

const scoreArsenal = (): Record<string, Scores> => {
  const table: Record<string, Scores> = {};
  for (const weapon of WEAPON_CATALOG) {
    const scores: Scores = {};
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      const grid = sweep(scenario, weapon.id);
      scores[name] = { expert: Math.max(...grid.flat()), casual: casualScore(grid) };
    }
    table[weapon.id] = scores;
  }
  return table;
};

const winnersBy = (table: Record<string, Scores>, kind: 'expert' | 'casual'): string[] =>
  Object.keys(SCENARIOS).map((scenario) => {
    let bestId = '';
    let bestValue = -Infinity;
    for (const [id, scores] of Object.entries(table)) {
      const value = scores[scenario]?.[kind] ?? -Infinity;
      if (value > bestValue) {
        bestValue = value;
        bestId = id;
      }
    }
    return bestId;
  });

describe('weapon balance', () => {
  const table = scoreArsenal();

  it('has no weapon that wins every situation for both expert and casual aim', () => {
    const winners = [...winnersBy(table, 'expert'), ...winnersBy(table, 'casual')];
    const winCounts = new Map<string, number>();
    for (const id of winners) winCounts.set(id, (winCounts.get(id) ?? 0) + 1);
    // 12 situation/skill combinations; the most frequent winner takes at most a quarter.
    expect(Math.max(...winCounts.values()), JSON.stringify({ winners, table })).toBeLessThanOrEqual(
      3,
    );
    // At least five different weapons are the best choice somewhere.
    expect(winCounts.size).toBeGreaterThanOrEqual(5);
  });

  it('gives every situation a different set of top weapons', () => {
    const expertWinners = new Set(winnersBy(table, 'expert'));
    const casualWinners = new Set(winnersBy(table, 'casual'));
    expect(expertWinners.size).toBeGreaterThanOrEqual(3);
    expect(casualWinners.size).toBeGreaterThanOrEqual(3);
  });

  it('has no weapon that is strictly dominated by another', () => {
    // Weapon B dominates A if it scores at least as well in every situation, for both skill
    // levels, and also matches A's cratering, ammunition and wind resistance.
    const utility = (weapon: WeaponDefinition): number[] => [
      weapon.explosion.terrainRadius,
      weapon.ammo === 'unlimited' ? Number.MAX_SAFE_INTEGER : weapon.ammo,
      1 / Math.max(0.01, weapon.projectile.windScale),
    ];
    const vector = (weapon: WeaponDefinition): number[] => [
      ...Object.keys(SCENARIOS).flatMap((scenario) => {
        const scores = table[weapon.id]?.[scenario];
        return [scores?.expert ?? 0, scores?.casual ?? 0];
      }),
      ...utility(weapon),
    ];
    const dominated: string[] = [];
    for (const weapon of WEAPON_CATALOG) {
      const own = vector(weapon);
      for (const other of WEAPON_CATALOG) {
        if (other === weapon) continue;
        const theirs = vector(other);
        const atLeast = theirs.every((value, index) => value >= (own[index] ?? 0) - 0.5);
        const better = theirs.some((value, index) => value > (own[index] ?? 0) + 0.5);
        if (atLeast && better) dominated.push(`${weapon.id} by ${other.id}`);
      }
    }
    expect(dominated).toEqual([]);
  });

  it('makes every weapon viable: each deals real damage in at least two situations', () => {
    for (const weapon of WEAPON_CATALOG) {
      const viable = Object.values(table[weapon.id] ?? {}).filter((scores) => scores.expert >= 20);
      expect(viable.length, weapon.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('trades raw power for restrictions: heavy hitters have real blind spots', () => {
    // Heavy Shell cannot reach across the default map; Rail Punch cannot clear a wall.
    expect(table['heavy-shell']?.long?.expert).toBeLessThan(5);
    expect(table['rail-punch']?.wall?.expert).toBeLessThan(5);
    // Highest single-shot damage anywhere still cannot destroy a healthy tank.
    const peak = Math.max(
      ...Object.values(table).flatMap((s) => Object.values(s).map((v) => v.expert)),
    );
    expect(peak).toBeLessThanOrEqual(MAX_DAMAGE_CAP_PER_SHOT);
    expect(peak).toBeLessThan(50);
  });
}, 120_000);
