import { expect, test } from '@playwright/test';
import { GRID } from '../../src/sim/grid';
import { startGame } from './helpers';

test('a staffed workshop starts Rostfeuerung from the Forschung sheet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGame(page);

  // a finished workshop on the first free ring-1 cell, staffed with five engineers
  const ring1 = GRID.filter((c) => c.ring === 1).map((c) => c.id);
  await page.evaluate((cells: number[]) => {
    const g = (window as any).__game;
    const s = g.s;
    const used = new Set(s.buildings.map((b: any) => b.cell));
    const b = { id: s.nextId++, type: 'werkstatt', cell: cells.find((c) => !used.has(c)), built: 1, workers: [] as number[], on: true };
    s.buildings.push(b);
    for (const p of s.people.filter((p: any) => p.kind === 'engineer').slice(0, 5)) {
      p.job = b.id;
      b.workers.push(p.id);
    }
    g.refresh();
  }, ring1);

  await page.getByRole('button', { name: /^Forschung/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Forschung' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Im Moment wird nichts erforscht');

  await sheet.locator('button.card', { has: page.locator('h3', { hasText: /^Rostfeuerung$/ }) }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__game.s.research.current)).toBe('rost');
  await expect(sheet).toContainText('0 % · noch');
  expect(errors).toEqual([]);
});
