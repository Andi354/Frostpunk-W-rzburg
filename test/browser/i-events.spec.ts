import { expect, test } from '@playwright/test';

test('the arrival document is answered and the Bilanz shows the ending', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: 'Neues Spiel' }).click();

  // the first game hour queues the arrival note; time stops until a choice is made
  const doc = page.getByRole('dialog', { name: 'Ankunft' });
  await expect(doc).toBeVisible();
  await expect(doc).toContainText('Notiz im Heizwerk');
  await expect(doc.locator('.doc')).toContainText('Der Kessel braucht Kohle');
  await doc.getByRole('button', { name: 'An die Arbeit' }).click();
  await expect(doc).toBeHidden();

  // an ending shows the Bilanz with a way to a new game
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.s.outcome = 'won';
    g.refresh();
  });
  const bilanz = page.getByRole('dialog', { name: 'Bilanz' });
  await expect(bilanz).toBeVisible();
  await expect(bilanz).toContainText('Tage überlebt');
  await expect(bilanz.getByRole('button', { name: 'Neues Spiel' })).toBeVisible();
  expect(errors).toEqual([]);
});
