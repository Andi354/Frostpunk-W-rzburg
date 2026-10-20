import { GRID, RINGS, RING_WIDTH, type Cell } from './grid';
import { def } from './data/buildings';
import type { GameState } from './types';
import { outsideTemp } from './weather';

export const HEAT_NAMES = ['Eisig', 'Sehr kalt', 'Kalt', 'Erträglich', 'Behaglich'] as const;
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export function hasTech(s: GameState, id: string): boolean {
  return s.research.done.includes(id);
}

export function genHeat(s: GameState): number {
  if (!s.gen.on) return 0;
  const base = [0, 20, 30, 40][s.gen.level] ?? 0;
  return base + (s.gen.overdrive ? 15 : 0) + (hasTech(s, 'rost') ? 5 : 0);
}

export function genRange(s: GameState): number {
  let r = 3;
  if (hasTech(s, 'fernwaerme1')) r += 2;
  if (hasTech(s, 'fernwaerme2')) r += 2;
  return Math.min(RINGS, r);
}

export function genCoalPerHour(s: GameState): number {
  if (!s.gen.on) return 0;
  let c = [0, 7, 11, 16][s.gen.level] ?? 0;
  if (s.gen.overdrive) c *= 1.5;
  if (hasTech(s, 'vorwaermer')) c *= 0.85;
  return c;
}

export function heaterBonus(s: GameState, cell: Cell): number {
  let bonus = 0;
  for (const b of s.buildings) {
    if (b.built < 1 || !b.on) continue;
    const d = def(b.type);
    if (!d.heat) continue;
    const c = GRID[b.cell];
    const r = (d.heatRadius ?? 1.6) * RING_WIDTH;
    if (Math.hypot(c.x - cell.x, c.y - cell.y) <= r) bonus = Math.max(bonus, d.heat + (hasTech(s, 'heizrohre') ? 10 : 0));
  }
  return bonus;
}

export function insulationAt(s: GameState, cellId: number): number {
  const b = s.buildings.find((x) => x.cell === cellId && x.built >= 1);
  if (!b) return 0;
  const d = def(b.type);
  let ins = d.insulation;
  if (d.category === 'housing' && hasTech(s, 'daemmung')) ins += 10;
  if (d.category !== 'housing' && d.category !== 'pile' && d.category !== 'deposit' && hasTech(s, 'werkheizung')) ins += 10;
  return ins;
}

/** Effective temperature at a cell (°C). */
export function cellTemp(s: GameState, cellId: number, temp = outsideTemp(s.time)): number {
  const cell = GRID[cellId];
  let t = temp;
  if (cell.ring <= genRange(s)) t += genHeat(s);
  t += heaterBonus(s, cell);
  t += insulationAt(s, cellId);
  return t;
}

/** Temperature on the boiler plaza, where the homeless huddle. */
export function plazaTemp(s: GameState, temp = outsideTemp(s.time)): number {
  return temp + genHeat(s) * 0.75;
}

export function heatLevel(t: number): HeatLevel {
  if (t < -30) return 0;
  if (t < -15) return 1;
  if (t < 0) return 2;
  if (t < 10) return 3;
  return 4;
}
