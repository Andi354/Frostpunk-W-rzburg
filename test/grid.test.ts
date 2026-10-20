import { describe, expect, it } from 'vitest';
import { CRATER_RADIUS, GRID, RINGS, RING_WIDTH, cellAt, cellsInRing } from '../src/sim/grid';

describe('radial grid', () => {
  it('has every ring fully covered by cells', () => {
    for (let r = 1; r <= RINGS; r++) {
      const cells = GRID.filter((c) => c.ring === r);
      expect(cells.length).toBe(cellsInRing(r));
      const span = cells.reduce((a, c) => a + (c.a1 - c.a0), 0);
      expect(span).toBeCloseTo(Math.PI * 2, 6);
    }
  });

  it('finds the cell under a world point', () => {
    for (const c of GRID) expect(cellAt(c.x, c.y)?.id).toBe(c.id);
  });

  it('returns null on the plaza and beyond the crater', () => {
    expect(cellAt(0, 0)).toBeNull();
    expect(cellAt(CRATER_RADIUS + RINGS * RING_WIDTH + 5, 0)).toBeNull();
  });
});
