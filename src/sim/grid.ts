// Radial city grid around the boiler: rings of annular cells, like a crater city.
export const CRATER_RADIUS = 84; // radius of the boiler plaza
export const RING_WIDTH = 58;
export const RINGS = 7;
const TARGET_ARC = 68;

export interface Cell {
  id: number;
  ring: number; // 1..RINGS
  idx: number;
  a0: number; // start angle (rad)
  a1: number;
  r0: number;
  r1: number;
  x: number; // centre
  y: number;
}

export function cellsInRing(ring: number): number {
  const rMid = CRATER_RADIUS + RING_WIDTH * (ring - 0.5);
  return Math.max(6, Math.round((2 * Math.PI * rMid) / TARGET_ARC));
}

export function buildGrid(): Cell[] {
  const cells: Cell[] = [];
  for (let ring = 1; ring <= RINGS; ring++) {
    const n = cellsInRing(ring);
    const r0 = CRATER_RADIUS + RING_WIDTH * (ring - 1);
    const r1 = r0 + RING_WIDTH;
    // offset alternate rings so the pattern does not form straight spokes
    const off = ring % 2 === 0 ? Math.PI / n : 0;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * Math.PI * 2;
      const a1 = off + ((i + 1) / n) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const rm = (r0 + r1) / 2;
      cells.push({ id: cells.length, ring, idx: i, a0, a1, r0, r1, x: Math.cos(am) * rm, y: Math.sin(am) * rm });
    }
  }
  return cells;
}

export const GRID: readonly Cell[] = buildGrid();

export function normAngle(a: number): number {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

/** The cell containing a world point, or null (plaza or outside). */
export function cellAt(x: number, y: number): Cell | null {
  const r = Math.hypot(x, y);
  if (r < CRATER_RADIUS) return null;
  const ring = Math.floor((r - CRATER_RADIUS) / RING_WIDTH) + 1;
  if (ring > RINGS) return null;
  const a = normAngle(Math.atan2(y, x));
  for (const c of GRID) {
    if (c.ring !== ring) continue;
    const a0 = normAngle(c.a0);
    const a1 = a0 + (c.a1 - c.a0);
    if ((a >= a0 && a < a1) || (a + Math.PI * 2 >= a0 && a + Math.PI * 2 < a1)) return c;
  }
  return null;
}

export function distance(a: Cell, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Direction of the city of Würzburg as seen from the Hubland: west (angle π). */
export const CITY_ANGLE = Math.PI;

export function angularDistance(a: number, b: number): number {
  const d = Math.abs(normAngle(a) - normAngle(b));
  return Math.min(d, Math.PI * 2 - d);
}
