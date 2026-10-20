// Phone-size QA screenshots: node scripts/qa-shots.mjs [outDir]  (needs `npm run build`; serves build/ with vite preview)
import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'design/updates/v0.1.0-grundspiel/screenshots';
mkdirSync(out, { recursive: true });
const srv = spawn('npx', ['vite', 'preview', '--port', '4175', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch();
const page = await browser.newPage({ ...devices['Pixel 7'] });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${name}.png` }); };
const game = (fn, arg) => page.evaluate(fn, arg);
const open = async (id) => { await game((i) => document.querySelector(`[data-act=open][data-arg=${i}]`).click(), id); await page.waitForTimeout(300); };
const closeSheet = () => game(() => { const g = window.__game; g.sheet = null; g.refresh(); });

await page.goto('http://127.0.0.1:4175/');
await page.waitForTimeout(600);
await shot('01-title');
await page.getByRole('button', { name: 'Neues Spiel' }).click();
await game(() => { window.__game.speed = 0; });
await shot('02-event-ankunft');
await game(() => { const g = window.__game; while (g.s.events.pending.length) g.s.events.pending.shift(); g.refresh(); });
await shot('03-first-hint');

// a settled mid-game: buildings, boiler on, some workers
await game(() => {
  const g = window.__game, s = g.s;
  const add = (type, cell, built = 1) => { s.buildings.push({ id: s.nextId++, type, cell, built, workers: [], on: true }); };
  s.gen.on = true; s.res.coal = 220; s.res.rations = 90; s.res.wood = 80; s.res.food = 60; s.res.steel = 30; s.res.bricks = 40; s.res.parts = 4;
  const used = new Set(s.buildings.map((b) => b.cell));
  const free = [...Array(60).keys()].filter((c) => !used.has(c));
  const types = ['zelt', 'zelt', 'zelt', 'kueche', 'werkstatt', 'sanitaet', 'jagdhuette', 'waermestube', 'zelt', 'lazarett', 'nissen'];
  types.forEach((t, i) => free[i] !== undefined && add(t, free[i], i === 10 ? 0.4 : 1));
  g.__advance(2); g.s.events.pending.length = 0; g.refresh();
});
await shot('04-map-day');
await game(() => { const g = window.__game; g.__advance(14); g.s.events.pending.length = 0; g.refresh(); });
await shot('05-map-night');
await game(() => { window.__game.heatView = true; window.__game.refresh(); });
await shot('06-map-heat');
await game(() => { window.__game.heatView = false; window.__game.refresh(); });
for (const [n, label] of [['07-bauen', 'bauen'], ['08-kessel', 'boiler'], ['09-leute', 'leute'], ['10-forschung', 'forschung'], ['11-gesetze', 'gesetze']]) {
  await open(label); await shot(n); await closeSheet();
}
await open('karte'); await shot('12-karte-stadt');
await game(() => { const g = window.__game; g.sheet = { kind: 'karte', tab: 'umland' }; g.refresh(); });
await shot('13-karte-umland');
await closeSheet();
// event document
await game(() => { const g = window.__game; g.s.time = 24 + 8; g.__advance(2); g.refresh(); });
await shot('14-event-spaeter');
await game(() => { const g = window.__game; while (g.s.events.pending.length) g.s.events.pending.shift(); g.refresh(); });
// menu
await game(() => document.querySelector('.fab-col button:first-child').click()); await shot('15-menu'); await closeSheet();
// bilanz
await game(() => { const g = window.__game; g.s.outcome = 'won'; g.refresh(); });
await shot('16-bilanz');
await browser.close();
srv.kill();
