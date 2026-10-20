// Deterministic RNG (mulberry32). The state lives in the game state so saves replay identically.
export interface RngHolder {
  rng: number;
}

export function nextRandom(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) | 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function chance(h: RngHolder, p: number): boolean {
  return nextRandom(h) < p;
}

export function randInt(h: RngHolder, min: number, max: number): number {
  return min + Math.floor(nextRandom(h) * (max - min + 1));
}

export function pick<T>(h: RngHolder, list: readonly T[]): T {
  return list[Math.floor(nextRandom(h) * list.length)];
}
