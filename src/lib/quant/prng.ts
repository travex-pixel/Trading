/**
 * Deterministic pseudo-random number generation.
 *
 * Used for the synthetic demo dataset and the random-baseline competitor.
 * Never used for anything security related.
 */

/** mulberry32: small, fast, well-distributed 32-bit generator. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a 32-bit seed (FNV-1a). */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Standard normal via Box-Muller, driven by a uniform generator. */
export function makeGaussian(uniform: () => number): () => number {
  let spare: number | null = null;
  return function gaussian() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = uniform();
    while (v === 0) v = uniform();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    const z0 = mag * Math.cos(2.0 * Math.PI * v);
    spare = mag * Math.sin(2.0 * Math.PI * v);
    return z0;
  };
}
