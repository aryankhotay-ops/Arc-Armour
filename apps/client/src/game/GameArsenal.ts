import { FULL_DEPOT_CATALOG, WEAPON_CATALOG } from '@artillery/content';

// User request (2026-11-10): normal game builds expose the FULL depot roster — Original 30 +
// Deluxe 30 + all 13 expansion packs (134) = 194 weapons. Drafts no longer browse the whole
// list: each match seeds a random 20-weapon pool (DRAFT_POOL_SIZE) that both players pick
// from; practice mode still carries everything. The prior 12-weapon catalog is retained
// solely as a deterministic regression fixture. It is never a menu choice or URL cheat.
// Only a non-production Vite test process can use it.
const legacyFixture = import.meta.env.DEV && import.meta.env.VITE_TEST_ARSENAL === 'legacy';
export const GAME_WEAPONS = legacyFixture ? WEAPON_CATALOG : FULL_DEPOT_CATALOG;
export const GAME_ARSENAL_ID = legacyFixture ? 'legacy-fixture' : 'full-depot';
export const DEFAULT_ROUND_NAME = GAME_WEAPONS.find((w) => w.ammo === 'unlimited')!.name;
/** Draftable weapons randomly offered per match. The legacy fixture pool is smaller. */
export const DRAFT_POOL_SIZE = 20;
