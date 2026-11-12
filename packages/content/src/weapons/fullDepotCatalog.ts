import type { WeaponDefinition } from './WeaponDefinition';
import { ORIGINAL_DELUXE_CATALOG } from './originalDeluxeCatalog';
import { EXPANSION_CATALOG } from './expansionCatalog';

// User request (2026-11-10): the normal game roster is EVERY weapon on the official depot
// list — Original 30 + Deluxe 30 + all 13 expansion packs (134) = 194 weapons. Matches no
// longer draft from the full list directly; each draft seeds a random 20-weapon pool
// (see createRandomPoolDraftConfig in the simulation package). Practice mode still carries
// everything.
export const FULL_DEPOT_CATALOG: readonly WeaponDefinition[] = Object.freeze([
  ...ORIGINAL_DELUXE_CATALOG,
  ...EXPANSION_CATALOG,
]);
