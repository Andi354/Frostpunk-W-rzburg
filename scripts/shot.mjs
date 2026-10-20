// Screenshot helper: node scripts/shot.mjs <out.png> [hours] [js-to-eval]
import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';

const [out, hours = '0', extra = ''] = process.argv.slice(2);
const srv = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch();
const page = await browser.newPage({ ...devices['Pixel 7'] });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:4174/');
await page.waitForTimeout(500);
if (hours !== 'title') {
  await page.getByRole('button', { name: 'Neues Spiel' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.evaluate((h) => { const g = window.__game; g.__advance(Number(h)); g.refresh(); }, hours);
  if (extra) await page.evaluate(extra);
}
await page.waitForTimeout(900);
await page.screenshot({ path: out, clip: process.env.CLIP ? JSON.parse(process.env.CLIP) : undefined });
await browser.close();
srv.kill();
