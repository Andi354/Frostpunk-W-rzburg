import type { GameState, Resources, ResourceId } from './types';

export function hasLaw(s: GameState, id: string): boolean {
  return s.laws.signed.includes(id);
}

/** Working hours [start, end): 08–18, with the law 'notschicht' 08–22. */
export function workHours(s: GameState): [number, number] {
  return hasLaw(s, 'notschicht') ? [8, 22] : [8, 18];
}

export function hourOfDay(s: GameState): number {
  return Math.floor(s.time % 24);
}

export function isWorkHour(s: GameState): boolean {
  const [start, end] = workHours(s);
  const h = hourOfDay(s);
  return h >= start && h < end;
}

const entries = (cost: Partial<Resources>) => Object.entries(cost) as [ResourceId, number][];

export function canAfford(s: GameState, cost: Partial<Resources>): boolean {
  return entries(cost).every(([r, n]) => s.res[r] >= n);
}

export function pay(s: GameState, cost: Partial<Resources>): void {
  for (const [r, n] of entries(cost)) s.res[r] -= n;
}

export function refund(s: GameState, cost: Partial<Resources>, factor: number): void {
  for (const [r, n] of entries(cost)) s.res[r] += n * factor;
}
