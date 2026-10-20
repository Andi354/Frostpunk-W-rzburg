import { expect, test } from '@playwright/test';
import { GRID } from '../../src/sim/grid';
import { runHours, startGame } from './helpers';

test('build a tent on a free cell, then open its construction sheet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGame(page);

  await page.getByRole('button', { name: 'Bauen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Bauen' })).toBeVisible();
  await page.getByRole('button', { name: /^Zelt/ }).click();
  await expect(page.locator('.banner')).toContainText('Freies Feld antippen');

  // the first valid cell is on ring 1, right next to the boiler; the camera is centred on the boiler
  const target = await page.evaluate(() => {
    const g = (window as any).__game;
    const id: number = [...g.validCells][0];
    return { id, cam: { x: g.cam.x, y: g.cam.y, zoom: g.cam.zoom, w: g.cam.w, h: g.cam.h } };
  });
  const cell = GRID[target.id];
  const box = (await page.locator('#map').boundingBox())!;
  const x = box.x + target.cam.w / 2 + (cell.x - target.cam.x) * target.cam.zoom;
  const y = box.y + target.cam.h / 2 + (cell.y - target.cam.y) * target.cam.zoom;

  await page.mouse.click(x, y);
  await expect.poll(() => page.evaluate(() => (window as any).__game.s.buildings.some((b: any) => b.type === 'zelt' && b.built === 0))).toBe(true);
  await expect(page.locator('.toast').first()).toContainText('Baustelle: Zelt');

  // housing keeps the placement mode on; leave it and open the cell
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await page.mouse.click(x, y);
  await expect(page.getByRole('dialog', { name: 'Zelt' })).toBeVisible();
  await expect(page.locator('.sheet')).toContainText('Baustelle');

  await runHours(page, 4);
  await expect(page.locator('.sheet')).toContainText('Bewohner');
  await expect(page.locator('.sheet')).toContainText('0 / 10');
  expect(errors).toEqual([]);
});
