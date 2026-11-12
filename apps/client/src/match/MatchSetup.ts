import type { Loadouts } from '@artillery/simulation';

/** Data handed from the draft scene to the battlefield scene. */
export interface MatchSetup {
  readonly loadouts: Loadouts;
  readonly draftMode: 'chosen' | 'random' | 'mixed';
  /** Seed behind any random picks, so a dealt draft can be reproduced. */
  readonly seed: number;
}

/**
 * Draft seed. `?seed=N` in the URL makes random deals reproducible (used by browser tests and
 * for sharing a deal); otherwise a fresh seed is drawn. This is the only place the client
 * creates entropy; the deal itself is computed by the deterministic simulation package.
 */
export const resolveDraftSeed = (search: string = window.location.search): number => {
  const raw = new URLSearchParams(search).get('seed');
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  if (Number.isFinite(parsed)) return parsed >>> 0;
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
};

/** Terrain entropy is separate from weapon-deal randomness: a repeated draft seed must not
 * force the same landscape. Explicit ?terrainSeed=N is an opt-in reproducible map link.
 * Restart preserves the current map; new match/rematch uses this resolver for a fresh map.
 */
export const resolveTerrainSeed = (
  search: string = window.location.search,
  previous?: number,
): number => {
  const raw = new URLSearchParams(search).get('terrainSeed');
  if (raw !== null && /^\d+$/.test(raw) && Number(raw) <= 0xffff_ffff) return Number(raw) >>> 0;
  const next = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  return next === previous ? (next + 1) >>> 0 : next;
};
