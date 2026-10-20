import type { Page } from '@playwright/test';

export async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: 'Neues Spiel' }).click();
  // the arrival document comes with the first hour and stops the game until it is answered
  await page.getByRole('dialog', { name: 'Ankunft' }).getByRole('button', { name: 'An die Arbeit' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
}

/** Run the simulation directly for a number of hours. */
export async function runHours(page: Page, hours: number): Promise<void> {
  await page.evaluate((h) => {
    const g = (window as any).__game;
    g.__advance(h);
    g.refresh();
  }, hours);
}
