import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

test('the Leute sheet shows the start population of 64', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGame(page);

  await page.getByRole('button', { name: 'Leute', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Leute' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('dt', { hasText: 'Einwohner' }).locator('xpath=following-sibling::dd[1]')).toHaveText('64');
  await expect(sheet.locator('dt', { hasText: 'Arbeiter' }).locator('xpath=following-sibling::dd[1]')).toHaveText('34');
  await expect(sheet).toContainText('Menschen ohne Dach');
  expect(errors).toEqual([]);
});
