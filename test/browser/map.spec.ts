import { expect, test } from '@playwright/test';
import { runHours, startGame } from './helpers';

test('title screen leads into the game with HUD and map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Würzburger/ })).toBeVisible();
  await page.getByRole('button', { name: 'Neues Spiel' }).click();
  await expect(page.locator('.clock')).toContainText('Tag 1');
  await expect(page.locator('.temp')).toContainText('°C');
  // the canvas has been painted (not a single flat colour)
  const varied = await page.evaluate(() => {
    const c = document.getElementById('map') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 997) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  });
  expect(varied).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('boiler sheet lights the boiler and coal burns', async ({ page }) => {
  await startGame(page);
  await page.getByRole('button', { name: 'Kessel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Der Kessel' })).toBeVisible();
  const coal0 = await page.evaluate(() => (window as any).__game.s.res.coal);
  const t0 = await page.evaluate(() => (window as any).__game.s.time);
  await page.getByRole('button', { name: 'Anheizen' }).click();
  await expect(page.getByRole('button', { name: 'Brennt' })).toBeVisible();
  await page.getByRole('button', { name: 'Stufe 2' }).click();
  await runHours(page, 3);
  const coal1 = await page.evaluate(() => (window as any).__game.s.res.coal);
  expect(coal1).toBeLessThan(coal0 - 20);
  const t1 = await page.evaluate(() => (window as any).__game.s.time);
  expect(t1 - t0).toBe(3);
});

test('heat view toggles and a tapped cell opens its sheet', async ({ page }) => {
  await startGame(page);
  await page.getByRole('button', { name: 'Wärmeansicht' }).click();
  await expect(page.getByRole('button', { name: 'Wärmeansicht' })).toHaveAttribute('aria-pressed', 'true');
  const box = await page.locator('#map').boundingBox();
  // tap a point on the first ring, right of the boiler
  const zoom = await page.evaluate(() => (window as any).__game.cam.zoom);
  await page.mouse.click(box!.x + box!.width / 2 + 113 * zoom, box!.y + box!.height / 2 + 4);
  await expect(page.locator('.sheet .sub')).toContainText('Ring 1');
});
