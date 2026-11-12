// Deterministic pseudo-random generator (mulberry32). Gameplay randomness — such as a random
// weapon draft — always flows through a seeded instance, so the same seed reproduces the same
// result locally, in tests, and later on the authoritative server. Never use Math.random().

export const normalizeSeed = (seed: number): number => Math.trunc(seed) >>> 0;

export class SeededRandom {
  private state: number;

  public constructor(seed: number) {
    this.state = normalizeSeed(seed);
  }

  /** Current internal state; a new generator built from it continues the same sequence. */
  public get snapshot(): number {
    return this.state;
  }

  /** Uniform float in [0, 1). */
  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** Uniform integer in [0, maxExclusive). */
  public int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error(`maxExclusive must be a positive integer, received ${maxExclusive}`);
    }
    return Math.floor(this.next() * maxExclusive);
  }

  /** Uniformly chosen element; throws on an empty list. */
  public pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) throw new Error('Cannot pick from an empty list');
    return item;
  }

  /** Fisher–Yates shuffle into a new array. */
  public shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = this.int(index + 1);
      const current = result[index] as T;
      result[index] = result[swap] as T;
      result[swap] = current;
    }
    return result;
  }
}
