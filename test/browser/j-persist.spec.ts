import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

const KEY = 'wuerzburger-kessel-v1';

test('the game saves itself, continues after a reload, and the bar keeps its order', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGame(page);

  const labels = await page.locator('.bar button').evaluateAll((els) =>
    els.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')),
  );
  expect(labels).toEqual(['Bauen', 'Kessel', 'Leute', 'Forschung', 'Gesetze', 'Karte']);
  await expect(page.locator('.hint-bar')).toContainText('Kessel anheizen');

  // 7 game hours from the start: at least one autosave has run
  await page.evaluate(() => (window as any).__game.__advance(7));

  await page.reload();
  await expect(page.getByRole('button', { name: 'Fortsetzen (Tag 1)' })).toBeVisible();
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).time as number, KEY);
  expect(saved).toBeGreaterThanOrEqual(13);
  // a new game now asks first
  await page.getByRole('button', { name: 'Neues Spiel' }).click();
  await expect(page.getByRole('button', { name: 'Wirklich neu beginnen?' })).toBeVisible();
  // the game continues at the saved time: the tap and the read happen in the same step, before the clock runs on
  const t = await page.evaluate(() => {
    const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent === 'Fortsetzen (Tag 1)');
    b!.click();
    return (window as any).__game.s.time as number;
  });
  expect(t).toBe(saved);
  await expect(page.locator('.clock')).toContainText('Tag 1');
  expect(errors).toEqual([]);
});

test('the menu opens with the quick guide and the sound switch', async ({ page }) => {
  await startGame(page);
  await page.getByRole('button', { name: 'Menü' }).click();
  const menu = page.getByRole('dialog', { name: 'Menü' });
  await expect(menu).toBeVisible();
  await expect(menu.getByText('Kurzanleitung')).toBeVisible();
  // starting a game turns the sound on, so the switch offers to turn it off
  await menu.getByRole('button', { name: 'Ton aus' }).click();
  await expect(menu.getByRole('button', { name: 'Ton an' })).toBeVisible();
  await expect(menu.getByText('v0.1.0')).toBeVisible();
});
