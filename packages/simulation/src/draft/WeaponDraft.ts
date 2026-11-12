import type { WeaponDefinition, WeaponId } from '@artillery/content';

import type { SeededRandom } from '../random/SeededRandom';
import type { PlayerId } from '../tanks/TankPlacement';
import { validateLoadouts, type Loadouts } from './Loadouts';

// Pre-match weapon draft. Players take turns claiming weapons from a shared pool; every claim
// is exclusive, so the two loadouts never contain the same drafted weapon. A draft can be
// completed by hand, one random pick at a time, or dealt entirely at random from a seed.
// Pure game logic: no Phaser or browser APIs, so the future server can run the same draft.

/** snake: A B B A A B …  (fairer for the second picker) · alternating: A B A B … */
export type DraftOrder = 'snake' | 'alternating';

export interface DraftConfig {
  /** Draftable weapon ids, in display order. */
  readonly pool: readonly WeaponId[];
  /** Standard-issue weapons both players carry; never draftable. */
  readonly shared: readonly WeaponId[];
  readonly picksPerPlayer: number;
  readonly firstPicker: PlayerId;
  readonly order: DraftOrder;
}

export type PickMethod = 'chosen' | 'random';

export interface DraftPick {
  /** Zero-based position in the pick order. */
  readonly index: number;
  readonly playerId: PlayerId;
  readonly weaponId: WeaponId;
  readonly method: PickMethod;
}

export type DraftRejection =
  'draft-complete' | 'not-your-turn' | 'unknown-weapon' | 'shared-weapon' | 'already-taken';

export type PickResult =
  | { readonly accepted: true; readonly pick: DraftPick }
  | {
      readonly accepted: false;
      readonly reason: DraftRejection;
      /** Set when the weapon is already owned. */
      readonly takenBy: PlayerId | undefined;
    };

export const otherPlayer = (playerId: PlayerId): PlayerId =>
  playerId === 'player1' ? 'player2' : 'player1';

/** Who picks at each position of the draft. */
export const draftPickOrder = (config: DraftConfig): PlayerId[] => {
  const first = config.firstPicker;
  const second = otherPlayer(first);
  return Array.from({ length: config.picksPerPlayer * 2 }, (_, index) => {
    const position = index % 2;
    if (config.order === 'alternating') return position === 0 ? first : second;
    const round = Math.floor(index / 2);
    return (round % 2 === 0) === (position === 0) ? first : second;
  });
};

/**
 * Default rules from a weapon catalog: unlimited weapons are standard issue for both players,
 * every other weapon is draftable; each player drafts up to five (bounded by half the pool).
 * Player 2 picks first because Player 1 fires the first shot of the match.
 */
export const createDefaultDraftConfig = (
  weapons: readonly WeaponDefinition[],
  overrides: Partial<DraftConfig> = {},
): DraftConfig => {
  const shared = weapons.filter((weapon) => weapon.ammo === 'unlimited').map((weapon) => weapon.id);
  const pool = weapons.filter((weapon) => weapon.ammo !== 'unlimited').map((weapon) => weapon.id);
  return {
    pool,
    shared,
    // Keep a readable ten-pick match even when the approved pool expands to 59.
    picksPerPlayer: Math.min(5, Math.floor(pool.length / 2)),
    firstPicker: 'player2',
    order: 'snake',
    ...overrides,
  };
};

/**
 * Draft config whose pool is a seeded random sample of the draftable catalog, in catalog
 * order. Used by the full-depot roster: instead of browsing all 190+ draftable weapons,
 * each match deals a fresh random selection (default 20) that both players draft from.
 * Same seed -> same pool, so the future authoritative server reproduces the deal.
 */
export const createRandomPoolDraftConfig = (
  weapons: readonly WeaponDefinition[],
  rng: SeededRandomSource,
  poolSize = 20,
  overrides: Partial<DraftConfig> = {},
): DraftConfig => {
  const base = createDefaultDraftConfig(weapons);
  const size = Math.max(2, Math.min(poolSize, base.pool.length));
  const sampled = new Set(rng.shuffle(base.pool).slice(0, size));
  const pool = base.pool.filter((id) => sampled.has(id));
  return {
    ...base,
    pool,
    picksPerPlayer: Math.min(5, Math.floor(pool.length / 2)),
    ...overrides,
  };
};

/** The subset of SeededRandom needed to deal a pool; keeps this module dependency-light. */
interface SeededRandomSource {
  shuffle<T>(items: readonly T[]): T[];
}

export const validateDraftConfig = (
  config: DraftConfig,
  weapons: readonly WeaponDefinition[],
): string[] => {
  const errors: string[] = [];
  const known = new Map(weapons.map((weapon) => [weapon.id, weapon]));
  const unique = (ids: readonly WeaponId[]): boolean => new Set(ids).size === ids.length;

  if (!(Number.isInteger(config.picksPerPlayer) && config.picksPerPlayer >= 1)) {
    errors.push('picksPerPlayer must be a positive integer');
  }
  if (!unique(config.pool)) errors.push('pool contains duplicate weapons');
  if (!unique(config.shared)) errors.push('shared contains duplicate weapons');
  for (const id of [...config.pool, ...config.shared]) {
    if (!known.has(id)) errors.push(`unknown weapon "${id}"`);
  }
  for (const id of config.shared) {
    if (config.pool.includes(id)) errors.push(`"${id}" cannot be both shared and draftable`);
  }
  if (config.pool.length < config.picksPerPlayer * 2) {
    errors.push(
      `pool has ${config.pool.length} weapons but the draft needs ${config.picksPerPlayer * 2}`,
    );
  }
  if (!config.shared.some((id) => known.get(id)?.ammo === 'unlimited')) {
    errors.push('shared must include an unlimited weapon so both players can always fire');
  }
  return errors;
};

export class WeaponDraft {
  public readonly config: DraftConfig;
  public readonly order: readonly PlayerId[];

  private readonly weaponOrder: readonly WeaponId[];
  private readonly weapons: readonly WeaponDefinition[];
  private readonly pickList: DraftPick[] = [];

  public constructor(config: DraftConfig, weapons: readonly WeaponDefinition[]) {
    const errors = validateDraftConfig(config, weapons);
    if (errors.length > 0)
      throw new Error(`Invalid draft configuration:\n- ${errors.join('\n- ')}`);
    this.config = config;
    this.weapons = weapons;
    this.weaponOrder = weapons.map((weapon) => weapon.id);
    this.order = Object.freeze(draftPickOrder(config));
  }

  public get picks(): readonly DraftPick[] {
    return this.pickList;
  }

  public get totalPicks(): number {
    return this.order.length;
  }

  public get isComplete(): boolean {
    return this.pickList.length >= this.order.length;
  }

  /** Whose turn it is to pick, or undefined once the draft is complete. */
  public get currentPicker(): PlayerId | undefined {
    return this.order[this.pickList.length];
  }

  /** Unclaimed pool weapons, in pool order. */
  public get available(): WeaponId[] {
    const taken = new Set(this.pickList.map((pick) => pick.weaponId));
    return this.config.pool.filter((id) => !taken.has(id));
  }

  /** Pool weapons nobody drafted (only meaningful once the draft is complete). */
  public get unclaimed(): WeaponId[] {
    return this.isComplete ? this.available : [];
  }

  public ownerOf(weaponId: WeaponId): PlayerId | 'shared' | undefined {
    if (this.config.shared.includes(weaponId)) return 'shared';
    return this.pickList.find((pick) => pick.weaponId === weaponId)?.playerId;
  }

  public pickOf(weaponId: WeaponId): DraftPick | undefined {
    return this.pickList.find((pick) => pick.weaponId === weaponId);
  }

  /** The player's drafted weapons, in the order they picked them. */
  public picksOf(playerId: PlayerId): WeaponId[] {
    return this.pickList.filter((pick) => pick.playerId === playerId).map((pick) => pick.weaponId);
  }

  /** Claims a weapon for a player. Rejected if it is not their turn or the weapon is taken. */
  public pick(playerId: PlayerId, weaponId: WeaponId, method: PickMethod = 'chosen'): PickResult {
    const reject = (reason: DraftRejection, takenBy?: PlayerId): PickResult => ({
      accepted: false,
      reason,
      takenBy,
    });
    if (this.isComplete) return reject('draft-complete');
    if (this.currentPicker !== playerId) return reject('not-your-turn');
    if (this.config.shared.includes(weaponId)) return reject('shared-weapon');
    if (!this.config.pool.includes(weaponId)) return reject('unknown-weapon');
    const owner = this.ownerOf(weaponId);
    if (owner === 'player1' || owner === 'player2') return reject('already-taken', owner);

    const pick: DraftPick = { index: this.pickList.length, playerId, weaponId, method };
    this.pickList.push(pick);
    return { accepted: true, pick };
  }

  /** Gives the current picker a uniformly random unclaimed weapon. */
  public pickRandom(rng: SeededRandom): PickResult {
    const picker = this.currentPicker;
    if (picker === undefined)
      return { accepted: false, reason: 'draft-complete', takenBy: undefined };
    return this.pick(picker, rng.pick(this.available), 'random');
  }

  /** Randomly fills every remaining pick, continuing the normal pick order. */
  public completeRandomly(rng: SeededRandom): DraftPick[] {
    const added: DraftPick[] = [];
    while (!this.isComplete) {
      const result = this.pickRandom(rng);
      if (!result.accepted) break;
      added.push(result.pick);
    }
    return added;
  }

  /** Removes the most recent pick and returns it, handing the turn back to that player. */
  public undo(): DraftPick | undefined {
    return this.pickList.pop();
  }

  public reset(): void {
    this.pickList.length = 0;
  }

  /** Final loadouts in catalog order. Throws if the draft is not complete. */
  public loadouts(): Loadouts {
    if (!this.isComplete) {
      throw new Error(
        `The draft is not complete (${this.pickList.length}/${this.totalPicks} picks)`,
      );
    }
    const byCatalog = (ids: readonly WeaponId[]): WeaponId[] =>
      [...ids].sort((a, b) => this.weaponOrder.indexOf(a) - this.weaponOrder.indexOf(b));
    const loadouts: Loadouts = {
      shared: byCatalog(this.config.shared),
      player1: byCatalog(this.picksOf('player1')),
      player2: byCatalog(this.picksOf('player2')),
    };
    const errors = validateLoadouts(loadouts, this.weapons);
    if (errors.length > 0)
      throw new Error(`Draft produced invalid loadouts:\n- ${errors.join('\n- ')}`);
    return loadouts;
  }
}

/** Deals a complete draft at random. The same config, weapons, and seed give the same deal. */
export const dealRandomDraft = (
  config: DraftConfig,
  weapons: readonly WeaponDefinition[],
  rng: SeededRandom,
): WeaponDraft => {
  const draft = new WeaponDraft(config, weapons);
  draft.completeRandomly(rng);
  return draft;
};
