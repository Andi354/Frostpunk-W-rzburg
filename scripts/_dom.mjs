import { chromium, devices } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ ...devices['Pixel 7'] });
await page.goto('http://127.0.0.1:4175/');
await page.getByRole('button', { name: 'Neues Spiel' }).click();
await page.waitForTimeout(300);
console.log(await page.evaluate(() => ['.hud','.res-row','.status-row','.meters','.speed','.title','.clock'].map(s=>{const e=document.querySelector(s); if(!e) return s+' none'; const r=e.getBoundingClientRect(); return s+' '+Math.round(r.top)+' '+Math.round(r.height)+' '+getComputedStyle(e).overflow}).join('\n')));
await browser.close();
