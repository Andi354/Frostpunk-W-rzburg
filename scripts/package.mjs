// Copies the single-file build to dist/wuerzburger-kessel-<version>.html and removes older copies.
// Run after `vite build` (npm run package does both).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const src = join(root, 'build', 'index.html');
const dist = join(root, 'dist');
const name = `wuerzburger-kessel-${version}.html`;

if (!existsSync(src)) {
  console.error('build/index.html fehlt: erst `npm run build` ausführen.');
  process.exit(1);
}
mkdirSync(dist, { recursive: true });
for (const f of readdirSync(dist)) {
  if (/^wuerzburger-kessel-.*\.html$/.test(f) && f !== name) unlinkSync(join(dist, f));
}
copyFileSync(src, join(dist, name));
console.log(`dist/${name}`);
