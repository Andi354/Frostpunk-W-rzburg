import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: { outDir: 'build', emptyOutDir: true },
  test: { include: ['test/**/*.test.ts'], exclude: ['test/browser/**'] },
} as any);
