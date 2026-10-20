import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

test('a scout team is sent to the Hubland-Center from the map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGame(page);
  // a finished scout post on a free cell, and the technology behind it
  await page.evaluate(() => {
    const s = (window as any).__game.s;
    const used = new Set(s.buildings.map((b: any) => b.cell));
    let cell = 0;
    while (used.has(cell)) cell++;
    s.buildings.push({ id: s.nextId++, type: 'kundschafter', cell, built: 1, workers: [], on: true });
    s.research.done.push('kundschafter');
  });

  await page.getByRole('button', { name: 'Karte', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Karte' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Hubland-Center' }).click();
  await expect(sheet).toContainText('Die Kaufhalle der Amerikaner');
  await expect(sheet).toContainText('unbekannt, erst nach der Erkundung');
  await sheet.getByRole('button', { name: 'Trupp losschicken' }).click();

  await expect.poll(() => page.evaluate(() => (window as any).__game.s.expeditions.length)).toBe(1);
  await expect(sheet).toContainText('Hubland-Center · 4 Leute');

  // the surroundings: locked until three places in the city are explored
  await sheet.getByRole('button', { name: 'Umland', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Rhön · Wasserkuppe' })).toBeVisible();
  expect(errors).toEqual([]);
});
