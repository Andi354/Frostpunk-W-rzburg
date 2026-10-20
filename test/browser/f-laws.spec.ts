import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

test('signing Wassersuppe takes two taps and puts the law into force', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGame(page);

  await page.getByRole('button', { name: /^Gesetze/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Gesetze' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Bekanntmachung der Stadtverwaltung Würzburg-Hubland');

  const suppe = sheet.locator('button.card', { has: page.locator('h3', { hasText: /^Wassersuppe$/ }) });
  await expect(suppe).toContainText('Sofort: Unmut +2');
  await suppe.click();
  await expect(suppe).toContainText('Wirklich erlassen?');
  expect(await page.evaluate(() => (window as any).__game.s.laws.signed)).toEqual([]);

  await suppe.click();
  await expect.poll(() => page.evaluate(() => (window as any).__game.s.laws.signed)).toEqual(['suppe']);
  await expect(sheet).toContainText('Nächstes Gesetz in 18 h');
  expect(errors).toEqual([]);
});
